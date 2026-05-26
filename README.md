# Frontier

Fast compact JSON diff and patch primitives for JavaScript values.

Frontier compares JSON-shaped data and emits a replayable compact patch. It is built for application state, cached API results, editor models, game state, compiler data, and other in-memory JSON values where the useful output is not just "different", but "what compact operations reproduce the new value?".

This package is the small core package. It has no runtime dependencies and does not include Frontier query helpers, codecs, engine planning, state subscriptions, caches, schema helpers, logging, mutation planning, CRDTs, sync, or rich text.

- npm: [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier)
- source: [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- license: MIT

## Related Packages

The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:

- [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query): Shared query-key, selector path, condition, entity identity, and table-shape primitives.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): Patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.
- [`@shapeshift-labs/frontier-state`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state): Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.
- [`@shapeshift-labs/frontier-state-cache`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache): Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, and mutation bridge.
- [`@shapeshift-labs/frontier-state-cache-idb`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-idb): IndexedDB persistence adapter for Frontier state-cache snapshots.
- [`@shapeshift-labs/frontier-state-cache-file`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-file): Structured file persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-state-cache-sql`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-sql): SQL persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-schema`](https://www.npmjs.com/package/@shapeshift-labs/frontier-schema): JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.
- [`@shapeshift-labs/frontier-event-log`](https://www.npmjs.com/package/@shapeshift-labs/frontier-event-log): Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.
- [`@shapeshift-labs/frontier-logging`](https://www.npmjs.com/package/@shapeshift-labs/frontier-logging): Opt-in structured logging, browser telemetry, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.
- [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt): Native CRDT documents, update tooling, awareness, branches, conflict introspection, version frames, and undo.
- [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync): CRDT sync endpoints, repo/storage/provider contracts, document URLs, local networks, model checking, forensics, and text binding contracts.
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
- [`siliconjungle/-shapeshift-labs-frontier-state-cache`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-idb`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-idb)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-file`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-file)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-sql`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-sql)
- [`siliconjungle/-shapeshift-labs-frontier-schema`](https://github.com/siliconjungle/-shapeshift-labs-frontier-schema)
- [`siliconjungle/-shapeshift-labs-frontier-event-log`](https://github.com/siliconjungle/-shapeshift-labs-frontier-event-log)
- [`siliconjungle/-shapeshift-labs-frontier-logging`](https://github.com/siliconjungle/-shapeshift-labs-frontier-logging)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)
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

### Equality And Clone Helpers

```ts
import { cloneJson, equalsJson, equalsJsonFast } from '@shapeshift-labs/frontier';

const copy = cloneJson(value);
const same = equalsJsonFast(copy, value);
```

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
```

## Package Scope

This package is intentionally limited to:

- JSON diffing.
- Compact patch replay.
- RFC6902-style JSON Patch apply helpers.
- JSON Pointer helpers.
- JSON clone/equality/validation helpers.
- Unicode string utilities used by the diff core.

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

Latest local package benchmark on Node v26.1.0, darwin arm64, 5 rounds. Timings are median microseconds per operation; p95 is shown to make noise visible.

| Fixture | Patch | Bytes | `diff()` median | `diff()` p95 | `applyPatchImmutable()` median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small object field edit | 1 op | 26 B | 0.62 us | 1.11 us | 0.15 us |
| 1k keyed rows, one field edit | 1 op | 31 B | 332.06 us | 354.43 us | 0.42 us |
| 1k keyed rows with dirty path hint | 2 ops | 66 B | 0.81 us | 0.90 us | 0.61 us |
| 10k text middle insert | 1 op | 32 B | 3.41 us | 3.48 us | 0.12 us |

These numbers are Frontier-only package measurements, not a competitor comparison. Hardware, Node version, and data shape will affect absolute timings.

## License

MIT. See [LICENSE](./LICENSE).
