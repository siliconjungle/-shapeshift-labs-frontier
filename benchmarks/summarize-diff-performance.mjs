import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
function read(name) {
  const file = path.join(here, 'results', name + '.json');
  return JSON.parse(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : gunzipSync(fs.readFileSync(file + '.gz')).toString());
}
const reports = [1, 2, 3].map(i => read('node22-run' + i));
const node24 = read('node24-run1');
assert(new Set([...reports, node24].map(r => r.sourceHash)).size === 1, 'all reports must measure the same source');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = reports[0].results.map(row => ({
  fixture: row.fixture,
  variants: row.variants.map(v => {
    const peers = reports.map(r => r.results.find(x => x.fixture === row.fixture).variants.find(x => x.variant === v.variant));
    assert(peers.every(x => x.jsonBytes === v.jsonBytes && x.ops === v.ops));
    return {
      variant: v.variant, ops: v.ops, jsonBytes: v.jsonBytes, gzipBytes: v.gzipBytes,
      ...Object.fromEntries(['diff', 'apply', 'pipeline'].map(metric => [metric, {
        medianUs: median(peers.map(x => x[metric].medianUs)),
        runMinUs: Math.min(...peers.map(x => x[metric].medianUs)),
        runMaxUs: Math.max(...peers.map(x => x[metric].medianUs)),
        medianBatchP95Us: median(peers.map(x => x[metric].p95Us))
      }]))
    };
  })
}));
const output = { environment: reports[0].environment, baseline: reports[0].baseline, sourceHash: reports[0].sourceHash, method: 'Median of three Node 22 process medians. Raw compressed reports retain all batch samples and a separate Node 24 run.', results: summary };
fs.writeFileSync(path.join(here, 'results/summary.json'), JSON.stringify(output, null, 2) + '\n');
const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const variants = row => Object.fromEntries(row.variants.map(v => [v.variant, v]));
const us = (v, metric = 'diff') => fmt(v[metric].medianUs);
const speedup = (a, b) => (a / b).toFixed(2) + 'x';
const selected = ['rows/10000/reverse', 'rows/10000/shuffle', 'text/100000/three-inserts', 'text/100000/mixed-24', 'corpus/src/diff.ts/mixed-24', 'corpus/src/diff.ts/clustered-24', 'text/repeated-8000/copy-prefix-miss'];
let md = '\n<!-- generated-results -->\n\n### Selected results\n\nAll timings are microseconds. Adaptive mode includes the default optimizations.\n\n';
md += '| Fixture | Baseline diff | Default diff | Adaptive diff | Baseline pipeline | Adaptive/default pipeline | Patch bytes: baseline → adaptive/default |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for (const name of selected) {
  const row = summary.find(r => r.fixture === name), v = variants(row), best = v.adaptive || v.current;
  md += `| ${name} | ${us(v.baseline)} | ${us(v.current)} | ${v.adaptive ? us(v.adaptive) : '—'} | ${us(v.baseline, 'pipeline')} | ${us(best, 'pipeline')} | ${v.baseline.jsonBytes.toLocaleString('en-US')} → ${best.jsonBytes.toLocaleString('en-US')} |\n`;
}
md += '\n### Paper-specific ablation\n\nPosition-only is the same adaptive planner and replay code with the cost predictor disabled. The late-large cases isolate a positive effect; the early-large controls show its limits.\n\n| Fixture | Position diff | Cost-guided diff | Position pipeline | Cost-guided pipeline | Position bytes | Cost-guided bytes |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for (const row of summary.filter(r => r.fixture.startsWith('text/uneven'))) {
  const v = variants(row), p = v['position-only'], a = v.adaptive;
  md += `| ${row.fixture} | ${us(p)} | ${us(a)} | ${us(p, 'pipeline')} | ${us(a, 'pipeline')} | ${p.jsonBytes} | ${a.jsonBytes} |\n`;
}
md += '\n### Default strategy: complete matrix\n\n| Fixture | Baseline diff | Default diff | Diff speedup | Baseline pipeline | Default pipeline |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';
for (const row of summary) { const v = variants(row); md += `| ${row.fixture} | ${us(v.baseline)} | ${us(v.current)} | ${speedup(v.baseline.diff.medianUs, v.current.diff.medianUs)} | ${us(v.baseline, 'pipeline')} | ${us(v.current, 'pipeline')} |\n`; }
md += '\n### Adaptive mode: complete text matrix\n\nThis comparison uses the already optimized default as the control. Declined searches may cost extra without reducing the patch. Multiple splices may also increase replay cost relative to one large splice.\n\n| Fixture | Default diff | Adaptive diff | Default pipeline | Adaptive pipeline | Default JSON bytes | Adaptive JSON bytes | Adaptive gzip bytes |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for (const row of summary.filter(r => r.variants.some(v => v.variant === 'adaptive'))) { const v = variants(row); md += `| ${row.fixture} | ${us(v.current)} | ${us(v.adaptive)} | ${us(v.current, 'pipeline')} | ${us(v.adaptive, 'pipeline')} | ${v.current.jsonBytes} | ${v.adaptive.jsonBytes} | ${v.adaptive.gzipBytes} |\n`; }
md += '\n### Node 24 cross-check\n\nOne independent process; not pooled with Node 22.\n\n| Fixture | Baseline diff | Default diff | Adaptive diff | Baseline pipeline | Adaptive/default pipeline |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';
for (const name of selected) { const row = node24.results.find(r => r.fixture === name), v = variants(row), best = v.adaptive || v.current; md += `| ${name} | ${us(v.baseline)} | ${us(v.current)} | ${v.adaptive ? us(v.adaptive) : '—'} | ${us(v.baseline, 'pipeline')} | ${us(best, 'pipeline')} |\n`; }
md += '\n### Raw evidence\n\n- [Aggregated Node 22 results](results/summary.json) include per-process median ranges and median batch p95.\n';
for (const name of ['node22-run1', 'node22-run2', 'node22-run3', 'node24-run1']) md += `- [${name} raw samples](results/${name}.json.gz) (gzip-compressed JSON).\n`;
md += '\nRegenerate the tables with `node benchmarks/summarize-diff-performance.mjs`. It accepts either raw `.json` files or the retained `.json.gz` files.\n';
const doc = path.join(here, 'DIFF_PERFORMANCE.md');
const intro = fs.readFileSync(doc, 'utf8').split('\n<!-- generated-results -->')[0];
fs.writeFileSync(doc, intro + md);
console.log(JSON.stringify({ fixtures: summary.length, sourceHash: output.sourceHash, regressions: summary.filter(row => { const v = variants(row); return v.current.diff.medianUs > v.baseline.diff.medianUs * 1.15 && v.current.diff.medianUs - v.baseline.diff.medianUs > .1; }).map(r => r.fixture) }));
