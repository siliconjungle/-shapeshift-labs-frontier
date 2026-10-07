import assert from 'node:assert/strict';
import { diff, diffStable, diffInto, applyPatch, applyPatchImmutable, normalizePatch, assertPatch, OP_STRING_SPLICE } from '../dist/index.js';
import { tryAlignString } from '../dist/string-align.js';

let seed = 0x3798ab1;
function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
const alphabet = 'abcdefghijklmnop0123456789\"\\\n\t🌿中é\ud800\udfff';
function text(n) { let result = ''; for (let i = 0; i < n; i++) result += alphabet[Math.floor(random() * alphabet.length)]; return result; }
let cases = 0;
// Normalization must not confuse a shared path prefix with the same parent.
for (const patch of [
  [[4, [0, 'nested'], { a: 1 }], [0, [0, 'root'], 1]],
  [[0, [0, 'root'], 1], [4, [0, 'nested'], { a: 1 }]],
  [[4, [], { a: 1 }], [0, ['nested', 'b'], 2]],
  [[0, ['a'], 1], [4, ['nested'], { b: 2 }]]
]) {
  const before = Array.isArray(patch[0][1]) && patch[0][1][0] === 0 ? [{ nested: { a: 0 }, root: 0 }] : { a: 0, nested: { b: 0 } };
  assert.deepEqual(applyPatchImmutable(before, normalizePatch(patch)), applyPatchImmutable(before, patch));
}
function check(before, after, options = {}) {
  const snapshot = structuredClone(before);
  const patch = diff(before, after, options);
  assertPatch(patch);
  assert.deepEqual(applyPatchImmutable(before, patch), after, 'immutable ' + cases);
  assert.deepEqual(applyPatch(structuredClone(before), patch, { cloneValues: true }), after, 'mutable ' + cases);
  assert.deepEqual(applyPatchImmutable(before, normalizePatch(patch)), after, 'normalized ' + cases);
  assert.deepEqual(before, snapshot, 'source mutated ' + cases);
  assert.deepEqual(diffInto(before, after, [[0, [], null]], options), patch);
  const stable = diffStable(before, after, options);
  assert.deepEqual(stable, diffStable(before, after, options));
  assert.deepEqual(applyPatchImmutable(before, stable), after);
  cases++;
  return patch;
}

// Exercise both native copy searches, including overlapping/repeated matches,
// same-source forward copies, backward copies, replacements and Unicode units.
for (const n of [63, 64, 65, 127, 128, 129, 256, 2000, 8000]) {
  check('b' + 'a'.repeat(n) + 'Z', 'a'.repeat(n) + 'Y'.repeat(129));
  check('b' + 'a'.repeat(n) + 'Z', 'a'.repeat(n) + 'Y');
  const body = text(n), before = 'HEAD' + body + 'TAIL';
  for (const at of [0, 4, Math.floor(before.length / 2), before.length]) {
    for (const literal of ['', 'new', 'x'.repeat(128), 'x'.repeat(129)]) {
      const insert = literal + body;
      check(before, before.slice(0, at) + insert + before.slice(at));
      check(before, before.slice(0, at) + insert + before.slice(at + 3));
    }
  }
}

const a = text(40000);
const edits = [[30000, 0, 'insert-one'], [20000, 9, ''], [10000, 0, 'insert-two']];
let b = a;
for (const [at, remove, insert] of edits) b = b.slice(0, at) + insert + b.slice(at + remove);
const optimized = check(a, b, { textDiff: 'adaptive' });
assert(optimized.length >= 2, 'planner must actually emit several splices');
assert(Buffer.byteLength(JSON.stringify(optimized)) < Buffer.byteLength(JSON.stringify(diff(a, b))) / 10);
assert(optimized.every(op => op[0] === OP_STRING_SPLICE));
check({ doc: { text: a }, same: [1, 2] }, { doc: { text: b }, same: [1, 2] }, { textDiff: 'adaptive' });
check({ text: a }, { text: b }, { textDiff: 'adaptive', dirtyPaths: [['text']] });
check([a], [b], { textDiff: 'adaptive', dirtyRows: [{ path: [], rows: [0] }] });
check(a, b, { textDiff: 'adaptive', maxPatchOperations: 1 });
assert.equal(diff(a, b, { textDiff: 'adaptive', maxPatchOperations: 1 }).length, 1);

