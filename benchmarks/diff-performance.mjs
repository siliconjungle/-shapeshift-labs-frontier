import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const baselineDir = path.resolve(arg('--baseline', path.join(root, '../frontier-baseline')));
const rounds = Number(arg('--rounds', 11));
const targetMs = Number(arg('--target-ms', 5));
assert(rounds >= 5 && Number.isInteger(rounds));
assert(targetMs > 0 && targetMs <= 100);
const filter = arg('--filter', '');
const baseline = await import(pathToFileURL(path.join(baselineDir, 'dist/index.js')));
const current = await import(pathToFileURL(path.join(root, 'dist/index.js')));
let temporary;
let position;
if (args.includes('--ablation')) {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-position-'));
  fs.cpSync(path.join(root, 'dist'), temporary, { recursive: true });
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"module"}');
  const modulePath = path.join(temporary, 'string-align.js');
  const code = fs.readFileSync(modulePath, 'utf8');
  assert(code.includes('costBands = true'));
  fs.writeFileSync(modulePath, code.replace('costBands = true', 'costBands = false'));
  position = await import(pathToFileURL(path.join(temporary, 'index.js')));
}

let seed = 0x7318ade;
function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
function ascii(n) { const chars = new Array(n); for (let i = 0; i < n; i++) chars[i] = String.fromCharCode(97 + Math.floor(random() * 26)); return chars.join(''); }
const clone = value => structuredClone(value);
const rows = n => Array.from({ length: n }, (_, i) => ({ id: 'row-' + i, score: i, active: !!(i & 1), label: 'row ' + i }));
const fixtures = [];
const add = (name, before, after, options, text = false) => fixtures.push({ name, before, after, options, text });
add('object/small-field', { meta: { version: 1, owner: 'x' }, active: true }, { meta: { version: 2, owner: 'x' }, active: true });
for (const n of [1000, 10000]) {
  const a = rows(n);
  add(`rows/${n}/same-reference`, a, a, { arrayKey: 'id' });
  add(`rows/${n}/equal-clone`, a, clone(a), { arrayKey: 'id' });
  const edit = clone(a); edit[n >> 1].score = -1;
  add(`rows/${n}/field-edit`, a, edit, { arrayKey: 'id' });
  add(`rows/${n}/dirty-path`, a, edit, { dirtyPaths: [[n >> 1, 'score']] });
  const move = clone(a); move.unshift(move.pop());
  add(`rows/${n}/single-move`, a, move, { arrayKey: 'id' });
  add(`rows/${n}/reverse`, a, clone(a).reverse(), { arrayKey: 'id' });
  const shuffle = clone(a);
  for (let i = shuffle.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffle[i], shuffle[j]] = [shuffle[j], shuffle[i]]; }
  add(`rows/${n}/shuffle`, a, shuffle, { arrayKey: 'id' });
  add(`rows/${n}/insert-delete`, a, [...clone(a.slice(0, n / 3)), ...rows(30).map(x => ({ ...x, id: 'new-' + x.id })), ...clone(a.slice(n / 3 + 10))], { arrayKey: 'id' });
}
for (const moves of [510, 512, 513]) {
  const a = rows(1200), b = [...clone(a.slice(moves)), ...clone(a.slice(0, moves))];
  add(`rows/1200/rotate-${moves}`, a, b, { arrayKey: 'id' });
}
const scalar = Array.from({ length: 10000 }, (_, i) => i);
const scalarAfter = scalar.slice(); for (let i = 0; i < 10000; i += 100) scalarAfter[i] = -i - 1;
add('array/scalar-sparse', scalar, scalarAfter);
const tuples = Array.from({ length: 1000 }, (_, i) => [i, i + 1, i + 2]);
const tuplesAfter = clone(tuples); for (let i = 0; i < 1000; i += 10) tuplesAfter[i][1]++;
add('array/tuples', tuples, tuplesAfter);

function edits(text, count, clustered = false) {
  let result = text;
  for (let i = count - 1; i >= 0; i--) {
    const pos = Math.floor(text.length * (clustered ? 0.1 + 0.2 * i / count : (i + 1) / (count + 1)));
    const del = i % 3 === 0 ? 40 : i % 3 === 1 ? 0 : 7;
    const insert = i % 3 === 0 ? '' : i % 3 === 1 ? 'inserted change '.repeat(5) : 'replacement';
    result = result.slice(0, pos) + insert + result.slice(pos + del);
  }
  return result;
}
for (const n of [10000, 100000]) {
  const a = ascii(n);
  add(`text/${n}/equal`, a, a, undefined, true);
  add(`text/${n}/append`, a, a + 'INSERTED', undefined, true);
  add(`text/${n}/truncate`, a, a.slice(0, -10), undefined, true);
  add(`text/${n}/single-insert`, a, a.slice(0, n / 2) + 'INSERTED' + a.slice(n / 2), undefined, true);
  let three = a; for (const pos of [n * .8, n * .5, n * .2]) three = three.slice(0, pos) + 'INSERTED' + three.slice(pos);
  add(`text/${n}/three-inserts`, a, three, undefined, true);
  add(`text/${n}/mixed-24`, a, edits(a, 24), undefined, true);
  add(`text/${n}/clustered-24`, a, edits(a, 24, true), undefined, true);
  add(`text/${n}/unrelated`, a, ascii(n), undefined, true);
}
// Real source/prose shapes, with deterministic synthetic edits. No user data.
for (const name of ['README.md', 'src/diff.ts']) {
  const a = fs.readFileSync(path.join(baselineDir, name), 'utf8');
  add(`corpus/${name}/mixed-24`, a, edits(a, 24), undefined, true);
  add(`corpus/${name}/clustered-24`, a, edits(a, 24, true), undefined, true);
}
const unicode = ('A🌿 café 中 e\u0301\n' + ascii(80)).repeat(1000);
add('text/unicode/mixed-24', unicode, edits(unicode, 24), undefined, true);
// Uneven edit mass within one coarse block: position interpolation can miss
// the unchanged middle by hundreds of characters. Both directions are tested.
const uneven = ascii(100000);
for (const large of [200, 500, 1000]) {
  for (const late of [true, false]) {
    let after = uneven;
    for (const [at, count] of [[80000, 10], [10000, late ? large : 10], [2000, late ? 10 : large]]) after = after.slice(0, at) + 'X'.repeat(count) + after.slice(at);
    add(`text/uneven-${large}/${late ? 'large-late' : 'large-early'}`, uneven, after, undefined, true);
  }
}
for (const n of [2000, 8000]) {
  add(`text/repeated-${n}/copy-prefix-miss`, 'b' + 'a'.repeat(n) + 'Z', 'a'.repeat(n) + 'Y'.repeat(129), undefined, true);
  add(`text/repeated-${n}/copy-prefix-hit`, 'b' + 'a'.repeat(n) + 'Z', 'a'.repeat(n) + 'Y', undefined, true);
}
const copy = ascii(8000);
add('text/copy-insert', copy, copy.slice(0, 4000) + copy.slice(1000, 3000) + copy.slice(4000), undefined, true);
add('text/copy-suffix', 'HEAD' + copy + 'TAIL', 'HEAD' + copy + 'new-prefix-' + copy.slice(0, 3000) + 'TAIL', undefined, true);

