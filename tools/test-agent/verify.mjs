#!/usr/bin/env node
// Independent verification of test changes. The agent runs it as a self-check and CI runs it as the gate.
// Usage: node tools/test-agent/verify.mjs --since <ref> [--base <ref>] [--runs 3] [--policy-only] [--out file.json] [--markdown file.md]
//   --since        commit before the test changes; everything changed after it (committed or not) is checked
//   --base         PR base; tests are also run against the merge-base code to see which ones detect the change
//   --policy-only  only check which files changed, without installing or running anything
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PACKAGES, git, isTestFile, packageOf, parseArgs, readJson, run, safeEnv, summarizeVitest, vitest,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.since) {
  console.error('Pass --since <ref>: the commit before the test changes.');
  process.exit(2);
}
const runs = Number(args.runs ?? 3);
const root = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(root);
mkdirSync('.test-agent', { recursive: true });

const changes = [
  ...git(['diff', '--name-status', '--no-renames', args.since]).trim().split('\n').filter(Boolean).map((l) => l.split('\t')),
  ...git(['ls-files', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean).map((f) => ['A', f]),
].filter(([, file]) => !file.startsWith('.test-agent/'));

const report = { since: args.since, base: args.base ?? null, verdict: 'ok', reasons: [], files: [], packages: {}, detection: {} };
const block = (reason) => { report.verdict = 'blocked'; report.reasons.push(reason); };

for (const [status, file] of changes) {
  report.files.push({ file, status });
  if (status === 'D') block(`deleted \`${file}\`: removing tests is not allowed`);
  else if (!isTestFile(file)) block(`changed \`${file}\`: only test files may be changed`);
}
const testFiles = report.files.filter((f) => f.status !== 'D' && isTestFile(f.file)).map((f) => f.file);
if (!changes.length) report.verdict = 'no-changes';

// Policy is checked before anything from the change runs.
if (report.verdict === 'ok' && !args['policy-only']) {
  for (const name of new Set(testFiles.map(packageOf))) {
    const dir = PACKAGES[name].dir;
    const result = { typecheck: null, suite: null, format: null, flaky: [] };
    report.packages[name] = result;

    const tsc = run(process.execPath, [path.resolve(dir, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', dir], { env: safeEnv() });
    result.typecheck = tsc.status === 0 ? 'ok' : tsc.stdout.trim().split('\n').slice(0, 15).join('\n');
    if (tsc.status !== 0) block(`${name}: type errors`);

    const resultsFile = path.resolve('.test-agent', `verify-${name}.json`);
    vitest(dir, ['--reporter=json', `--outputFile=${resultsFile}`]);
    result.suite = existsSync(resultsFile) ? summarizeVitest(readJson(resultsFile)) : { passed: 0, failed: 1, failures: [{ test: '(suite)', message: 'Vitest did not run' }] };
    if (result.suite.failed) block(`${name}: ${result.suite.failed} failing test(s)`);

    const own = testFiles.filter((f) => packageOf(f) === name);
    if (PACKAGES[name].prettier) {
      const prettier = run(process.execPath, [path.resolve(dir, 'node_modules/prettier/bin/prettier.cjs'), '--check', ...own.map((f) => path.relative(dir, f))], { cwd: dir });
      result.format = prettier.status === 0 ? 'ok' : prettier.stdout.trim() || prettier.stderr.trim();
      if (prettier.status !== 0) block(`${name}: files are not formatted with Prettier`);
    }

    const specs = own.filter((f) => /\.test\.tsx?$/.test(f)).map((f) => path.relative(dir, f).replaceAll('\\', '/'));
    if (specs.length && !result.suite.failed) {
      for (let i = 1; i < runs; i++) {
        const out = path.resolve('.test-agent', `flaky-${name}-${i}.json`);
        vitest(dir, [...specs, '--sequence.shuffle', '--reporter=json', `--outputFile=${out}`]);
        const again = existsSync(out) ? summarizeVitest(readJson(out)) : { failed: 1, failures: [{ test: '(run)', message: 'Vitest did not run' }] };
        result.flaky.push(...again.failures.map((f) => f.test));
      }
      if (result.flaky.length) block(`${name}: tests failed on a repeated run (flaky): ${[...new Set(result.flaky)].join('; ')}`);
    }
  }
}

if (report.verdict === 'ok' && args.base && !args['policy-only']) report.detection = detectAgainstBase(git(['merge-base', args.base, args.since]).trim(), testFiles);

const outFile = args.out ?? '.test-agent/verify.json';
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
if (args.markdown) writeFileSync(args.markdown, toMarkdown(report));
console.log(`verify: ${report.verdict}${report.reasons.length ? `\n- ${report.reasons.join('\n- ')}` : ''}`);
process.exit(report.verdict === 'blocked' ? 1 : 0);

// Runs the new tests against the code before the change. A test that passes now but fails there checks the change.
function detectAgainstBase(sha, files) {
  const specs = files.filter((f) => /\.test\.tsx?$/.test(f));
  if (!specs.length) return {};
  const dir = mkdtempSync(path.join(os.tmpdir(), 'test-agent-base-'));
  const detection = {};
  const links = [];
  try {
    git(['worktree', 'add', '--detach', dir, sha]);
    for (const name of new Set(specs.map(packageOf))) {
      const pkg = PACKAGES[name].dir;
      const link = path.join(dir, pkg, 'node_modules');
      symlinkSync(path.resolve(pkg, 'node_modules'), link, 'junction');
      links.push(link);
      if (name === 'backend' && existsSync('backend/src/generated')) cpSync('backend/src/generated', path.join(dir, 'backend/src/generated'), { recursive: true });
      for (const file of files.filter((f) => packageOf(f) === name)) cpSync(file, path.join(dir, file));
      const own = specs.filter((f) => packageOf(f) === name);
      const out = path.join(dir, `.detect-${name}.json`);
      vitest(pkg, [...own.map((f) => path.relative(pkg, f).replaceAll('\\', '/')), '--reporter=json', `--outputFile=${out}`], { cwd: dir });
      const result = existsSync(out) ? readJson(out) : { testResults: [] };
      for (const spec of own) {
        const entry = result.testResults.find((r) => r.name.replaceAll('\\', '/').endsWith(spec));
        const tests = entry?.assertionResults ?? [];
        detection[spec] = entry && tests.length
          ? { total: tests.length, failOnBase: tests.filter((t) => t.status === 'failed').map((t) => t.fullName) }
          : { total: null, failOnBase: 'all (file cannot run on the base code)' };
      }
    }
  } finally {
    // Remove the links first: deleting the worktree must never reach the real node_modules through them.
    for (const link of links) unlinkSync(link);
    run('git', ['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
  }
  return detection;
}

function toMarkdown(r) {
  const icon = { ok: '✅', blocked: '❌', 'no-changes': '➖' }[r.verdict];
  const lines = [`## ${icon} Verification: ${r.verdict}`, ''];
  for (const reason of r.reasons) lines.push(`- ${reason}`);
  if (r.files.length) lines.push('', `Changed files: ${r.files.map((f) => `\`${f.file}\``).join(', ')}`);
  if (Object.keys(r.packages).length) {
    lines.push('', '| Package | Tests | Typecheck | Prettier | Repeated runs |', '|---|---|---|---|---|');
    for (const [name, p] of Object.entries(r.packages)) {
      const suite = p.suite ? `${p.suite.passed} passed, ${p.suite.failed} failed` : '-';
      lines.push(`| ${name} | ${suite} | ${p.typecheck === 'ok' ? 'ok' : 'errors'} | ${p.format ?? 'n/a'} | ${p.flaky.length ? 'flaky' : `stable (${runs}x)`} |`);
    }
    for (const p of Object.values(r.packages)) for (const f of p.suite?.failures ?? []) lines.push(`- failing: ${f.test}: ${f.message}`);
  }
  if (Object.keys(r.detection).length) {
    lines.push('', '| Test file | Tests | Fail on the code before the change |', '|---|---|---|');
    for (const [file, d] of Object.entries(r.detection)) {
      lines.push(`| \`${file}\` | ${d.total ?? '-'} | ${Array.isArray(d.failOnBase) ? d.failOnBase.length : d.failOnBase} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}
