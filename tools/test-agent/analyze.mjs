#!/usr/bin/env node
// Usage:
//   node tools/test-agent/analyze.mjs --base <ref> [--coverage] [--out file.json] [--markdown file.md]
//   node tools/test-agent/analyze.mjs --all [--package backend|frontend] [--coverage] [--out file.json] [--markdown file.md]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PACKAGES, classifySource, formatBranches, formatRanges, git, inRanges, isTestFile, listFiles, mapTests,
  packageOf, parseArgs, parseChangedLines, readJson, summarizeVitest, toRanges, uncoveredBranches, uncoveredLines, vitest,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.base && !args.all) {
  console.error('Pass --base <ref> for a pull request or --all for the whole codebase.');
  process.exit(2);
}

const root = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(root);
const outDir = '.test-agent';
mkdirSync(outDir, { recursive: true });

const mode = args.all ? 'all' : 'pr';
const mergeBase = args.all ? null : git(['merge-base', args.base, 'HEAD']).trim();

let candidates;
let changedTests = [];
if (mode === 'all') {
  candidates = Object.values(PACKAGES)
    .flatMap((p) => listFiles(p.src, (f) => /\.tsx?$/.test(f) && !isTestFile(f)))
    .map((file) => ({ file, status: 'existing' }));
} else {
  const entries = git(['diff', '--name-status', '-M', mergeBase, 'HEAD']).trim().split('\n').filter(Boolean);
  candidates = [];
  for (const entry of entries) {
    const parts = entry.split('\t');
    const status = parts[0][0];
    const file = parts.at(-1);
    if (status === 'D' || !packageOf(file)) continue;
    if (isTestFile(file)) changedTests.push(file);
    else candidates.push({ file, status: { A: 'added', M: 'modified', R: 'renamed' }[status] ?? status });
  }
}

if (args.package) candidates = candidates.filter((c) => packageOf(c.file) === args.package);

const testFilesByPackage = Object.fromEntries(Object.entries(PACKAGES).map(([name, p]) => [
  name, listFiles(p.dir, (f) => /\.test\.tsx?$/.test(f) && isTestFile(f)),
]));
const findTests = mapTests(Object.values(testFilesByPackage).flat(), (f) => readFileSync(f, 'utf8'));

const baseline = {};
const coverage = {};
const summaries = {};
const measured = new Set();
if (args.coverage) {
  const touched = new Set(candidates.map((c) => packageOf(c.file)).filter(Boolean));
  for (const name of touched) {
    const dir = PACKAGES[name].dir;
    const resultsFile = path.resolve(outDir, `${name}-results.json`);
    // Failing tests are an expected input here, so coverage must be written even when the run fails.
    const run = vitest(dir, ['--coverage', '--coverage.reportOnFailure', '--coverage.reporter=json', '--coverage.reporter=json-summary', '--reporter=json', `--outputFile=${resultsFile}`]);
    if (!existsSync(resultsFile)) throw new Error(`Vitest produced no results for ${name}:\n${run.stderr}`);
    baseline[name] = summarizeVitest(readJson(resultsFile));
    const finalFile = path.join(dir, 'coverage', 'coverage-final.json');
    const summaryFile = path.join(dir, 'coverage', 'coverage-summary.json');
    if (!existsSync(finalFile) || !existsSync(summaryFile)) {
      console.warn(`No coverage report for ${name}; continuing without coverage facts.`);
      continue;
    }
    measured.add(name);
    for (const [abs, data] of Object.entries(readJson(finalFile))) {
      coverage[path.relative(root, abs).replaceAll('\\', '/')] = data;
    }
    for (const [abs, data] of Object.entries(readJson(summaryFile))) {
      summaries[abs === 'total' ? `${name}:total` : path.relative(root, abs).replaceAll('\\', '/')] = { lines: data.lines.pct, branches: data.branches.pct };
    }
  }
}

