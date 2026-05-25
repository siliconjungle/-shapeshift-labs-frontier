import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  applyPatchImmutable,
  diff
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const rounds = readPositiveInt(args.rounds, 9);
const outPath = args.out ? path.resolve(rootDir, args.out) : null;

let sink = 0;

const fixtures = [
  makeSmallObjectFixture(),
  makeKeyedRowsFixture(),
  makeDirtyRowsFixture(),
  makeTextFixture()
];

const rows = fixtures.map(runFixture);
const report = {
  package: '@shapeshift-labs/frontier',
  version: readPackageVersion(),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform + ' ' + process.arch,
  rounds,
  rows
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

printReport(report);
if (sink === 42) console.log('sink=' + sink);

function runFixture(fixture) {
  const patch = diff(fixture.before, fixture.after, fixture.options);
  assert.deepStrictEqual(applyPatchImmutable(fixture.before, patch), fixture.after);
  const diffTiming = measure(() => {
    const nextPatch = diff(fixture.before, fixture.after, fixture.options);
    sink += nextPatch.length;
  }, fixture.diffInner || 1000);
  const applyTiming = measure(() => {
    const next = applyPatchImmutable(fixture.before, patch);
    sink += Array.isArray(next) ? next.length : Object.keys(next || {}).length;
  }, fixture.applyInner || 3000);
  return {
    fixture: fixture.name,
    patchOps: patch.length,
    jsonPatchBytes: Buffer.byteLength(JSON.stringify(patch)),
    diffMedianUs: round(diffTiming.median),
    diffP95Us: round(diffTiming.p95),
    applyMedianUs: round(applyTiming.median),
    applyP95Us: round(applyTiming.p95)
  };
}

function makeSmallObjectFixture() {
  return {
    name: 'Small object field edit',
    before: { meta: { version: 1, owner: 'frontier' }, flags: { active: true } },
    after: { meta: { version: 2, owner: 'frontier' }, flags: { active: true } },
    diffInner: 5000,
    applyInner: 10000
  };
}

function makeKeyedRowsFixture() {
  const before = { rows: makeRows(1000) };
  const after = cloneJson(before);
  after.rows[512] = { ...after.rows[512], score: 9999 };
  return {
    name: '1k keyed rows, one field edit',
    before,
    after,
    options: { arrayKey: 'id' },
    diffInner: 200,
    applyInner: 5000
  };
}

function makeDirtyRowsFixture() {
  const before = { rows: makeRows(1000) };
  const after = cloneJson(before);
  after.rows[512] = { ...after.rows[512], score: 9999, label: 'changed' };
  return {
    name: '1k keyed rows with dirty path hint',
    before,
    after,
    options: { dirtyPaths: [['rows', 512, 'score'], ['rows', 512, 'label']] },
    diffInner: 3000,
    applyInner: 5000
  };
}

function makeTextFixture() {
  const beforeText = 'a'.repeat(5000) + 'b'.repeat(5000);
  const afterText = 'a'.repeat(5000) + 'frontier' + 'b'.repeat(5000);
  return {
    name: '10k text middle insert',
    before: { text: beforeText },
    after: { text: afterText },
    diffInner: 1000,
    applyInner: 10000
  };
}

function makeRows(count) {
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = { id: 'row-' + i, score: i, active: (i & 1) === 0, label: 'row ' + i };
  }
  return rows;
}

function measure(fn, inner) {
  for (let i = 0; i < inner; i++) fn();
  const samples = new Array(rounds);
  for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
    const start = performance.now();
    for (let i = 0; i < inner; i++) fn();
    samples[roundIndex] = ((performance.now() - start) * 1000) / inner;
  }
  samples.sort((left, right) => left - right);
  return {
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95)
  };
}

function printReport(report) {
  console.log('@shapeshift-labs/frontier package benchmark');
  console.log('Node ' + report.node + ' on ' + report.platform + ', rounds=' + rounds);
  console.log('These are Frontier-only package measurements, not competitor comparisons.');
  console.log('');
  console.log(padRight('Fixture', 40) + padLeft('Ops', 7) + padLeft('Bytes', 9) + padLeft('Diff med', 12) + padLeft('Diff p95', 11) + padLeft('Apply med', 12));
  for (const row of report.rows) {
    console.log(
      padRight(row.fixture, 40) +
      padLeft(String(row.patchOps), 7) +
      padLeft(formatBytes(row.jsonPatchBytes), 9) +
      padLeft(formatUs(row.diffMedianUs), 12) +
      padLeft(formatUs(row.diffP95Us), 11) +
      padLeft(formatUs(row.applyMedianUs), 12)
    );
  }
  if (outPath) console.log('\nwrote ' + path.relative(rootDir, outPath));
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--rounds') out.rounds = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run bench -- [--rounds 9] [--out benchmarks/results/frontier-package-bench.json]');
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  return out;
}

function readPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error('expected positive integer, got ' + value);
  return number;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatUs(value) {
  return value.toFixed(2) + ' us';
}

function formatBytes(value) {
  return value < 1024 ? value + ' B' : (value / 1024).toFixed(1) + ' KiB';
}

function padRight(value, width) {
  return String(value).padEnd(width);
}

function padLeft(value, width) {
  return String(value).padStart(width);
}
