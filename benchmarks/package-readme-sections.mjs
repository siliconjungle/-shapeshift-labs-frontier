import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const self = fileURLToPath(import.meta.url);
const fallbackCatalogPath = path.join(here, 'package-readme-catalog.json');
const centralCandidates = [
  process.env.FRONTIER_PACKAGE_README_SCRIPT,
  path.resolve(packageRoot, '..', 'json-diff', 'benchmarks', 'package-readme-sections.js'),
  path.resolve(packageRoot, '..', '..', 'benchmarks', 'package-readme-sections.js')
].filter(Boolean);

let delegated = false;
for (const candidate of centralCandidates) {
  const resolved = path.resolve(candidate);
  if (resolved !== self && fs.existsSync(resolved)) {
    await import(pathToFileURL(resolved).href);
    delegated = true;
    break;
  }
}

if (!delegated) {
  const packages = JSON.parse(fs.readFileSync(fallbackCatalogPath, 'utf8'));
  const check = process.argv.slice(2).includes('--check');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const current = packages.find((entry) => entry.name === packageJson.name);
  if (!current) throw new Error('unknown Frontier package in package.json: ' + packageJson.name);
  const readmePath = path.join(packageRoot, 'README.md');
  const currentText = fs.readFileSync(readmePath, 'utf8');
  const nextText = replaceOrInsertHeadingSection(currentText, '## Related Packages', renderRelatedPackages(packages, current));
  if (currentText !== nextText) {
    if (check) {
      console.error('README package-family sections are stale.');
      console.error('Run npm run readme:packages to refresh README.md.');
      process.exit(1);
    }
    fs.writeFileSync(readmePath, nextText);
  }
}

function renderRelatedPackages(packages, currentPackage) {
  const related = packages.filter((entry) => entry.id !== currentPackage.id);
  const tick = String.fromCharCode(96);
  return [
    'The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:',
    '',
    ...related.map((entry) => '- [' + tick + entry.name + tick + '](' + entry.npmUrl + '): ' + entry.role),
    '',
    'Package source repositories:',
    '',
    ...packages.map((entry) => '- [' + tick + entry.repoName + tick + '](' + entry.repoUrl + ')')
  ].join('\n') + '\n';
}

function replaceOrInsertHeadingSection(text, heading, body) {
  const normalizedBody = body.replace(/\n*$/, '\n\n');
  const start = text.indexOf(heading + '\n');
  if (start !== -1) {
    const bodyStart = start + heading.length + 1;
    const next = findNextHeading(text, bodyStart);
    if (next === -1) return text.slice(0, bodyStart) + '\n' + normalizedBody;
    return text.slice(0, bodyStart) + '\n' + normalizedBody + text.slice(next);
  }
  const insertAt = findNextHeading(text, text.indexOf('\n') + 1);
  if (insertAt === -1) return text.replace(/\n*$/, '\n\n') + heading + '\n\n' + normalizedBody;
  return text.slice(0, insertAt) + '\n' + heading + '\n\n' + normalizedBody + text.slice(insertAt);
}

function findNextHeading(text, fromIndex) {
  const headingPattern = /^## .+$/gm;
  headingPattern.lastIndex = fromIndex;
  const match = headingPattern.exec(text);
  return match ? match.index : -1;
}
