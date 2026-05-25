import assert from 'node:assert';

const frontier = await import('../dist/index.js');
const diffOnly = await import('../dist/diff.js');
const patchOnly = await import('../dist/patch.js');

roundTrip('object field edit', {
  meta: { version: 1, owner: 'frontier' },
  flags: { active: true }
}, {
  meta: { version: 2, owner: 'frontier' },
  flags: { active: true }
});

roundTrip('keyed array row move and field edit', {
  rows: [
    { id: 'a', score: 1, active: true },
    { id: 'b', score: 2, active: false },
    { id: 'c', score: 3, active: true }
  ]
}, {
  rows: [
    { id: 'c', score: 3, active: true },
    { id: 'a', score: 10, active: true },
    { id: 'b', score: 2, active: false }
  ]
}, { arrayKey: 'id' });

roundTrip('dirty path localized update', {
  doc: { title: 'Spec', body: 'hello world' },
  untouched: { count: 1 }
}, {
  doc: { title: 'Spec', body: 'hello brave world' },
  untouched: { count: 1 }
}, { dirtyPaths: [['doc', 'body']] });

roundTrip('dirty row field assignment', {
  rows: [
    { id: 'a', score: 1, label: 'A' },
    { id: 'b', score: 2, label: 'B' },
    { id: 'c', score: 3, label: 'C' }
  ]
}, {
  rows: [
    { id: 'a', score: 1, label: 'A' },
    { id: 'b', score: 20, label: 'Bee' },
    { id: 'c', score: 3, label: 'C' }
  ]
}, {
  dirtyRows: [{
    path: ['rows'],
    rows: [1],
    fields: [['score'], ['label']]
  }]
});

roundTrip('root array splice', [1, 2, 3, 4], [1, 'two', 3, 4, 5]);
roundTrip('root scalar replacement', false, { ok: true });
roundTrip('unicode text splice', { text: 'hello 🌿 world' }, { text: 'hello fast 🌿 world' });

const jsonPatchSource = { a: { b: 1 }, list: [1, 2] };
const jsonPatched = frontier.applyJsonPatchImmutable(jsonPatchSource, [
  { op: 'replace', path: '/a/b', value: 2 },
  { op: 'add', path: '/list/-', value: 3 }
]);
assert.deepStrictEqual(jsonPatched, { a: { b: 2 }, list: [1, 2, 3] });
assert.deepStrictEqual(jsonPatchSource, { a: { b: 1 }, list: [1, 2] });

assert.strictEqual(frontier.stringifyPointer(['a/b', 'c~d', 0]), '/a~1b/c~0d/0');
assert.deepStrictEqual(frontier.parsePointer('/a~1b/c~0d/0'), ['a/b', 'c~d', '0']);
assert.strictEqual(frontier.getPointer({ 'a/b': { 'c~d': ['ok'] } }, '/a~1b/c~0d/0'), 'ok');
assert.strictEqual(diffOnly.diff, frontier.diff);
assert.strictEqual(patchOnly.OP_SET, frontier.OP_SET);

console.log('frontier core diff tests passed');

function roundTrip(name, before, after, options) {
  const patch = frontier.diff(before, after, options);
  frontier.assertPatch(patch);
  assert.deepStrictEqual(frontier.applyPatchImmutable(before, patch), after, name + ' immutable apply');
  assert.deepStrictEqual(frontier.applyPatch(frontier.cloneJson(before), patch, { cloneValues: true }), after, name + ' mutable apply');
  assert.strictEqual(frontier.equalsJson(frontier.applyPatchImmutable(before, patch), after), true, name + ' equalsJson');

  const stableA = frontier.diffStable(before, after, options);
  const stableB = frontier.diffStable(before, after, options);
  assert.deepStrictEqual(stableA, stableB, name + ' stable deterministic');
  frontier.assertPatch(stableA);
  assert.deepStrictEqual(frontier.applyPatchImmutable(before, stableA), after, name + ' stable apply');
}