// Direct planner tests cover both band variants; most randomized tests below
// use the public API, including exact fallbacks when the work budget runs out.
for (const bands of [true, false]) {
  const patch = [];
  if (tryAlignString(patch, [], a, b, 0, a.length, b.length, bands)) assert.equal(applyPatchImmutable(a, patch), b);
}
// The cost-dependent prediction must add something beyond the position-only
// ablation: a small early insertion and a large late one displace the linear
// midpoint while most of the intervening text remains equal.
let unevenSeed = 11;
const uneven = Array.from({ length: 100000 }, () => {
  unevenSeed = (Math.imul(unevenSeed, 1664525) + 1013904223) >>> 0;
  return String.fromCharCode(97 + unevenSeed % 26);
}).join('');
let unevenAfter = uneven;
for (const [at, count] of [[80000, 10], [10000, 1000], [2000, 10]]) unevenAfter = unevenAfter.slice(0, at) + 'X'.repeat(count) + unevenAfter.slice(at);
const costPatch = [], positionPatch = [];
assert(tryAlignString(costPatch, [], uneven, unevenAfter, 0, uneven.length, unevenAfter.length, true));
assert(tryAlignString(positionPatch, [], uneven, unevenAfter, 0, uneven.length, unevenAfter.length, false));
assert.equal(applyPatchImmutable(uneven, costPatch), unevenAfter);
assert.equal(applyPatchImmutable(uneven, positionPatch), unevenAfter);
assert(JSON.stringify(costPatch).length < JSON.stringify(positionPatch).length / 2);
check(uneven, unevenAfter, { textDiff: 'adaptive' });
let compact = 0;
for (let c = 0; c < 800; c++) {
  const length = 100 + Math.floor(random() * 15000);
  const before = c % 5 === 0 ? ('abc🌿 xyz '.repeat(Math.ceil(length / 10))) : text(length);
  let after = before;
  for (let e = 0, count = 1 + Math.floor(random() * 25); e < count; e++) {
    const at = Math.floor(random() * (after.length + 1));
    const remove = Math.floor(random() * 150);
    const insert = text(Math.floor(random() * 150));
    after = after.slice(0, at) + insert + after.slice(at + remove);
  }
  const patch = check(before, after, { textDiff: 'adaptive' });
  if (patch.length > 1) compact++;
}
assert(compact > 50, 'generated cases must exercise the planner, not only its fallback');

// Guard boundaries and non-permutations. A trusted unique key set is required
// for the n-LIS move lower bound; duplicates, insertions and removals must replay.
for (const n of [8, 512, 513, 514, 1024, 4096]) {
  const before = Array.from({ length: n }, (_, id) => ({ id, score: id }));
  const reversed = structuredClone(before).reverse();
  check(before, reversed, { arrayKey: 'id' });
  for (const move of [1, 510, 512, 513].filter(x => x < n)) check(before, [...before.slice(move), ...before.slice(0, move)], { arrayKey: 'id' });
  check(before, [{ id: 'new', score: 0 }, ...reversed.slice(1)], { arrayKey: 'id' });
  const duplicate = structuredClone(before); duplicate[duplicate.length - 1].id = 0;
  check(duplicate, [...duplicate].reverse(), { arrayKey: 'id' });
}
for (let c = 0; c < 100; c++) {
  const before = Array.from({ length: 550 + Math.floor(random() * 1000) }, (_, id) => ({ id, text: id === 0 ? a : String(id) }));
  const after = structuredClone(before);
  for (let i = after.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [after[i], after[j]] = [after[j], after[i]]; }
  after.find(x => x.id === 0).text = b;
  check(before, after, { arrayKey: 'id', textDiff: 'adaptive' });
}
// Independent sequential string model covers mixed widths, adjacent edits,
// edits to already inserted text, and run boundaries at different JSON paths.
for (let c = 0; c < 500; c++) {
  const before = text(1000);
  let expected = before;
  const patch = [];
  for (let i = 0; i < 12; i++) {
    const at = c % 2 ? Math.floor(random() * (expected.length + 1)) : Math.min(expected.length, i * 70);
    const count = Math.min(Math.floor(random() * 30), expected.length - at);
    const insert = text(Math.floor(random() * 30));
    patch.push([5, [], at, count, insert]);
    expected = expected.slice(0, at) + insert + expected.slice(at + count);
  }
  assert.equal(applyPatchImmutable(before, patch), expected);
  assert.equal(applyPatch(before, patch), expected);
  const nested = patch.map(op => [op[0], ['text'], ...op.slice(2)]);
  nested.splice(5, 0, [0, ['flag'], true]);
  const original = { text: before, flag: false, untouched: { value: 1 } };
  const result = applyPatchImmutable(original, nested);
  assert.deepEqual(result, { text: expected, flag: true, untouched: { value: 1 } });
  assert.equal(result.untouched, original.untouched);
  assert.equal(original.text, before);
  assert.deepEqual(applyPatch(structuredClone(original), nested), result);
}
console.log(`frontier performance regression tests passed: ${cases} cases; ${compact} generated multi-op text patches`);
