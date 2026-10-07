# Diff performance study

This change keeps the existing structural strategy as the default, removes
wasted copy/move searches, and adds opt-in text alignment:

```js
diff(before, after, { textDiff: 'adaptive' });
```

The adaptive planner is useful when compact text patches matter. It can cost
more CPU than the default, particularly when its search declines a document.
Neither strategy promises a minimum edit script or minimum encoded patch.

## What comes from the paper

The planner adapts two mechanisms from OpenAI's
[An Almost-Linear Approximation Scheme for Edit Distance](https://github.com/openai/math/blob/adc7f1241b42e322a6451854ab7e4b4c146bf78a/preprints/An-Almost-Linear-Approximation-Scheme-for-Edit-Distance-September-24-2026/paper.pdf):

- Section 5.1 predicts alignment displacement from cumulative prefix cost,
  using `p = p0 + (net displacement / estimated cost) * prefixCost(p)`.
- Sections 2.1 and 4.1 use endpoint displacement to transfer cost bounds. Here
  the lower envelope of `upperBound(center) + abs(endpoint - center)` supplies
  a 1-Lipschitz upper-bound proxy for prefix costs.

The implementation first builds a coarse alignment across eight blocks,
retaining at most three exact anchor matches at each cut. A small dynamic
program retains the least-cost path under single-splice upper bounds. It then
refines the remaining gaps. Position-based bands are attempted first; the
cost-dependent predictor is used when those bands miss. A verified interior
anchor improves otherwise loose prefix bounds before constructing the cones.

This is a practical adaptation of those constructions, **not an implementation
of the full theorem**. It substitutes deterministic upper bounds for the paper's
randomized seed and refinement tables, uses different finite parameters, and
does not inherit the paper's approximation factor or expected-work theorem.
It does not implement the entropy optimizer or shared randomized sampling.
The benchmark's `position-only` variant disables the cost-dependent prediction
and envelopes, keeping the rest of the planner identical.

All anchors use exact UTF-16 substring comparisons; all gaps are emitted as
actual splices. Estimates only guide search. A comparison-work allowance,
four refinement levels, and 32 output operations limit speculative planning.
The final conservative size check compares against a single large splice,
not every possible copy-based patch. If planning fails, the existing diff
strategy runs. The option does not bypass trusted dirty-path/version contracts
or guarantee that every string field will be refined.

## Other changes

- For unique-key permutations, `n - LIS length` lower-bounds the required number
  of single-item moves. Skip move planning when this already exceeds 512.
- Copy-prefix search verifies the minimum prefix required for a useful copy,
  rather than repeatedly extending a 64-unit probe. Copy-suffix search bounds
  both candidate count and total compared substring lengths. These caps can
  deliberately choose a larger valid splice over a costly compact-copy search.
- Ordered string-splice runs replay against the original string in one pass.
  Overlapping or incompatible edits fall back to sequential semantics.
- A pre-existing overlapping-copy bug is fixed by copying before replacement.
- A pre-existing normalization bug is fixed by requiring equal parent depths
  before merging assignments and sets. Both failures were reproduced on the
  untouched baseline and have focused regression coverage.

## Method

Baseline: `f4d1a3d145dc6d644a704909dbef0e028073fd51` (version 0.1.9).
Measurements use 55 workloads on an Apple M4 Pro, macOS arm64: three fresh
Node 22.22.1 processes and one Node 24.19.0 process. Each process runs 11
randomly interleaved rounds with warmed-up, calibrated batches targeting 5 ms.
Very fast cases cap iterations at 20,000; slow cases may use a single call per
batch. Results are consumed, and input fixtures are reused. Correct replay and
patch validation are checked outside timed regions for every variant/fixture.

Reported medians and p95 values are **batch means**, not individual-call tail
latencies. The pipeline includes diff, JSON patch serialization, and immutable
replay. Apply-only measurements reuse an already computed patch. UTF-8 JSON
and gzip sizes are measured separately; the Frontier codec is not benchmarked.
V8 may represent replayed strings lazily; no additional traversal of the returned
value is forced. Allocation, process startup, concurrent application workloads,
and peak memory are not separately characterized.

Fixtures cover small objects; reference/equal-clone/sparse/dirty-path row edits;
keyed movement, reversal, shuffling, insertion/deletion, and the move-limit
boundary; scalar/tuple arrays; easy and difficult text edits; Unicode; repeated
copy probes; uneven insertions; and synthetic changes to the baseline README
and diff implementation. These are controlled fixtures, not production traffic.
The uneven-edit fixtures specifically exercise the predictor and are reported
alongside the general workload matrix, not as evidence of universal benefit.

The earlier replay implementation was also benchmarked and exposed repeated
string copying. All results below are for the completed one-pass replay version.

## Reproduce

Build a separate baseline checkout without modifying the active checkout:

```sh
git worktree add --detach ../frontier-baseline f4d1a3d145dc6d644a704909dbef0e028073fd51
npm --prefix ../frontier-baseline ci --ignore-scripts
npm --prefix ../frontier-baseline run build
npm ci --ignore-scripts
npm run build
node --expose-gc benchmarks/diff-performance.mjs \
  --baseline ../frontier-baseline --rounds 11 --target-ms 5 --ablation \
  --out benchmarks/results/local-run.json
```

Repeat in fresh processes. `--filter text/` or another fixture substring selects
a subset. `--ablation` builds a temporary copy of the compiled modules with the
cost bands disabled and deletes that copy when finished. It does not modify
the source or distribution. Raw reports include every sample, batch size,
environment, baseline commit, and a SHA-256 of the changed runtime sources.

## Correctness checks

- Package build, TypeScript consumer tests, smoke tests, and core tests.
- 1,248 targeted diff cases, including 800 randomized text-edit pairs with
  Unicode/lone surrogates and 100 larger keyed permutations with text edits.
- 500 independent sequential-splice models, tested at the root and inside
  objects, with mutable and immutable replay and run boundaries.
- Direct normalization regressions and a cost-band versus position-band case.
- 21,000 seeded JSON fuzz cases on Node 22 and 10,000 on Node 24; targeted
  performance-regression tests also run on both versions.

## Results

The tables below are generated from the retained benchmark reports. Node 22
values are medians of the three process medians; Node 24 is a separate check.

<!-- generated-results -->

### Selected results

All timings are microseconds. Adaptive mode includes the default optimizations.

| Fixture | Baseline diff | Default diff | Adaptive diff | Baseline pipeline | Adaptive/default pipeline | Patch bytes: baseline → adaptive/default |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| rows/10000/reverse | 12,828.88 | 1,124.80 | — | 14,223.87 | 2,712.46 | 641,680 → 641,680 |
| rows/10000/shuffle | 8,153.71 | 1,502.68 | — | 9,600.71 | 3,127.63 | 641,680 → 641,680 |
| text/100000/three-inserts | 388.40 | 114.11 | 20.14 | 489.20 | 27.74 | 60,047 → 79 |
| text/100000/mixed-24 | 153.55 | 38.13 | 46.38 | 322.45 | 52.28 | 92,381 → 1,167 |
| corpus/src/diff.ts/mixed-24 | 194.76 | 59.86 | 58.74 | 603.92 | 92.90 | 208,126 → 1,180 |
| corpus/src/diff.ts/clustered-24 | 387.76 | 104.69 | 47.12 | 467.99 | 78.51 | 43,635 → 1,167 |
| text/repeated-8000/copy-prefix-miss | 80,650.83 | 2.08 | 2.56 | 80,971.08 | 17.15 | 8,147 → 8,147 |

### Paper-specific ablation

Position-only is the same adaptive planner and replay code with the cost predictor disabled. The late-large cases isolate a positive effect; the early-large controls show its limits.

| Fixture | Position diff | Cost-guided diff | Position pipeline | Cost-guided pipeline | Position bytes | Cost-guided bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| text/uneven-200/large-late | 26.33 | 26.45 | 35.74 | 35.48 | 274 | 274 |
| text/uneven-200/large-early | 26.55 | 26.61 | 34.48 | 34.54 | 274 | 274 |
| text/uneven-500/large-late | 24.97 | 33.17 | 47.26 | 41.37 | 8559 | 574 |
| text/uneven-500/large-early | 25.04 | 31.10 | 46.56 | 53.91 | 8559 | 8559 |
| text/uneven-1000/large-late | 24.42 | 32.61 | 47.20 | 42.32 | 9059 | 1074 |
| text/uneven-1000/large-early | 25.01 | 27.82 | 46.92 | 52.88 | 9059 | 9059 |

### Default strategy: complete matrix

| Fixture | Baseline diff | Default diff | Diff speedup | Baseline pipeline | Default pipeline |
| --- | ---: | ---: | ---: | ---: | ---: |
| object/small-field | 0.35 | 0.37 | 0.93x | 0.52 | 0.52 |
| rows/1000/same-reference | 0.04 | 0.04 | 0.97x | 0.08 | 0.08 |
| rows/1000/equal-clone | 276.97 | 276.99 | 1.00x | 272.89 | 278.51 |
| rows/1000/field-edit | 230.82 | 229.26 | 1.01x | 230.61 | 228.23 |
| rows/1000/dirty-path | 0.18 | 0.18 | 0.99x | 1.44 | 1.34 |
| rows/1000/single-move | 101.13 | 100.89 | 1.00x | 101.32 | 101.60 |
| rows/1000/reverse | 1,154.37 | 280.62 | 4.11x | 1,228.02 | 360.92 |
| rows/1000/shuffle | 732.45 | 294.07 | 2.49x | 825.49 | 367.95 |
| rows/1000/insert-delete | 213.73 | 210.44 | 1.02x | 217.05 | 219.41 |
| rows/10000/same-reference | 0.06 | 0.05 | 1.20x | 0.09 | 0.08 |
| rows/10000/equal-clone | 2,892.50 | 2,958.98 | 0.98x | 2,924.63 | 2,969.83 |
| rows/10000/field-edit | 2,454.46 | 2,506.15 | 0.98x | 2,432.65 | 2,555.81 |
| rows/10000/dirty-path | 0.15 | 0.15 | 1.00x | 13.31 | 10.20 |
| rows/10000/single-move | 959.77 | 957.78 | 1.00x | 936.83 | 949.26 |
| rows/10000/reverse | 12,828.88 | 1,124.80 | 11.41x | 14,223.87 | 2,712.46 |
| rows/10000/shuffle | 8,153.71 | 1,502.68 | 5.43x | 9,600.71 | 3,127.63 |
| rows/10000/insert-delete | 2,663.98 | 2,734.94 | 0.97x | 2,696.31 | 2,812.62 |
| rows/1200/rotate-510 | 440.44 | 439.66 | 1.00x | 511.30 | 515.25 |
| rows/1200/rotate-512 | 443.84 | 451.54 | 0.98x | 517.56 | 518.08 |
| rows/1200/rotate-513 | 1,002.01 | 352.62 | 2.84x | 1,094.28 | 455.64 |
| array/scalar-sparse | 64.37 | 64.34 | 1.00x | 75.59 | 69.44 |
| array/tuples | 20.50 | 21.62 | 0.95x | 24.57 | 25.25 |
| text/10000/equal | 0.04 | 0.04 | 1.12x | 0.07 | 0.07 |
| text/10000/append | 0.29 | 0.28 | 1.04x | 0.39 | 0.39 |
| text/10000/truncate | 0.30 | 0.28 | 1.08x | 0.44 | 0.37 |
| text/10000/single-insert | 2.32 | 2.47 | 0.94x | 2.47 | 2.42 |
| text/10000/three-inserts | 69.70 | 20.45 | 3.41x | 81.67 | 31.15 |
| text/10000/mixed-24 | 24.07 | 5.48 | 4.39x | 41.02 | 22.28 |
| text/10000/clustered-24 | 171.52 | 171.59 | 1.00x | 175.78 | 176.54 |
| text/10000/unrelated | 1.81 | 0.19 | 9.51x | 19.84 | 18.17 |
| text/100000/equal | 0.04 | 0.04 | 1.03x | 0.07 | 0.07 |
| text/100000/append | 2.12 | 2.09 | 1.01x | 2.24 | 2.24 |
| text/100000/truncate | 1.91 | 1.94 | 0.99x | 2.09 | 2.12 |
| text/100000/single-insert | 9.42 | 9.41 | 1.00x | 9.41 | 9.59 |
| text/100000/three-inserts | 388.40 | 114.11 | 3.40x | 489.20 | 223.08 |
| text/100000/mixed-24 | 153.55 | 38.13 | 4.03x | 322.45 | 204.46 |
| text/100000/clustered-24 | 247.80 | 85.54 | 2.90x | 281.71 | 120.52 |
| text/100000/unrelated | 14.64 | 0.30 | 49.33x | 199.40 | 179.15 |
| corpus/README.md/mixed-24 | 96.90 | 23.35 | 4.15x | 185.28 | 108.17 |
| corpus/README.md/clustered-24 | 147.07 | 55.41 | 2.65x | 166.20 | 74.39 |
| corpus/src/diff.ts/mixed-24 | 194.76 | 59.86 | 3.25x | 603.92 | 458.77 |
| corpus/src/diff.ts/clustered-24 | 387.76 | 104.69 | 3.70x | 467.99 | 185.22 |
| text/unicode/mixed-24 | 45,532.00 | 78.68 | 578.70x | 46,228.71 | 273.34 |
| text/uneven-200/large-late | 86.04 | 36.33 | 2.37x | 231.11 | 177.45 |
| text/uneven-200/large-early | 203.80 | 202.08 | 1.01x | 347.19 | 345.73 |
| text/uneven-500/large-late | 87.86 | 36.32 | 2.42x | 230.98 | 180.82 |
| text/uneven-500/large-early | 203.86 | 204.56 | 1.00x | 345.63 | 343.11 |
| text/uneven-1000/large-late | 85.60 | 36.56 | 2.34x | 230.88 | 176.96 |
| text/uneven-1000/large-early | 202.68 | 204.57 | 0.99x | 345.97 | 345.65 |
| text/repeated-2000/copy-prefix-miss | 4,666.92 | 0.60 | 7749.12x | 4,724.52 | 4.58 |
| text/repeated-2000/copy-prefix-hit | 5.16 | 0.89 | 5.77x | 5.34 | 1.34 |
| text/repeated-8000/copy-prefix-miss | 80,650.83 | 2.08 | 38796.14x | 80,971.08 | 17.10 |
| text/repeated-8000/copy-prefix-hit | 20.72 | 2.32 | 8.92x | 21.27 | 3.88 |
| text/copy-insert | 2.91 | 2.93 | 0.99x | 3.00 | 2.92 |
| text/copy-suffix | 25.04 | 16.27 | 1.54x | 25.84 | 17.23 |

### Adaptive mode: complete text matrix

This comparison uses the already optimized default as the control. Declined searches may cost extra without reducing the patch. Multiple splices may also increase replay cost relative to one large splice.

| Fixture | Default diff | Adaptive diff | Default pipeline | Adaptive pipeline | Default JSON bytes | Adaptive JSON bytes | Adaptive gzip bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| text/10000/equal | 0.04 | 0.05 | 0.07 | 0.08 | 2 | 2 | 22 |
| text/10000/append | 0.28 | 0.29 | 0.39 | 0.39 | 27 | 27 | 47 |
| text/10000/truncate | 0.28 | 0.29 | 0.37 | 0.39 | 19 | 19 | 39 |
| text/10000/single-insert | 2.47 | 2.37 | 2.42 | 2.53 | 26 | 26 | 46 |
| text/10000/three-inserts | 20.45 | 9.05 | 31.15 | 9.74 | 6045 | 76 | 61 |
| text/10000/mixed-24 | 5.48 | 17.99 | 22.28 | 34.87 | 9579 | 9579 | 5439 |
| text/10000/clustered-24 | 171.59 | 177.84 | 176.54 | 176.48 | 2296 | 2296 | 1052 |
| text/10000/unrelated | 0.19 | 2.91 | 18.17 | 20.94 | 10019 | 10019 | 6065 |
| text/100000/equal | 0.04 | 0.04 | 0.07 | 0.08 | 2 | 2 | 22 |
| text/100000/append | 2.09 | 2.09 | 2.24 | 2.25 | 28 | 28 | 45 |
| text/100000/truncate | 1.94 | 1.95 | 2.12 | 2.10 | 20 | 20 | 40 |
| text/100000/single-insert | 9.41 | 9.43 | 9.59 | 9.58 | 27 | 27 | 47 |
| text/100000/three-inserts | 114.11 | 20.14 | 223.08 | 27.74 | 60047 | 79 | 64 |
| text/100000/mixed-24 | 38.13 | 46.38 | 204.46 | 52.28 | 92381 | 1167 | 198 |
| text/100000/clustered-24 | 85.54 | 31.67 | 120.52 | 38.33 | 19548 | 1169 | 193 |
| text/100000/unrelated | 0.30 | 6.73 | 179.15 | 192.83 | 100020 | 100020 | 60668 |
| corpus/README.md/mixed-24 | 23.35 | 72.11 | 108.17 | 156.83 | 48564 | 48564 | 10573 |
| corpus/README.md/clustered-24 | 55.41 | 71.68 | 74.39 | 91.51 | 10357 | 10357 | 2613 |
| corpus/src/diff.ts/mixed-24 | 59.86 | 58.74 | 458.77 | 92.90 | 208126 | 1180 | 215 |
| corpus/src/diff.ts/clustered-24 | 104.69 | 47.12 | 185.22 | 78.51 | 43635 | 1167 | 205 |
| text/unicode/mixed-24 | 78.68 | 94.24 | 273.34 | 133.00 | 93231 | 3133 | 361 |
| text/uneven-200/large-late | 36.33 | 26.45 | 177.45 | 35.48 | 78242 | 274 | 61 |
| text/uneven-200/large-early | 202.08 | 26.61 | 345.73 | 34.54 | 78242 | 274 | 57 |
| text/uneven-500/large-late | 36.32 | 33.17 | 180.82 | 41.37 | 78542 | 574 | 63 |
| text/uneven-500/large-early | 204.56 | 31.10 | 343.11 | 53.91 | 78542 | 8559 | 4907 |
| text/uneven-1000/large-late | 36.56 | 32.61 | 176.96 | 42.32 | 79042 | 1074 | 65 |
| text/uneven-1000/large-early | 204.57 | 27.82 | 345.65 | 52.88 | 79042 | 9059 | 4911 |
| text/repeated-2000/copy-prefix-miss | 0.60 | 1.13 | 4.58 | 5.04 | 2147 | 2147 | 55 |
| text/repeated-2000/copy-prefix-hit | 0.89 | 1.42 | 1.34 | 1.88 | 38 | 38 | 51 |
| text/repeated-8000/copy-prefix-miss | 2.08 | 2.56 | 17.10 | 17.15 | 8147 | 8147 | 64 |
| text/repeated-8000/copy-prefix-hit | 2.32 | 2.84 | 3.88 | 4.53 | 38 | 38 | 51 |
| text/copy-insert | 2.93 | 2.83 | 2.92 | 2.95 | 23 | 23 | 40 |
| text/copy-suffix | 16.27 | 16.21 | 17.23 | 16.93 | 48 | 48 | 61 |

### Node 24 cross-check

One independent process; not pooled with Node 22.

| Fixture | Baseline diff | Default diff | Adaptive diff | Baseline pipeline | Adaptive/default pipeline |
| --- | ---: | ---: | ---: | ---: | ---: |
| rows/10000/reverse | 13,038.88 | 1,147.59 | — | 14,311.83 | 2,752.25 |
| rows/10000/shuffle | 7,737.58 | 1,458.89 | — | 9,596.79 | 3,098.19 |
| text/100000/three-inserts | 396.91 | 116.74 | 20.20 | 407.08 | 23.48 |
| text/100000/mixed-24 | 155.77 | 38.25 | 40.94 | 183.55 | 46.01 |
| corpus/src/diff.ts/mixed-24 | 198.69 | 60.38 | 57.05 | 341.84 | 85.34 |
| corpus/src/diff.ts/clustered-24 | 393.84 | 106.04 | 44.98 | 426.81 | 72.35 |
| text/repeated-8000/copy-prefix-miss | 84,830.92 | 2.08 | 2.94 | 83,359.50 | 5.47 |

### Raw evidence

- [Aggregated Node 22 results](results/summary.json) include per-process median ranges and median batch p95.
- [node22-run1 raw samples](results/node22-run1.json.gz) (gzip-compressed JSON).
- [node22-run2 raw samples](results/node22-run2.json.gz) (gzip-compressed JSON).
- [node22-run3 raw samples](results/node22-run3.json.gz) (gzip-compressed JSON).
- [node24-run1 raw samples](results/node24-run1.json.gz) (gzip-compressed JSON).

Regenerate the tables with `node benchmarks/summarize-diff-performance.mjs`. It accepts either raw `.json` files or the retained `.json.gz` files.
