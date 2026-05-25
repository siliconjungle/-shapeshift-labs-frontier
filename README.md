# Frontier

Fast compact JSON diff and patch primitives for JavaScript values.

Frontier compares JSON-shaped data and emits a replayable compact patch. It is built for application state, cached API results, editor models, game state, compiler data, and other in-memory JSON values where the useful output is not just "different", but "what compact operations reproduce the new value?".

This package is the small core package. It does not include Frontier CRDTs, sync, state subscriptions, binary codecs, logging, or rich text.

- npm: [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier)
- source: [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- license: MIT

## Related Packages

The published Frontier package family is split so the core diff/apply package stays small:

- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): planned diff engine, adaptive profiles, and reusable schema/history planning.
- [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query): shared query-key, selector path, condition, identity, and table-schema primitives.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): explicit mutation and selector plans compiled to Frontier patches or CRDT operations.

Published source repositories:

- [`siliconjungle/-shapeshift-labs-frontier-codec`](https://github.com/siliconjungle/-shapeshift-labs-frontier-codec)
- [`siliconjungle/-shapeshift-labs-frontier-engine`](https://github.com/siliconjungle/-shapeshift-labs-frontier-engine)
- [`siliconjungle/-shapeshift-labs-frontier-query`](https://github.com/siliconjungle/-shapeshift-labs-frontier-query)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)

Reserved package names for future layers are kept separate from this core package:

- `@shapeshift-labs/frontier-state`
- `@shapeshift-labs/frontier-crdt`
- `@shapeshift-labs/frontier-crdt-sync`
- `@shapeshift-labs/frontier-richtext`
- `@shapeshift-labs/frontier-logging`
- `@shapeshift-labs/frontier-state-cache`
- `@shapeshift-labs/frontier-event-log`
- `@shapeshift-labs/frontier-schema`

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

Codec, mutation, state, CRDT, sync, logging, rich text, and package-specific tooling belong in companion packages or explicit subpaths. The core package stays focused on JSON diff/apply primitives and has no runtime dependencies.

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

Latest local package benchmark on Node v26.1.0, darwin arm64, 3 rounds. Timings are median microseconds per operation; p95 is shown to make noise visible.

| Fixture | Patch | Bytes | `diff()` median | `diff()` p95 | `applyPatchImmutable()` median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small object field edit | 1 op | 26 B | 0.59 us | 0.72 us | 0.11 us |
| 1k keyed rows, one field edit | 1 op | 31 B | 274.58 us | 277.91 us | 0.37 us |
| 1k keyed rows with dirty path hint | 2 ops | 66 B | 0.68 us | 0.72 us | 0.51 us |
| 10k text middle insert | 1 op | 32 B | 3.08 us | 3.08 us | 0.12 us |

These numbers are Frontier-only package measurements, not a competitor comparison. Hardware, Node version, and data shape will affect absolute timings.

## License

MIT. See [LICENSE](./LICENSE).
