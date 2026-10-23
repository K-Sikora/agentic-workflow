import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const PACKAGES = {
  backend: { dir: 'backend', src: 'backend/src/', prettier: false },
  frontend: { dir: 'frontend', src: 'frontend/src/', prettier: true },
};

// Files the agent may create or edit. Everything else is application code or config.
const TEST_PATTERNS = [
  /^backend\/tests\/.+\.ts$/,
  /^frontend\/src\/.+\.test\.tsx?$/,
  /^frontend\/src\/test\/.+\.tsx?$/,
];

// Mirrors the coverage excludes in backend/vitest.config.ts and frontend/vite.config.ts,
// plus process entry points that only wire things together.
const SKIP_RULES = [
  [/\.d\.ts$/, 'type declarations'],
  [/(^|\/)types\.ts$|\.types\.ts$/, 'types only'],
  [/(^|\/)index\.ts$/, 'barrel file'],
  [/\.(stories|styles|variants)\.tsx?$/, 'stories or styles'],
  [/\.constants\.ts$|(^|\/)constants\.tsx?$/, 'constants'],
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/^backend\/src\/main\.ts$|^frontend\/src\/main\.tsx$/, 'process entry point'],
  [/^frontend\/src\/design-system\//, 'excluded from coverage (design system)'],
  [/^frontend\/src\/test\//, 'test support'],
  [/^frontend\/src\/features\/todos\/api\/queryKeys\.ts$|^frontend\/src\/lib\/queryClient\.ts$/, 'excluded from coverage'],
];

export function packageOf(file) {
  return Object.keys(PACKAGES).find((name) => file.startsWith(`${PACKAGES[name].dir}/`)) ?? null;
}

export function isTestFile(file) {
  if (file.split(/[\\/]/).includes('..')) return false;
  return TEST_PATTERNS.some((pattern) => pattern.test(file));
}

export function classifySource(file) {
  const pkg = packageOf(file);
  if (!pkg || !file.startsWith(PACKAGES[pkg].src)) return { testable: false, reason: 'not application source' };
  if (isTestFile(file)) return { testable: false, reason: 'test file' };
  if (!/\.tsx?$/.test(file)) return { testable: false, reason: 'not TypeScript' };
  const rule = SKIP_RULES.find(([pattern]) => pattern.test(file));
  return rule ? { testable: false, reason: rule[1] } : { testable: true, reason: null };
}

// Line ranges added or changed on the new side of a `git diff -U0` for one file.
export function parseChangedLines(diff) {
  const ranges = [];
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count > 0) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

export function inRanges(line, ranges) {
  return ranges.some(([start, end]) => line >= start && line <= end);
}

// Module specifiers a test imports, split into real imports and vi.mock targets.
export function parseImports(source) {
  const mocked = new Set([...source.matchAll(/vi\.mock\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
  const imported = new Set();
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) imported.add(m[1]);
  return { imported: [...imported], mocked: [...mocked] };
}

export function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)).replace(/\.(js|ts|tsx)$/, '');
  return base;
}

function stripExtension(file) {
  return file.replace(/\.(ts|tsx)$/, '');
}

// Maps each source file to the test files that import it without mocking it.
export function mapTests(testFiles, readFile) {
  const map = new Map();
  for (const testFile of testFiles) {
    const { imported, mocked } = parseImports(readFile(testFile));
    const mockedTargets = new Set(mocked.map((s) => resolveSpecifier(testFile, s)));
    for (const specifier of imported) {
      const target = resolveSpecifier(testFile, specifier);
      if (!target || mockedTargets.has(target)) continue;
      if (!map.has(target)) map.set(target, []);
      map.get(target).push(testFile);
    }
  }
  return (sourceFile) => map.get(stripExtension(sourceFile)) ?? [];
}

// Uncovered source lines from an istanbul coverage-final.json entry. Like istanbul's line
// coverage, a statement counts for the line it starts on, and a line is covered if any statement on it ran.
export function uncoveredLines(fileCoverage) {
  const hits = new Map();
  for (const [id, count] of Object.entries(fileCoverage.s)) {
    const line = fileCoverage.statementMap[id].start.line;
    hits.set(line, Math.max(hits.get(line) ?? 0, count));
  }
  return [...hits].filter(([, count]) => count === 0).map(([line]) => line).sort((a, b) => a - b);
}

// Conditions where at least one path never ran, e.g. the `false` side of `a ? b : c`.
export function uncoveredBranches(fileCoverage) {
  const missed = [];
  for (const [id, counts] of Object.entries(fileCoverage.b ?? {})) {
    const unseen = counts.filter((count) => count === 0).length;
    if (!unseen) continue;
    const branch = fileCoverage.branchMap[id];
    missed.push({ line: branch.loc?.start?.line ?? branch.line, type: branch.type, missed: unseen, paths: counts.length });
  }
  return missed.sort((a, b) => a.line - b.line);
}

export function formatBranches(branches) {
  return branches.map((b) => `${b.line} (${b.missed}/${b.paths} ${b.type})`).join(', ');
}

export function toRanges(lines) {
  const ranges = [];
  for (const line of lines) {
    const last = ranges.at(-1);
    if (last && line === last[1] + 1) last[1] = line;
    else ranges.push([line, line]);
  }
  return ranges;
}

export function formatRanges(ranges) {
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}

export function git(args, options) {
  const result = run('git', args, options);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

export function listFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = path.posix.join(entry.parentPath.replaceAll('\\', '/'), entry.name);
    if (!full.includes('/node_modules/') && predicate(full)) out.push(full);
  }
  return out.sort();
}

// Runs Vitest through its own binary so it works the same on Linux CI and Windows.
export function vitest(pkgDir, args, { cwd = '.', env } = {}) {
  const dir = path.resolve(cwd, pkgDir);
  return run(process.execPath, [path.join(dir, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...args], { cwd: dir, env: env ?? safeEnv() });
}

// Test code is untrusted: never hand it tokens or keys from the job environment.
export function safeEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/TOKEN|SECRET|KEY|PASSWORD|AUTH|CREDENTIAL/i.test(key)) delete env[key];
  }
  return env;
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function summarizeVitest(report) {
  const failures = [];
  for (const file of report.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      if (test.status === 'failed') {
        failures.push({ file: file.name, test: test.fullName, message: (test.failureMessages?.[0] ?? '').split('\n')[0] });
      }
    }
    if (file.status === 'failed' && !(file.assertionResults ?? []).some((t) => t.status === 'failed')) {
      failures.push({ file: file.name, test: '(file)', message: (file.message ?? '').split('\n')[0] });
    }
  }
  return { passed: report.numPassedTests ?? 0, failed: report.numFailedTests ?? 0, failures };
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else args[key] = argv[++i];
  }
  return args;
}
