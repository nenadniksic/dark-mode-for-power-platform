import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../tools/contrast-check.mjs';

test('every themed text/surface pairing meets WCAG AA (AAA in high contrast)', () => {
  const { failures, report } = runChecks();
  assert.ok(report.length > 100, 'checks ran');
  assert.deepEqual(failures, []);
});
