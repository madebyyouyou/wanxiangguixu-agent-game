import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAssets } from '../scripts/check-assets.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'portfolio-assets-'));
  mkdirSync(join(root, 'assets/audio'), { recursive: true });
  mkdirSync(join(root, 'assets/images/agent'), { recursive: true });
  writeFileSync(
    join(root, 'assets/manifest.js'),
    "export const AUDIO={click:'click.wav'}; export const IMAGE_LABELS={};",
  );
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'assets/audio/click.wav'), '');
  writeFileSync(join(root, 'index.html'), '<main></main>');
  return root;
}

test('reports missing referenced audio', async () => {
  const root = fixture();
  rmSync(join(root, 'assets/audio/click.wav'));

  assert.ok(
    (await checkAssets(root)).some((issue) => issue.code === 'missing_audio'),
  );
});

test('reports unreferenced audio', async () => {
  const root = fixture();
  writeFileSync(join(root, 'assets/audio/unused.wav'), '');

  assert.ok(
    (await checkAssets(root)).some((issue) => issue.code === 'unreferenced_audio'),
  );
});

test('reports duplicate Agent pose encodings', async () => {
  const root = fixture();
  writeFileSync(join(root, 'assets/images/agent/pose.png'), '');
  writeFileSync(join(root, 'assets/images/agent/pose.webp'), '');

  assert.ok(
    (await checkAssets(root)).some(
      (issue) => issue.code === 'duplicate_image_format',
    ),
  );
});