const files = candidates.map(({ file, status }) => {
  const { testable, reason } = classifySource(file);
  const item = { file, package: packageOf(file), status, testable, skipReason: reason, tests: findTests(file) };
  if (!testable) return item;
  const changed = mode === 'all' ? null : parseChangedLines(git(['diff', '-U0', '-M', mergeBase, 'HEAD', '--', file]));
  item.changedLines = changed;
  if (args.coverage && !measured.has(item.package)) {
    item.lineCoverage = null;
    item.branchCoverage = null;
    item.uncoveredLines = 'unknown (no coverage report)';
    item.uncoveredBranches = 'unknown (no coverage report)';
  } else if (args.coverage) {
    const fileCoverage = coverage[file];
    const uncovered = fileCoverage ? uncoveredLines(fileCoverage) : null;
    item.lineCoverage = summaries[file]?.lines ?? (fileCoverage ? null : 0);
    item.branchCoverage = summaries[file]?.branches ?? (fileCoverage ? null : 0);
    item.uncoveredLines = uncovered ? toRanges(changed ? uncovered.filter((l) => inRanges(l, changed)) : uncovered) : 'not loaded by any test';
    // Every line can run while one side of a condition is never tested, so missed branches are a gap of their own.
    item.uncoveredBranches = fileCoverage ? uncoveredBranches(fileCoverage).filter((b) => !changed || inRanges(b.line, changed)) : [];
  }
  return item;
});

const testable = files.filter((f) => f.testable);
const failing = Object.values(baseline).reduce((sum, b) => sum + b.failed, 0);
const needsWork = (f) => mode === 'pr' || !Array.isArray(f.uncoveredLines) || f.uncoveredLines.length > 0 || f.uncoveredBranches?.length > 0;
const result = {
  mode,
  base: args.base ?? null,
  mergeBase,
  head: git(['rev-parse', 'HEAD']).trim(),
  baseline,
  totals: Object.fromEntries(Object.keys(baseline).map((n) => [n, summaries[`${n}:total`]])),
  files,
  changedTests,
  summary: { files: files.length, testable: testable.length, failingTests: failing, actionable: testable.filter(needsWork).length + failing },
};

const outFile = args.out ?? path.join(outDir, 'analysis.json');
writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
if (args.markdown) writeFileSync(args.markdown, toMarkdown(result));
console.log(`analysis: ${result.summary.testable} testable of ${result.summary.files} files, ${failing} failing tests, actionable=${result.summary.actionable} -> ${outFile}`);

function toMarkdown(r) {
  const lines = [`## Test agent analysis (${r.mode === 'all' ? 'whole codebase' : `changes since ${r.mergeBase.slice(0, 7)}`})`, ''];
  for (const [name, b] of Object.entries(r.baseline)) {
    const total = r.totals[name];
    lines.push(`- **${name}**: ${b.passed} passing, ${b.failed} failing, coverage ${total?.lines ?? '?'}% lines, ${total?.branches ?? '?'}% branches`);
    for (const f of b.failures.slice(0, 10)) lines.push(`  - failing: \`${path.basename(f.file)}\` ${f.test}: ${f.message}`);
  }
  if (r.changedTests.length) lines.push(`- Test files changed by the author: ${r.changedTests.map((t) => `\`${t}\``).join(', ')}`);
  const testable = r.files.filter((f) => f.testable);
  if (testable.length) {
    lines.push('', '| File | Existing tests | Changed lines | Uncovered lines | Missed branches (line, paths) | Lines / branches |', '|---|---|---|---|---|---|');
    const pct = (value) => (value != null ? `${value}%` : '?');
    for (const f of testable) {
      const uncovered = Array.isArray(f.uncoveredLines) ? formatRanges(f.uncoveredLines) || 'none' : f.uncoveredLines ?? '';
      const branches = Array.isArray(f.uncoveredBranches) ? formatBranches(f.uncoveredBranches) || 'none' : f.uncoveredBranches ?? '';
      const changed = f.changedLines ? formatRanges(f.changedLines) : 'all';
      const coverage = f.lineCoverage !== undefined ? `${pct(f.lineCoverage)} / ${pct(f.branchCoverage)}` : '';
      lines.push(`| \`${f.file}\` | ${f.tests.map((t) => `\`${path.basename(t)}\``).join(', ') || '-'} | ${changed} | ${uncovered} | ${branches} | ${coverage} |`);
    }
  }
  const skipped = Object.groupBy(r.files.filter((f) => !f.testable), (f) => f.skipReason);
  if (Object.keys(skipped).length) {
    lines.push('', '<details><summary>Not unit-testable</summary>', '');
    for (const [reason, group] of Object.entries(skipped)) lines.push(`- ${reason}: ${group.map((f) => `\`${f.file}\``).join(', ')}`);
    lines.push('', '</details>');
  }
  return `${lines.join('\n')}\n`;
}
