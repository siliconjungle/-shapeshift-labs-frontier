import assert from 'node:assert';

const frontier = await import('../dist/index.js');
const diffOnly = await import('../dist/diff.js');
const patchOnly = await import('../dist/patch.js');

const before = {
  todos: [
    { id: 'a', done: false },
    { id: 'b', done: false }
  ],
  meta: { version: 1 }
};
const after = {
  todos: [
    { id: 'a', done: true },
    { id: 'b', done: false },
    { id: 'c', done: false }
  ],
  meta: { version: 2 }
};

const patch = frontier.diff(before, after, { arrayKey: 'id' });
assert.deepStrictEqual(frontier.applyPatchImmutable(before, patch), after);
assert.deepStrictEqual(frontier.applyPatch(frontier.cloneJson(before), patch), after);
assert.strictEqual(frontier.equalsJson(after, frontier.applyPatchImmutable(before, patch)), true);
assert.strictEqual(frontier.stringifyPointer(['todos', 0, 'done']), '/todos/0/done');
assert.strictEqual(frontier.OP_SET, patchOnly.OP_SET);
assert.strictEqual(diffOnly.diff, frontier.diff);
assert.strictEqual(frontier.createDiffEngine, undefined);
assert.strictEqual(frontier.createCrdtDocument, undefined);
assert.strictEqual(frontier.encodePatch, undefined);
assert.strictEqual(frontier.hashQueryKey, undefined);
