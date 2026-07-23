import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const required = [
  'web/index.html',
  'web/src/main.js',
  'web/src/core/AgentClient.js',
  'web/src/core/GameState.js',
  'web/assets/manifest.js',
  'package.json',
  '.env.example',
  'netlify.toml',
];
const forbiddenSegments = new Set([
  '.claude', '_st_clone', 'node_modules', 'Library', 'Temp', 'obj', 'bin',
  'Logs', '_build_extracted', '_liquid-glass-extract', '_asset_probe',
]);
const forbiddenSuffixes = ['.bak', '.log', '.meta'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '_audit', 'node_modules'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(root, full).replaceAll('\\', '/'));
  }
  return out;
}

test('required public H5 files exist', () => {
  for (const file of required) {
    assert.equal(existsSync(join(root, file)), true, file);
  }
});

test('forbidden source and generated content is absent', () => {
  const files = walk(root);
  for (const file of files) {
    const parts = file.split('/');
    assert.equal(parts.some((part) => forbiddenSegments.has(part)), false, file);
    assert.equal(forbiddenSuffixes.some((suffix) => file.endsWith(suffix)), false, file);
    assert.equal(file.includes('/voice/_samples/'), false, file);
  }
});
