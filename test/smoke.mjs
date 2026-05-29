import assert from 'node:assert';

const frontier = await import('../dist/index.js');
const diffOnly = await import('../dist/diff.js');
const patchOnly = await import('../dist/patch.js');
const runtimeOnly = await import('../dist/runtime.js');
const registryOnly = await import('../dist/registry.js');

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

let now = 100;
const budget = runtimeOnly.createRuntimeBudget({ clock: () => now, maxMs: 5, maxUnits: 2 });
assert.strictEqual(budget.consume(), true);
assert.strictEqual(budget.consume(), true);
assert.strictEqual(budget.shouldYield(), true);
assert.strictEqual(budget.snapshot().usedUnits, 2);

const completed = [];
const scheduler = runtimeOnly.createRuntimeScheduler({ clock: () => now, maxUnits: 2 });
scheduler.schedule({ area: 'logging', priority: 'low', run: () => completed.push('logging') });
scheduler.schedule({ area: 'cache', run: () => completed.push('cache') });
scheduler.schedule({ area: 'diff', priority: 'high', run: () => completed.push('diff') });
const firstRun = scheduler.run();
assert.deepStrictEqual(completed, ['diff', 'cache']);
assert.strictEqual(firstRun.completed, 2);
assert.strictEqual(firstRun.pending, 1);
assert.deepStrictEqual(firstRun.completedByArea, { diff: 1, cache: 1 });
assert.deepStrictEqual(firstRun.pendingByArea, { logging: 1 });

const secondRun = scheduler.run({ maxUnits: 1 });
assert.deepStrictEqual(completed, ['diff', 'cache', 'logging']);
assert.strictEqual(secondRun.completed, 1);
assert.strictEqual(secondRun.pending, 0);

const registry = registryOnly.createFrontierRegistry({ generatedAt: () => 123 });
registry.register({
  id: 'todo.toggle',
  kind: 'action',
  package: '@app/todos',
  feature: 'todos',
  source: { file: 'src/features/todos/actions.ts', exportName: 'toggleTodo' },
  reads: ['/todos/*/done'],
  writes: [['todos', '*', 'done']],
  invalidates: ['todo.visible'],
  touches: [registryOnly.frontierRegistryNode('route', '/todos')],
  tags: ['mutation']
});
registry.register({
  id: 'todo.visible',
  kind: 'query',
  package: '@app/todos',
  feature: 'todos',
  source: { file: 'src/features/todos/selectors.ts', exportName: 'visibleTodos' },
  reads: ['/todos/*']
});
registry.register({
  id: 'todo.toggle.test',
  kind: 'test',
  package: '@app/todos',
  feature: 'todos',
  source: { file: 'src/features/todos/actions.test.ts' },
  covers: ['entry:todo.toggle'],
  tags: ['test']
});
registry.register({
  id: 'todo.state',
  kind: 'state',
  package: '@app/todos',
  feature: 'todos',
  source: { file: 'src/features/todos/state.ts' }
});
registry.record({
  id: 'act-1',
  entryId: 'todo.toggle',
  status: 'ok',
  writes: ['/todos/a/done']
});
registry.record({
  id: 'state-1',
  entryId: 'todo.state',
  status: 'ok',
  writes: ['/todos/a/text']
});
const graph = registry.inspect();
assert.strictEqual(graph.kind, 'frontier.registry.graph');
assert.strictEqual(graph.generatedAt, 123);
assert.ok(graph.edges.some((edge) => edge.kind === 'invalidates' && edge.to === 'entry:todo.visible'));
const impact = registryOnly.frontierRegistryImpact(graph, { paths: ['/todos/a/done'] });
assert.ok(impact.entries.some((entry) => entry.id === 'todo.toggle'));
assert.ok(impact.entries.some((entry) => entry.id === 'todo.visible'));
const index = registryOnly.frontierRegistryIndex(graph);
assert.deepStrictEqual(index.packages['@app/todos'].sort(), ['todo.state', 'todo.toggle', 'todo.toggle.test', 'todo.visible']);
assert.deepStrictEqual(index.files['src/features/todos/actions.ts'], ['todo.toggle']);
const queried = registryOnly.frontierRegistryQuery(graph, { tags: ['test'] });
assert.deepStrictEqual(queried.entries.map((entry) => entry.id), ['todo.toggle.test']);
const runtimePathQuery = registryOnly.frontierRegistryQuery(graph, { paths: ['/todos/a/text'] });
assert.ok(runtimePathQuery.entries.some((entry) => entry.id === 'todo.state'));
const validation = registryOnly.frontierRegistryValidateGraph(graph, { requireFeature: true, requireSource: true });
assert.strictEqual(validation.valid, true);
const trace = registryOnly.frontierRegistryTrace(graph, {
  ids: ['todo.toggle.test'],
  targets: { ids: ['todo.toggle'] },
  maxDepth: 3
});
assert.ok(trace.paths.some((path) => path.nodes.includes('entry:todo.toggle')));
const explain = registryOnly.frontierRegistryExplain(graph, { features: ['todos'] });
assert.strictEqual(explain.summary.featureCount, 1);
assert.strictEqual(explain.features[0].tests[0], 'todo.toggle.test');
assert.ok(explain.features[0].writes.includes('/todos/a/text'));
const merged = registryOnly.frontierRegistryMergeGraphs([graph, graph]);
assert.strictEqual(merged.entries.length, graph.entries.length);
