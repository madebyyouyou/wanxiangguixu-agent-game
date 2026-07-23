import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = [
  ['provider_api_key', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ['github_token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  [
    'env_credential',
    /^(?:[A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|PRIVATE_KEY|SECRET)[A-Z0-9_]*)=(?!your_key_here$).{8,}$/g,
  ],
  [
    'credential_assignment',
    /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*['"][^'"]{12,}['"]/gi,
  ],
];
const TEXT_EXTENSIONS = new Set([
  '',
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
  '.xml',
  '.yaml',
  '.yml',
]);
const SKIP_DIRS = new Set([
  '.git',
  '_audit',
  'node_modules',
  'coverage',
]);

function collect(input, out = []) {
  const stat = statSync(input);
  if (stat.isFile()) {
    out.push(input);
    return out;
  }

  for (const entry of readdirSync(input, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    collect(join(input, entry.name), out);
  }
  return out;
}

export function scanPaths(paths, { root = process.cwd() } = {}) {
  const issues = [];
  for (const file of paths.flatMap((input) => collect(input))) {
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const [rule, pattern] of RULES) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          issues.push({
            file: relative(root, file).replaceAll('\\', '/'),
            line: index + 1,
            rule,
          });
        }
      }
    });
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = scanPaths([process.cwd()]);
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line} [${issue.rule}]`);
  }
  process.exitCode = issues.length ? 1 : 0;
}
