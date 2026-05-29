import {
  OP_SET,
  applyPatchImmutable,
  cloneJson,
  diff,
  diffInto,
  equalsJsonFast,
  parsePointer,
  stringifyPointer,
  type DiffOptions,
  type DirtyRowsFrontier,
  type JsonPath,
  type JsonValue,
  type Patch,
  type PatchOperation
} from '@shapeshift-labs/frontier';
import { diff as diffFromSubpath } from '@shapeshift-labs/frontier/diff';
import { applyPatchImmutable as applyFromPatchSubpath } from '@shapeshift-labs/frontier/patch';
import {
  FRONTIER_RUNTIME_WORK_AREAS,
  createRuntimeBudget,
  createRuntimeScheduler,
  type FrontierRuntimeScheduler
} from '@shapeshift-labs/frontier/runtime';
import {
  createFrontierRegistry,
  frontierRegistryExplain,
  frontierRegistryFeatureNode,
  frontierRegistryImpact,
  frontierRegistryIndex,
  frontierRegistryMergeGraphs,
  frontierRegistryNode,
  frontierRegistryQuery,
  frontierRegistryTrace,
  frontierRegistryValidateGraph,
  type FrontierRegistryGraph,
  type FrontierRegistryImpact,
  type FrontierRegistryTrace
} from '@shapeshift-labs/frontier/registry';
import { type JsonObject, type JsonRecord } from '@shapeshift-labs/frontier/types';

type Todo = JsonObject & {
  id: string;
  done: boolean;
};

const before: JsonValue = {
  todos: [
    { id: 'a', done: false },
    { id: 'b', done: false }
  ],
  meta: { version: 1 }
};

const after: JsonValue = {
  todos: [
    { id: 'a', done: true },
    { id: 'b', done: false },
    { id: 'c', done: false }
  ],
  meta: { version: 2 }
};

const dirtyRows: DirtyRowsFrontier[] = [
  {
    path: ['todos'],
    rows: [0],
    fields: [['done']]
  }
];

const options: DiffOptions = {
  arrayKey: 'id',
  dirtyRows,
  validate: true
};

const patch: Patch = diff(before, after, options);
const reusable: Patch = [];
const intoResult: Patch = diffInto(before, after, reusable, { arrayKey: (row) => (row as Todo).id });
const manual: PatchOperation = [OP_SET, ['meta', 'version'], 3];
const cloned: JsonValue = cloneJson(after);
const path: JsonPath = parsePointer('/todos/0/done');
const pointer: string = stringifyPointer(path);
const record: JsonRecord = { ok: true };
const object: JsonObject = record;

applyPatchImmutable(before, patch);
applyFromPatchSubpath(before, [manual]);
diffFromSubpath(before, after, options);
equalsJsonFast(cloned, after);

const runtimeBudget = createRuntimeBudget({ maxUnits: 4, maxMs: 8 });
runtimeBudget.consume(1);
const runtimeScheduler: FrontierRuntimeScheduler = createRuntimeScheduler({
  maxUnits: 2,
  areaUnitBudgets: { logging: 1 }
});
runtimeScheduler.schedule({ area: FRONTIER_RUNTIME_WORK_AREAS[0], priority: 'high', run: () => undefined });
runtimeScheduler.run({ maxTasks: 1 });

const registry = createFrontierRegistry();
registry.register({
  id: 'types.action',
  kind: 'action',
  package: '@app/types',
  feature: 'types',
  source: { file: 'src/types.ts', exportName: 'typesAction' },
  reads: ['/value'],
  writes: [['value']],
  touches: [frontierRegistryNode('route', '/types')]
});
const registryGraph: FrontierRegistryGraph = registry.inspect();
const registryImpact: FrontierRegistryImpact = frontierRegistryImpact(registryGraph, { paths: ['/value'] });
const registryIndex = frontierRegistryIndex(registryGraph);
const registryQuery = frontierRegistryQuery(registryGraph, { packages: ['@app/types'] });
const registryValidation = frontierRegistryValidateGraph(registryGraph, { requireFeature: true });
const registryTrace: FrontierRegistryTrace = frontierRegistryTrace(registryGraph, {
  features: ['types'],
  targets: { nodes: [frontierRegistryFeatureNode('types')] }
});
const registryExplain = frontierRegistryExplain(registryGraph, { features: ['types'] });
const registryMerged: FrontierRegistryGraph = frontierRegistryMergeGraphs([registryGraph]);

void intoResult;
void pointer;
void object;
void runtimeBudget;
void registryImpact;
void registryIndex;
void registryQuery;
void registryValidation;
void registryTrace;
void registryExplain;
void registryMerged;