let sink;
const results = [];
try {
  for (const fixture of fixtures.filter(x => x.name.includes(filter))) {
    const variants = [
      { name: 'baseline', api: baseline, options: fixture.options },
      { name: 'current', api: current, options: fixture.options }
    ];
    if (fixture.text) {
      variants.push({ name: 'adaptive', api: current, options: { ...fixture.options, textDiff: 'adaptive' } });
      if (position) variants.push({ name: 'position-only', api: position, options: { ...fixture.options, textDiff: 'adaptive' } });
    }
    const records = variants.map(v => {
      const patch = v.api.diff(fixture.before, fixture.after, v.options);
      v.api.assertPatch(patch);
      assert.deepEqual(v.api.applyPatchImmutable(fixture.before, patch), fixture.after, fixture.name + ' ' + v.name);
      const json = JSON.stringify(patch);
      const functions = {
        diff: () => v.api.diff(fixture.before, fixture.after, v.options),
        apply: () => v.api.applyPatchImmutable(fixture.before, patch),
        pipeline: () => { const p = v.api.diff(fixture.before, fixture.after, v.options); const encoded = JSON.stringify(p); const value = v.api.applyPatchImmutable(fixture.before, p); return { encoded, value }; }
      };
      const metrics = {};
      for (const [name, fn] of Object.entries(functions)) {
        let t = performance.now(); sink = fn(); const firstMs = performance.now() - t;
        const warm = Math.max(3, Math.min(200, Math.floor(10 / Math.max(firstMs, .001))));
        for (let i = 0; i < warm; i++) sink = fn();
        t = performance.now(); for (let i = 0; i < warm; i++) sink = fn();
        const ms = (performance.now() - t) / warm;
        const inner = Math.max(1, Math.min(20000, Math.ceil(targetMs / Math.max(ms, .0001))));
        metrics[name] = { fn, inner, samples: [] };
      }
      return { variant: v.name, ops: patch.length, jsonBytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).length, metrics };
    });
    if (global.gc) global.gc();
    for (let round = 0; round < rounds; round++) {
      // Randomized interleaving, including modes, reduces order/thermal bias.
      const jobs = records.flatMap(r => Object.values(r.metrics));
      for (let i = jobs.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
      for (const job of jobs) {
        const t = performance.now(); for (let i = 0; i < job.inner; i++) sink = job.fn();
        job.samples.push((performance.now() - t) * 1000 / job.inner);
      }
    }
    const row = { fixture: fixture.name, variants: records.map(({ metrics, ...rest }) => ({ ...rest, ...Object.fromEntries(Object.entries(metrics).map(([name, m]) => {
      const sorted = [...m.samples].sort((a, b) => a - b);
      return [name, { medianUs: sorted[Math.floor(sorted.length / 2)], p95Us: sorted[Math.ceil(.95 * sorted.length) - 1], inner: m.inner, samplesUs: m.samples }];
    })) })) };
    results.push(row);
    console.log(fixture.name + ': ' + row.variants.map(v => `${v.variant} ${v.diff.medianUs.toFixed(2)}us / ${v.jsonBytes}B / pipeline ${v.pipeline.medianUs.toFixed(2)}us`).join(' | '));
  }
  const report = {
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, gcAvailable: !!global.gc },
    baseline: execFileSync('git', ['-C', baselineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHash: ['diff.ts', 'string-align.ts', 'apply.ts', 'normalize.ts'].reduce((hash, file) => hash.update(fs.readFileSync(path.join(root, 'src', file))), createHash('sha256')).digest('hex'),
    rounds, targetBatchMs: targetMs, seed: '0x7318ade',
    method: 'Warmup and calibrated batches; randomized interleaving of variants and metrics; p95 of batch means, not per-call tail latency. Pipeline includes diff, JSON.stringify and immutable replay. gzip sizes measured outside timing. Inputs reused, results consumed. Synthetic edits over generated inputs and baseline repository text. Correctness checked before timing.',
    results
  };
  const output = path.resolve(arg('--out', path.join(root, 'benchmarks/results/diff-performance.json')));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Wrote ' + output + '; sink=' + typeof sink);
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
