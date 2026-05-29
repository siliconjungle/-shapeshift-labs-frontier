import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(packageDir, '..', '..');
const packageJsonPath = path.join(packageDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageName = packageJson.name;
const stack = new Set((process.env.FRONTIER_PACKAGE_BUILD_STACK || '').split(path.delimiter).filter(Boolean));
const nextStack = new Set(stack);
nextStack.add(packageName);
linkLocalPackage(packageName, packageDir);

for (const dependency of readLocalDependencies(packageJson)) {
  const targetDir = localPackageDir(dependency);
  if (!targetDir || targetDir === packageDir) continue;
  linkLocalPackage(dependency, targetDir);
  if (!stack.has(dependency) && !isPackageBuildCurrent(targetDir)) {
    execFileSync('npm', ['--prefix', targetDir, 'run', 'build'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        FRONTIER_PACKAGE_BUILD_STACK: Array.from(nextStack).join(path.delimiter)
      }
    });
  }
}

fs.rmSync(path.join(packageDir, 'dist'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
execFileSync(resolveTsc(), ['-b', path.join(packageDir, 'tsconfig.json'), '--force'], { stdio: 'inherit' });

function readLocalDependencies(pkg) {
  const names = new Set();
  for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@shapeshift-labs/frontier')) names.add(name);
    }
  }
  return Array.from(names).sort();
}

function localPackageDir(name) {
  const shortName = name.startsWith('@shapeshift-labs/') ? name.slice('@shapeshift-labs/'.length) : name;
  const target = path.join(rootDir, 'packages', shortName);
  return fs.existsSync(path.join(target, 'package.json')) ? target : null;
}

function linkLocalPackage(name, targetDir) {
  const parts = name.split('/');
  const scopeDir = path.join(packageDir, 'node_modules', ...parts.slice(0, -1));
  const linkPath = path.join(packageDir, 'node_modules', ...parts);
  fs.mkdirSync(scopeDir, { recursive: true });
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return;
    fs.unlinkSync(linkPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.symlinkSync(path.relative(path.dirname(linkPath), targetDir), linkPath, 'dir');
}

function isPackageBuildCurrent(targetDir) {
  const distEntry = path.join(targetDir, 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) return false;
  const distMtime = fs.statSync(distEntry).mtimeMs;
  for (const file of ['package.json', 'tsconfig.json', 'build.mjs']) {
    const full = path.join(targetDir, file);
    if (fs.existsSync(full) && fs.statSync(full).mtimeMs > distMtime) return false;
  }
  const srcDir = path.join(targetDir, 'src');
  if (fs.existsSync(srcDir) && newestMtime(srcDir) > distMtime) return false;
  return true;
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full));
    else newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

function resolveTsc() {
  const command = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
  const candidates = [
    path.join(packageDir, 'node_modules', '.bin', command),
    path.join(rootDir, 'node_modules', '.bin', command)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return command;
}
