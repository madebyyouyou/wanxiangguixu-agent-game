import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export async function checkAssets(webRoot) {
  const issues = [];
  const manifestPath = join(webRoot, 'assets', 'manifest.js');
  const manifest = await import(
    `${pathToFileURL(manifestPath).href}?check=${Date.now()}`
  );

  const audioDir = join(webRoot, 'assets', 'audio');
  const expectedAudio = new Set(Object.values(manifest.AUDIO));
  const actualAudio = new Set(
    readdirSync(audioDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );
  for (const file of expectedAudio) {
    if (!actualAudio.has(file)) {
      issues.push({ file: `assets/audio/${file}`, code: 'missing_audio' });
    }
  }
  for (const file of actualAudio) {
    if (!expectedAudio.has(file)) {
      issues.push({ file: `assets/audio/${file}`, code: 'unreferenced_audio' });
    }
  }

  const agentDir = join(webRoot, 'assets', 'images', 'agent');
  const formats = new Map();
  for (const file of readdirSync(agentDir)) {
    const match = /^(.*)\.(png|webp)$/i.exec(file);
    if (!match) continue;
    const set = formats.get(match[1]) || new Set();
    set.add(match[2].toLowerCase());
    formats.set(match[1], set);
  }
  for (const [stem, set] of formats) {
    if (set.has('png') && set.has('webp')) {
      issues.push({
        file: `assets/images/agent/${stem}`,
        code: 'duplicate_image_format',
      });
    }
  }

  const literalPattern = /(?:\.\.\/|\.\/)?assets\/[A-Za-z0-9_\-./\u4e00-\u9fff]+\.(?:png|jpe?g|webp|wav|mp3|mp4)/g;
  for (const file of walk(webRoot)) {
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;

    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(literalPattern)) {
      const reference = match[0].replace(/^(\.\.\/|\.\/)+/, '');
      if (!existsSync(join(webRoot, reference))) {
        issues.push({
          file: relative(webRoot, file).replaceAll('\\', '/'),
          code: `missing_literal_asset:${reference}`,
        });
      }
    }
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = await checkAssets(join(process.cwd(), 'web'));
  for (const issue of issues) {
    console.error(`${issue.file} [${issue.code}]`);
  }
  process.exitCode = issues.length ? 1 : 0;
}
