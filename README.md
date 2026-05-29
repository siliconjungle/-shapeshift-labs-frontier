# Frontier

Fast compact JSON diff and patch primitives for JavaScript values.

Frontier compares JSON-shaped data and emits a replayable compact patch. It is built for application state, cached API results, editor models, game state, compiler data, and other in-memory JSON values where the useful output is not just "different", but "what compact operations reproduce the new value?".

This package is the small core package. It has no runtime dependencies and does not include Frontier query helpers, codecs, engine planning, state subscriptions, caches, schema helpers, logging, mutation planning, CRDTs, sync, or rich text. It also exposes dependency-free `./runtime` and `./registry` subpaths for sharing scheduler and traceable feature-graph contracts across Frontier packages without creating higher-layer imports.

- npm: [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier)
- source: [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- license: MIT

## Related Packages

The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:

- [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query): Shared query-key, selector path, condition, entity identity, and table-shape primitives.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): Patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.
- [`@shapeshift-labs/frontier-state`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state): Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.
- [`@shapeshift-labs/frontier-dataflow`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dataflow): Serializable incremental dataflow and materialized-view graphs for Frontier apps, including selectors, dependency DAGs, filters, joins, aggregations, stale paths, recompute budgets, output patches, provenance records, and proof of why derived views changed.
- [`@shapeshift-labs/frontier-state-cache`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache): Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, scheduled persistence, and mutation bridge.
- [`@shapeshift-labs/frontier-state-cache-idb`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-idb): IndexedDB persistence adapter for Frontier state-cache snapshots and durable change logs.
- [`@shapeshift-labs/frontier-state-cache-file`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-file): Structured file persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-state-cache-sql`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-sql): SQL persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-schema`](https://www.npmjs.com/package/@shapeshift-labs/frontier-schema): JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.
- [`@shapeshift-labs/frontier-migrations`](https://www.npmjs.com/package/@shapeshift-labs/frontier-migrations): Boundary-first data migrations, import normalization, plugin/API version mapping, versioned envelopes, graph diagnostics, patch path rewrites, dry-run reports, and current-shape rehydration.
- [`@shapeshift-labs/frontier-event-log`](https://www.npmjs.com/package/@shapeshift-labs/frontier-event-log): Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.
- [`@shapeshift-labs/frontier-inspect`](https://www.npmjs.com/package/@shapeshift-labs/frontier-inspect): Cross-package inspection/evidence bundles, registry graph snapshots, feature/resource impact reports, timeline/event normalization, redaction, JSONL import/export, and AI-readable app feature maps.
- [`@shapeshift-labs/frontier-scheduler`](https://www.npmjs.com/package/@shapeshift-labs/frontier-scheduler): Deterministic work scheduling, lanes, cancellation, backpressure, frame policies, replay snapshots, and work graphs.
- [`@shapeshift-labs/frontier-logging`](https://www.npmjs.com/package/@shapeshift-labs/frontier-logging): Opt-in structured logging, browser telemetry, scheduled sinks, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.
- [`@shapeshift-labs/frontier-effects`](https://www.npmjs.com/package/@shapeshift-labs/frontier-effects): Serializable effect descriptors and resource graphs for Frontier apps, including fetch, storage, timers, navigation, workers, clipboard, broadcast, WebSocket, stream, policy metadata, runtime records, redaction, JSONL, proof helpers, and registry graph output.
- [`@shapeshift-labs/frontier-policy`](https://www.npmjs.com/package/@shapeshift-labs/frontier-policy): Serializable policy and capability decisions for Frontier apps, effects, views, sync, routes, traces, and AI tools.
- [`@shapeshift-labs/frontier-tools`](https://www.npmjs.com/package/@shapeshift-labs/frontier-tools): Serializable app action/tool manifests for AI-operable Frontier apps, including availability, validation, dry-run plans, patch previews, effect/tool constraints, execution records, rollback links, and registry graph output.
- [`@shapeshift-labs/frontier-sandbox`](https://www.npmjs.com/package/@shapeshift-labs/frontier-sandbox): Runtime-agnostic sandbox contracts for Frontier patch-producing actions, including manifests, declared reads/writes/capabilities, host-validated patch/effect/event/log results, dynamic source modules, source event replay, and structural runtime adapters.
- [`@shapeshift-labs/frontier-sandbox-quickjs`](https://www.npmjs.com/package/@shapeshift-labs/frontier-sandbox-quickjs): QuickJS/WebAssembly runtime adapter for Frontier sandbox actions, including invocation/runtime isolation modes, deadline and memory limits, dynamic source execution, and patch/effect result normalization.
- [`@shapeshift-labs/frontier-workflow`](https://www.npmjs.com/package/@shapeshift-labs/frontier-workflow): Serializable durable workflow/process manifests for Frontier apps, including steps, waits, approvals, timers, retries, expected patches, compensation, records, timelines, and registry graph output.
- [`@shapeshift-labs/frontier-worker`](https://www.npmjs.com/package/@shapeshift-labs/frontier-worker): Serializable worker and edge task descriptors for Frontier apps, including queues, idempotency keys, retry and timeout policy, declared reads/writes/effects, snapshots, patch outputs, produced assets, execution records, logs, trace links, proof hashes, dedupe indexes, and registry graph output.
- [`@shapeshift-labs/frontier-assets`](https://www.npmjs.com/package/@shapeshift-labs/frontier-assets): Serializable asset and content provenance graphs for Frontier apps, including source files, generated variants, thumbnails, LOD chunks, shader/material dependencies, transforms, hashes, owners, runtime consumers, review plans, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-blueprint`](https://www.npmjs.com/package/@shapeshift-labs/frontier-blueprint): Serializable Blueprint/Prefab flyweight templates for Frontier apps, including parameterized instantiation, deterministic ID/path remapping, compact overrides, variants, effective-state materialization, scene/state patch emission, dependency metadata, and registry graph output.
- [`@shapeshift-labs/frontier-triggers`](https://www.npmjs.com/package/@shapeshift-labs/frontier-triggers): Capability-gated event trigger registry, scoped event envelopes, listener/reaction rules, structured rejection, deterministic event-to-action scheduling, replay/provenance records, and registry graph output.
- [`@shapeshift-labs/frontier-virtual`](https://www.npmjs.com/package/@shapeshift-labs/frontier-virtual): DOM-neutral virtualization, layout providers, range materialization, grids, spatial/frustum indexes, patch invalidation, camera anchors, and serializable layout state.
- [`@shapeshift-labs/frontier-scene`](https://www.npmjs.com/package/@shapeshift-labs/frontier-scene): Patch-native 2D/3D scene graph, transform propagation, bounds queries, virtual/culling adapters, spatial invalidation, and camera/frustum materialization.
- [`@shapeshift-labs/frontier-pathfinding`](https://www.npmjs.com/package/@shapeshift-labs/frontier-pathfinding): Patch-native grid pathfinding, typed-array A*/Dijkstra search, flow fields, connected components, line-of-sight smoothing, dirty-cell invalidation, and scheduler-friendly path jobs.
- [`@shapeshift-labs/frontier-lod`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lod): Patch-native level-of-detail and significance selection for rendering and computation workloads, compact typed hot paths, multi-observer selection, budget degradation, materialization frames, and scheduler work plans.
- [`@shapeshift-labs/frontier-route`](https://www.npmjs.com/package/@shapeshift-labs/frontier-route): DOM-neutral app/game route resources, route and scene manifests, match/resolve/transition planning, dependency metadata, sessions, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-trace`](https://www.npmjs.com/package/@shapeshift-labs/frontier-trace): Serializable traces, spans, events, causal links, W3C trace context helpers, timeline/resource/path queries, critical-path analysis, registry graph output, JSONL/proof helpers, Chrome trace export, and redaction for app-wide feature observability.
- [`@shapeshift-labs/frontier-manifest`](https://www.npmjs.com/package/@shapeshift-labs/frontier-manifest): Build/static feature manifests for owners, routes, actions, states, migrations, tests, source files, assets, resources, tasks, dependency metadata, registry graph output, feature maps, JSONL export, and impact queries.
- [`@shapeshift-labs/frontier-view`](https://www.npmjs.com/package/@shapeshift-labs/frontier-view): Renderer-neutral view manifests, type defaults, validation frames, action bindings, visual channels, virtual/LOD hints, and data-to-representation mapping for Frontier apps.
- [`@shapeshift-labs/frontier-dom`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dom): Patch-native DOM and host renderer bindings, manifest hydration, JSX runtime/compiler helpers, SSR, devtools, and logging bridges.
- [`@shapeshift-labs/frontier-playwright`](https://www.npmjs.com/package/@shapeshift-labs/frontier-playwright): Playwright/headless automation probes for Frontier state, DOM, devtools, marks, and timeline queries.
- [`@shapeshift-labs/frontier-test`](https://www.npmjs.com/package/@shapeshift-labs/frontier-test): Serializable test/spec evidence manifests for Frontier apps, including fixtures, commands, expected patches/effects/routes/policies, coverage declarations, run plans, run records, report adapters, replay proofs, fuzzers, benchmarks, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-history`](https://www.npmjs.com/package/@shapeshift-labs/frontier-history): Serializable temporal explanation and causality records for Frontier apps, including field-change explanations, action/workflow/policy/effect/trace/test provenance, audit windows, undo planning, registry/provenance graph output, JSONL replay bundles, and proof hashes.
- [`@shapeshift-labs/frontier-application`](https://www.npmjs.com/package/@shapeshift-labs/frontier-application): Serializable whole-application graph and impact queries for Frontier apps, including features, owners, packages, routes, views, actions, mutations, state paths, effects, workers, assets, tests, traces, policies, workflows, migrations, benchmarks, registry graph output, feature maps, JSONL bundles, and proof hashes.
- [`@shapeshift-labs/frontier-linter`](https://www.npmjs.com/package/@shapeshift-labs/frontier-linter): Serializable Frontier lint rules, diagnostics, fixes, reports, and fast rule execution for package catalogs, registry graphs, application maps, manifests, traces, policies, workflows, workers, assets, tests, benchmarks, and source snippets.
- [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt): Native CRDT documents, update tooling, awareness, branches, conflict introspection, version frames, and undo.
- [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync): CRDT sync endpoints, repo/storage/provider contracts, scheduled sync work, document URLs, local networks, model checking, forensics, and text binding contracts.
- [`@shapeshift-labs/frontier-crdt-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-websocket): WebSocket client/server transports for Frontier CRDT sync providers.
- [`@shapeshift-labs/frontier-react`](https://www.npmjs.com/package/@shapeshift-labs/frontier-react): React external-store hooks and adapters for Frontier state, cache, and CRDT surfaces.
- [`@shapeshift-labs/frontier-richtext`](https://www.npmjs.com/package/@shapeshift-labs/frontier-richtext): Rich text Delta normalization/application, marks, embeds, ranges, and cursor/selection transforms for local editor integrations.
- [`@shapeshift-labs/frontier-realtime`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime): Shared realtime command, tick, snapshot, prediction, reconciliation, interpolation, rollback, message, and delta primitives.
- [`@shapeshift-labs/frontier-realtime-server`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-server): Authoritative realtime room, tick, command validation, rate-limit, session, and snapshot-history runtime.
- [`@shapeshift-labs/frontier-realtime-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-websocket): WebSocket client, wire, and Node room-server transport for Frontier realtime.
- [`@shapeshift-labs/frontier-game`](https://www.npmjs.com/package/@shapeshift-labs/frontier-game): Game-facing entity, component, player, room, ownership, spatial interest, rollback, physics, and replication helpers above realtime.

Package source repositories:

- [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- [`siliconjungle/-shapeshift-labs-frontier-query`](https://github.com/siliconjungle/-shapeshift-labs-frontier-query)
- [`siliconjungle/-shapeshift-labs-frontier-codec`](https://github.com/siliconjungle/-shapeshift-labs-frontier-codec)
- [`siliconjungle/-shapeshift-labs-frontier-engine`](https://github.com/siliconjungle/-shapeshift-labs-frontier-engine)
- [`siliconjungle/-shapeshift-labs-frontier-state`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state)
- [`siliconjungle/-shapeshift-labs-frontier-dataflow`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dataflow)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-idb`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-idb)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-file`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-file)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-sql`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-sql)
- [`siliconjungle/-shapeshift-labs-frontier-schema`](https://github.com/siliconjungle/-shapeshift-labs-frontier-schema)
- [`siliconjungle/-shapeshift-labs-frontier-migrations`](https://github.com/siliconjungle/-shapeshift-labs-frontier-migrations)
- [`siliconjungle/-shapeshift-labs-frontier-event-log`](https://github.com/siliconjungle/-shapeshift-labs-frontier-event-log)
- [`siliconjungle/-shapeshift-labs-frontier-inspect`](https://github.com/siliconjungle/-shapeshift-labs-frontier-inspect)
- [`siliconjungle/-shapeshift-labs-frontier-scheduler`](https://github.com/siliconjungle/-shapeshift-labs-frontier-scheduler)
- [`siliconjungle/-shapeshift-labs-frontier-logging`](https://github.com/siliconjungle/-shapeshift-labs-frontier-logging)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)
- [`siliconjungle/-shapeshift-labs-frontier-effects`](https://github.com/siliconjungle/-shapeshift-labs-frontier-effects)
- [`siliconjungle/-shapeshift-labs-frontier-policy`](https://github.com/siliconjungle/-shapeshift-labs-frontier-policy)
- [`siliconjungle/-shapeshift-labs-frontier-tools`](https://github.com/siliconjungle/-shapeshift-labs-frontier-tools)
- [`siliconjungle/-shapeshift-labs-frontier-sandbox`](https://github.com/siliconjungle/-shapeshift-labs-frontier-sandbox)
- [`siliconjungle/-shapeshift-labs-frontier-sandbox-quickjs`](https://github.com/siliconjungle/-shapeshift-labs-frontier-sandbox-quickjs)
- [`siliconjungle/-shapeshift-labs-frontier-workflow`](https://github.com/siliconjungle/-shapeshift-labs-frontier-workflow)
- [`siliconjungle/-shapeshift-labs-frontier-worker`](https://github.com/siliconjungle/-shapeshift-labs-frontier-worker)
- [`siliconjungle/-shapeshift-labs-frontier-assets`](https://github.com/siliconjungle/-shapeshift-labs-frontier-assets)
- [`siliconjungle/-shapeshift-labs-frontier-blueprint`](https://github.com/siliconjungle/-shapeshift-labs-frontier-blueprint)
- [`siliconjungle/-shapeshift-labs-frontier-triggers`](https://github.com/siliconjungle/-shapeshift-labs-frontier-triggers)
- [`siliconjungle/-shapeshift-labs-frontier-virtual`](https://github.com/siliconjungle/-shapeshift-labs-frontier-virtual)
- [`siliconjungle/-shapeshift-labs-frontier-scene`](https://github.com/siliconjungle/-shapeshift-labs-frontier-scene)
- [`siliconjungle/-shapeshift-labs-frontier-pathfinding`](https://github.com/siliconjungle/-shapeshift-labs-frontier-pathfinding)
- [`siliconjungle/-shapeshift-labs-frontier-lod`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lod)
- [`siliconjungle/-shapeshift-labs-frontier-route`](https://github.com/siliconjungle/-shapeshift-labs-frontier-route)
- [`siliconjungle/-shapeshift-labs-frontier-trace`](https://github.com/siliconjungle/-shapeshift-labs-frontier-trace)
- [`siliconjungle/-shapeshift-labs-frontier-manifest`](https://github.com/siliconjungle/-shapeshift-labs-frontier-manifest)
- [`siliconjungle/-shapeshift-labs-frontier-view`](https://github.com/siliconjungle/-shapeshift-labs-frontier-view)
- [`siliconjungle/-shapeshift-labs-frontier-dom`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dom)
- [`siliconjungle/-shapeshift-labs-frontier-playwright`](https://github.com/siliconjungle/-shapeshift-labs-frontier-playwright)
- [`siliconjungle/-shapeshift-labs-frontier-test`](https://github.com/siliconjungle/-shapeshift-labs-frontier-test)
- [`siliconjungle/-shapeshift-labs-frontier-history`](https://github.com/siliconjungle/-shapeshift-labs-frontier-history)
- [`siliconjungle/-shapeshift-labs-frontier-application`](https://github.com/siliconjungle/-shapeshift-labs-frontier-application)
- [`siliconjungle/-shapeshift-labs-frontier-linter`](https://github.com/siliconjungle/-shapeshift-labs-frontier-linter)
- [`siliconjungle/-shapeshift-labs-frontier-crdt`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-websocket)
- [`siliconjungle/-shapeshift-labs-frontier-react`](https://github.com/siliconjungle/-shapeshift-labs-frontier-react)
- [`siliconjungle/-shapeshift-labs-frontier-richtext`](https://github.com/siliconjungle/-shapeshift-labs-frontier-richtext)
- [`siliconjungle/-shapeshift-labs-frontier-realtime`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime)
- [`siliconjungle/-shapeshift-labs-frontier-realtime-server`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-server)
- [`siliconjungle/-shapeshift-labs-frontier-realtime-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-websocket)
- [`siliconjungle/-shapeshift-labs-frontier-game`](https://github.com/siliconjungle/-shapeshift-labs-frontier-game)

## Install

```sh
npm install @shapeshift-labs/frontier
```

## Usage

```ts
import { applyPatchImmutable, diff } from '@shapeshift-labs/frontier';

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

const patch = diff(before, after, { arrayKey: 'id' });
const next = applyPatchImmutable(before, patch);

console.log(next);
```

## API

```ts
import {
  diff,
  diffInto,
  diffStable,
  applyPatch,
  applyPatchImmutable,
  applyJsonPatch,
  applyJsonPatchImmutable,
  normalizePatch,
  assertPatch,
  cloneJson,
  equalsJson,
  equalsJsonFast,
  parsePointer,
  stringifyPointer
} from '@shapeshift-labs/frontier';
```

### `diff(before, after, options?)`

Returns a compact Frontier patch.

Useful options:

- `arrayKey`: key or getter used to match object-array rows.
- `autoArrayKey`: enables conservative key detection for reordered object arrays.
- `dirtyPaths`: trusted changed paths supplied by a producer.
- `dirtyRows`: compact row-oriented dirty frontier.
- `fingerprintKey` / `versionKey`: trusted subtree tokens that skip unchanged branches.
- `maxPatchOperations`: emits one root replacement when a patch would be too long.
- `stable`: sorts object keys for deterministic patch order.

### `diffInto(before, after, reusablePatch, options?)`

Writes into a caller-owned patch array to reduce allocation in hot loops.

```ts
const patch = [];
for (const frame of frames) {
  diffInto(frame.before, frame.after, patch);
  send(patch);
}
```

### `applyPatch(value, patch, options?)`

Applies a Frontier patch mutably where possible. Pass `{ cloneValues: true }` if inserted patch values should be cloned before assignment.

### `applyPatchImmutable(value, patch, options?)`

Applies a Frontier patch without mutating the input root. This is usually the safest API for app state.

### JSON Pointer Helpers

```ts
import { getPointer, parsePointer, stringifyPointer } from '@shapeshift-labs/frontier';

const path = parsePointer('/todos/0/done');
const pointer = stringifyPointer(path);
const value = getPointer(document, pointer);
```

### Registry Graphs

`@shapeshift-labs/frontier/registry` defines the shared feature/method graph used by state engines, mutation actions, DOM manifests/devtools, Playwright probes, and logging telemetry:

```ts
import {
  createFrontierRegistry,
  frontierRegistryExplain,
  frontierRegistryImpact,
  frontierRegistryTrace
} from '@shapeshift-labs/frontier/registry';

const registry = createFrontierRegistry();
registry.register({
  id: 'todo.toggle',
  kind: 'action',
  package: '@app/todos',
  feature: 'todos',
  source: { file: 'src/features/todos/actions.ts', exportName: 'toggleTodo' },
  reads: ['/todos/*/done'],
  writes: ['/todos/*/done'],
  invalidates: ['todo.visible'],
  touches: ['route:/todos'],
  tags: ['mutation']
});

const graph = registry.inspect();
const impact = frontierRegistryImpact(graph, {
  paths: ['/todos/a/done']
});
const explain = frontierRegistryExplain(graph, {
  features: ['todos'],
  validation: { requireFeature: true, requireSource: true }
});
const trace = frontierRegistryTrace(graph, {
  ids: ['todo.toggle'],
  targets: { nodes: ['route:/todos'] }
});
```

The graph stores declarative edges and observed records as data. Production code can keep direct imports/calls while tools consume the sidecar graph for impact analysis, replay, validation, feature/package/tag/source-file indexes, and AI-readable traces.

### Equality And Clone Helpers

```ts
import { cloneJson, equalsJson, equalsJsonFast } from '@shapeshift-labs/frontier';

const copy = cloneJson(value);
const same = equalsJsonFast(copy, value);
```

### Runtime Budget Helpers

```ts
import { diff } from '@shapeshift-labs/frontier';
import { createRuntimeScheduler } from '@shapeshift-labs/frontier/runtime';

const scheduler = createRuntimeScheduler({ maxUnits: 48 });
const patch = diff(before, after);

scheduler.schedule({ area: 'diff', run: () => patch });
scheduler.schedule({ area: 'codec', run: () => JSON.stringify(patch) });
scheduler.schedule({ area: 'logging', priority: 'low', run: () => JSON.stringify({ event: 'patch', ops: patch.length }) });

const result = scheduler.run();
```

The runtime subpath is intentionally structural and dependency-free. It provides `createRuntimeBudget()`, `createRuntimeScheduler()`, and the standard work areas `diff`, `apply`, `codec`, `sync`, `cache`, and `logging`. Higher packages can use the same budget object shape without the core package importing any of those packages.

## Why Frontier Patches Are Compact

Frontier's patch format uses numeric tuple opcodes instead of verbose JSON Patch objects. It can represent common state changes directly:

- `OP_SET` for replacing a value.
- `OP_REMOVE` for deleting an object field or array item.
- `OP_APPEND` and `OP_ARRAY_SPLICE` for array edits.
- `OP_STRING_SPLICE` and `OP_STRING_COPY` for localized text changes.
- `OP_ARRAY_MOVE` for keyed row movement.
- `OP_ASSIGN`, `OP_ARRAY_OBJECT_ASSIGN`, and tuple/field assign ops for batches of related updates.

The normal invariant is:

```ts
applyPatchImmutable(before, diff(before, after)) === after
```

Use `diffStable()` or `{ stable: true }` when deterministic object-key walk order matters more than raw speed.

## Patch Format

A Frontier patch is an array of tuples. You normally do not need to construct these by hand, but the constants are exported for tooling and tests.

```ts
import { OP_SET, type Patch } from '@shapeshift-labs/frontier';

const patch: Patch = [[OP_SET, ['status'], 'done']];
```

The tuple format is optimized for in-memory replay and for compact transport once a codec is added above this core package.

## Subpath Imports

Use subpaths when you want a narrower import surface:

```ts
import { diff } from '@shapeshift-labs/frontier/diff';
import { applyPatchImmutable } from '@shapeshift-labs/frontier/patch';
import { parsePointer } from '@shapeshift-labs/frontier/pointer';
import { equalsJsonFast } from '@shapeshift-labs/frontier/equal';
import { createRuntimeScheduler } from '@shapeshift-labs/frontier/runtime';
```

## Package Scope

This package is intentionally limited to:

- JSON diffing.
- Compact patch replay.
- RFC6902-style JSON Patch apply helpers.
- JSON Pointer helpers.
- JSON clone/equality/validation helpers.
- Unicode string utilities used by the diff core.
- Dependency-free runtime budget and scheduler contracts for coordinating work in higher packages.

Query helpers, codecs, engine planning, state, state-cache, schema, event logs, logging, mutation, CRDT, sync, rich text, and package-specific tooling belong in companion packages. The core package stays focused on JSON diff/apply primitives and has no runtime dependencies.

## TypeScript

Frontier ships first-party TypeScript declarations for the root package and every core subpath. The runtime package is plain ESM JavaScript, and the types are included in `dist/*.d.ts`.

```ts
import { diff, applyPatchImmutable, type DiffOptions, type JsonValue, type Patch } from '@shapeshift-labs/frontier';
import type { JsonPath, PatchOperation } from '@shapeshift-labs/frontier/types';

const options: DiffOptions = { arrayKey: 'id' };
const patch: Patch = diff(before as JsonValue, after as JsonValue, options);
const next = applyPatchImmutable(before as JsonValue, patch);
```

Subpath declarations are also exported:

```ts
import { diff } from '@shapeshift-labs/frontier/diff';
import { applyPatchImmutable, type Patch } from '@shapeshift-labs/frontier/patch';
```

The package includes `exports.types`, a `./types` subpath, and `typesVersions` mappings for TypeScript projects that still use older Node-style package resolution.

## Validation

The standalone package repository includes package-level tests that run against the built JavaScript distribution:

```sh
npm test
npm run fuzz
npm run bench
npm run pack:dry
```

The test suite covers:

- TypeScript consumer checks against the published declarations.
- Smoke tests for root and subpath imports.
- Deterministic core diff/apply API tests.
- A seedable diff/apply fuzzer covering nested JSON objects, arrays, strings, scalars, stable diffing, patch validation, mutable apply, immutable apply, and normalized patch replay.

The fuzzer can be run directly:

```sh
node test/diff-fuzz.mjs --cases 5000 --seed 1234
```

## Benchmarks

Run the package-local benchmark:

```sh
npm run bench
```

Latest local package benchmark on Node v26.1.0, darwin arm64, 9 rounds. Timings are median microseconds per operation; p95 is shown to make noise visible.

| Fixture | Patch | Bytes | `diff()` median | `diff()` p95 | `applyPatchImmutable()` median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small object field edit | 1 op | 26 B | 0.56 us | 0.65 us | 0.09 us |
| 1k keyed rows, one field edit | 1 op | 31 B | 268.79 us | 272.13 us | 0.32 us |
| 1k keyed rows with dirty path hint | 2 ops | 66 B | 0.59 us | 0.71 us | 0.39 us |
| 10k text middle insert | 1 op | 32 B | 2.89 us | 3.02 us | 0.10 us |

The package benchmark also includes a runtime scheduling fixture. It compares independent per-area slices with one shared scheduler slice over mixed `diff`, `apply`, `codec`, `sync`, `cache`, and `logging` work.

| Runtime fixture | Target units | Completed units | Overrun | Median |
| --- | ---: | ---: | ---: | ---: |
| Ad hoc per-area slices | 48 | 288 | 240 | 2,353.42 us |
| Central scheduler slice | 48 | 48 | 0 | 449.21 us |
| Direct full mixed work | 384 | 384 | 0 | 3,099.61 us |
| Scheduler full mixed work | 384 | 384 | 0 | 3,267.48 us |

These numbers are Frontier-only package measurements, not a competitor comparison. Hardware, Node version, and data shape will affect absolute timings.

## License

MIT. See [LICENSE](./LICENSE).
