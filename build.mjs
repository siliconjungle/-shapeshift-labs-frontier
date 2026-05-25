import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(packageDir, '..', '..');
const sourceDir = path.join(rootDir, 'dist', 'src');
const outDir = path.join(packageDir, 'dist');

const monorepoTsconfig = path.join(rootDir, 'tsconfig.json');
const monorepoSource = path.join(rootDir, 'src');
if (fs.existsSync(monorepoTsconfig) && fs.existsSync(monorepoSource)) {
  execFileSync('npm', ['--prefix', rootDir, 'run', 'build'], { stdio: 'inherit' });
} else if (!fs.existsSync(sourceDir)) {
  console.log('no monorepo dist source found; using committed package dist');
  process.exit(0);
}

const files = [
  ['frontier-package', 'index'],
  ['constants', 'constants'],
  ['diff', 'diff'],
  ['apply', 'apply'],
  ['json-patch', 'json-patch'],
  ['normalize', 'normalize'],
  ['patch-validate', 'patch-validate'],
  ['patch', 'patch'],
  ['pointer', 'pointer'],
  ['clone', 'clone'],
  ['equal', 'equal'],
  ['validate', 'validate'],
  ['unicode', 'unicode'],
  ['object', 'object'],
  ['types', 'types']
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const [sourceBase, targetBase] of files) {
  for (const extension of ['.js', '.d.ts']) {
    const source = path.join(sourceDir, sourceBase + extension);
    if (!fs.existsSync(source)) continue;
    const target = path.join(outDir, targetBase + extension);
    const text = fs.readFileSync(source, 'utf8')
      .replaceAll(sourceBase + extension + '.map', targetBase + extension + '.map')
      .replace(/\n\/\/# sourceMappingURL=.*$/u, '');
    fs.writeFileSync(target, text);
  }
}

fs.copyFileSync(path.join(packageDir, 'core-types.d.ts'), path.join(outDir, 'types.d.ts'));
