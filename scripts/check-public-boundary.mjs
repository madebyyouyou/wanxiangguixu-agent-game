import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_PARTS = new Set([
  '.claude',
  '_st_clone',
  'node_modules',
  'Library',
  'Temp',
  'obj',
  'bin',
  'Logs',
  'Assets',
  'Packages',
  'ProjectSettings',
  '_build_extracted',
  '_liquid-glass-extract',
  '_asset_probe',
]);
const FORBIDDEN_SUFFIXES = [
  '.bak',
  '.log',
  '.meta',
  '.unity',
  '.csproj',
  '.sln',
];
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.toml',
  '.txt',
  '.yaml',
  '.yml',
]);

export function checkBoundary(root = process.cwd()) {
  const issues = [];
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'));

  for (const file of tracked) {
    const parts = file.split('/');
    if (parts.includes('_audit')) {
      issues.push({ file, code: 'audit_tracked' });
    }
    if (parts.some((part) => FORBIDDEN_PARTS.has(part))) {
      issues.push({ file, code: 'forbidden_directory' });
    }
    if (FORBIDDEN_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
      issues.push({ file, code: 'forbidden_suffix' });
    }

    const isEnvironmentFile = file === '.env'
      || file.startsWith('.env.')
      || file.endsWith('/.env')
      || /\/\.env\.[^/]+$/.test(file);
    if (
      isEnvironmentFile
      && file !== '.env.example'
      && !file.endsWith('/.env.example')
    ) {
      issues.push({ file, code: 'environment_file' });
    }

    if (TEXT_EXTENSIONS.has(extname(file).toLowerCase())) {
      const text = readFileSync(join(root, file), 'utf8');
      if (/[A-Za-z]:\\(?:Users|claude_cowork|求职|万象归墟)/.test(text)) {
        issues.push({ file, code: 'absolute_local_path' });
      }
    }
  }

  const trailerDir = join(root, 'showcase', 'trailer');
  const trailers = existsSync(trailerDir)
    ? readdirSync(trailerDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
    : [];
  if (trailers.length !== 1) {
    issues.push({ file: 'showcase/trailer', code: 'trailer_count' });
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = checkBoundary();
  for (const issue of issues) {
    console.error(`${issue.file} [${issue.code}]`);
  }
  process.exitCode = issues.length ? 1 : 0;
}
