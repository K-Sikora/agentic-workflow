import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifySource, formatRanges, isTestFile, mapTests, parseArgs, parseChangedLines, safeEnv, summarizeVitest, toRanges, uncoveredLines,
} from './lib.mjs';

test('only test files and test support are writable', () => {
  for (const file of ['backend/tests/router.test.ts', 'backend/tests/fixture.ts', 'frontend/src/lib/http.test.ts', 'frontend/src/App.test.tsx', 'frontend/src/test/setup.ts']) {
    assert.equal(isTestFile(file), true, file);
  }
  for (const file of ['backend/src/factory.ts', 'frontend/src/lib/http.ts', 'backend/package.json', 'backend/vitest.config.ts', '.github/workflows/ci.yml', 'tools/test-agent/lib.mjs', 'backend/tests/../src/main.ts']) {
    assert.equal(isTestFile(file), false, file);
  }
});

test('classifies source files the coverage config ignores as not testable', () => {
  assert.deepEqual(classifySource('backend/src/core/config.ts'), { testable: true, reason: null });
  assert.deepEqual(classifySource('frontend/src/features/todos/hooks/useTodosQuery.ts'), { testable: true, reason: null });
  assert.equal(classifySource('backend/src/main.ts').reason, 'process entry point');
  assert.equal(classifySource('backend/src/features/todos/types.ts').reason, 'types only');
  assert.equal(classifySource('frontend/src/design-system/components/Button/Button.tsx').testable, false);
  assert.equal(classifySource('frontend/src/features/todos/index.ts').reason, 'barrel file');
  assert.equal(classifySource('README.md').testable, false);
});

test('parses changed line ranges from a zero-context diff', () => {
  const diff = ['@@ -3,0 +4,2 @@', '+a', '+b', '@@ -10 +12 @@', '-x', '+y', '@@ -20,3 +23,0 @@', '-gone'].join('\n');
  assert.deepEqual(parseChangedLines(diff), [[4, 5], [12, 12]]);
});

test('maps sources to tests that import them, ignoring mocked modules', () => {
  const files = {
    'frontend/src/features/todos/TodosPage.test.tsx': "import { TodosPage } from './TodosPage'\nimport { useTodosQuery } from './hooks/useTodosQuery'\nvi.mock('./hooks/useTodosQuery', () => ({}))",
    'backend/tests/router.test.ts': "import { createTodosRouter } from '../src/features/todos/router.ts';",
  };
  const find = mapTests(Object.keys(files), (f) => files[f]);
  assert.deepEqual(find('frontend/src/features/todos/TodosPage.tsx'), ['frontend/src/features/todos/TodosPage.test.tsx']);
  assert.deepEqual(find('frontend/src/features/todos/hooks/useTodosQuery.ts'), []);
  assert.deepEqual(find('backend/src/features/todos/router.ts'), ['backend/tests/router.test.ts']);
});

test('lists uncovered lines from istanbul statement counts', () => {
  const coverage = {
    s: { 0: 1, 1: 0, 2: 0 },
    statementMap: { 0: { start: { line: 1 }, end: { line: 1 } }, 1: { start: { line: 3 }, end: { line: 4 } }, 2: { start: { line: 6 }, end: { line: 6 } } },
  };
  const lines = uncoveredLines(coverage);
  assert.deepEqual(lines, [3, 4, 6]);
  assert.equal(formatRanges(toRanges(lines)), '3-4, 6');
});

test('summarizes vitest json results, including files that fail to load', () => {
  const summary = summarizeVitest({
    numPassedTests: 2,
    numFailedTests: 1,
    testResults: [
      { name: 'a.test.ts', status: 'failed', assertionResults: [{ status: 'failed', fullName: 'a breaks', failureMessages: ['expected 1\nstack'] }] },
      { name: 'b.test.ts', status: 'failed', message: 'Cannot find module\nstack', assertionResults: [] },
    ],
  });
  assert.deepEqual(summary.failures, [
    { file: 'a.test.ts', test: 'a breaks', message: 'expected 1' },
    { file: 'b.test.ts', test: '(file)', message: 'Cannot find module' },
  ]);
});

test('strips credentials from the environment given to test processes', () => {
  process.env.ANTHROPIC_API_KEY = 'x';
  process.env.GITHUB_TOKEN = 'x';
  const env = safeEnv();
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.ok(env.PATH ?? env.Path);
});

test('parses flags with and without values', () => {
  assert.deepEqual(parseArgs(['--base', 'main', '--coverage', '--out', 'a.json']), { base: 'main', coverage: true, out: 'a.json' });
});
