import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanPaths } from '../scripts/scan-secrets.mjs';

test('reports rule and path but never the suspected value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-scan-'));
  const suspected = ['sk', 'exampleSensitiveValue1234567890'].join('-');
  const file = join(dir, 'fixture.txt');
  writeFileSync(file, `key=${suspected}`);

  const issues = scanPaths([file]);

  assert.equal(issues[0].rule, 'provider_api_key');
  assert.equal(JSON.stringify(issues).includes(suspected), false);
});

test('allows documented placeholders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-scan-'));
  const file = join(dir, '.env.example');
  writeFileSync(file, 'DEEPSEEK_API_KEY=your_key_here');

  assert.deepEqual(scanPaths([file]), []);
});
