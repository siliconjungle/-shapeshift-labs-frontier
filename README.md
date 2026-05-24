# Frontier

Fast compact JSON diff and patch primitives for JavaScript values.

Frontier compares JSON-shaped data and emits a replayable compact patch. It is built for application state, cached API results, editor models, game state, compiler data, and other in-memory JSON values where the useful output is not just "different", but "what compact operations reproduce the new value?".

This package is the small core package. It does not include Frontier CRDTs, sync, state subscriptions, binary codecs, logging, or rich text.

Repository: [siliconjungle/-shapeshift-labs-frontier](https://github.com/siliconjungle/-shapeshift-labs-frontier)

## Install

```sh
npm install @shapeshift-labs/frontier
```

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

## Performance

Frontier core was measured from this package on Node v26.1.0, darwin arm64. Timings are median microseconds per operation across 9 warmed rounds; p95 is shown to make noise visible.

| Fixture | Patch | Bytes | `diff()` median | `diff()` p95 | `applyPatchImmutable()` median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small object field edit | 1 op | 34 B | 0.41 us | 0.51 us | 0.07 us |
| 1k keyed rows, one field edit | 1 op | 45 B | 84.39 us | 98.30 us | 0.41 us |
| 1k keyed rows with dirty path hint | 2 ops | 60 B | 0.46 us | 0.50 us | 0.52 us |
| 10k text middle insert | 1 op | 29 B | 2.77 us | 2.85 us | 0.09 us |

These numbers are Frontier-only package measurements, not a competitor comparison. Hardware, Node version, and data shape will affect absolute timings.

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

## Subpath Imports

Use subpaths when you want a narrower import surface:

```ts
import { diff } from '@shapeshift-labs/frontier/diff';
import { applyPatchImmutable } from '@shapeshift-labs/frontier/patch';
import { parsePointer } from '@shapeshift-labs/frontier/pointer';
import { equalsJsonFast } from '@shapeshift-labs/frontier/equal';
```

## Patch Format

A Frontier patch is an array of tuples. You normally do not need to construct these by hand, but the constants are exported for tooling and tests.

```ts
import { OP_SET, type Patch } from '@shapeshift-labs/frontier';

const patch: Patch = [[OP_SET, ['status'], 'done']];
```

The tuple format is optimized for in-memory replay and for compact transport once a codec is added above this core package.

## Package Scope

This package is intentionally limited to:

- JSON diffing.
- Compact patch replay.
- RFC6902-style JSON Patch apply helpers.
- JSON Pointer helpers.
- JSON clone/equality/validation helpers.
- Unicode string utilities used by the diff core.

Future package-family layers are separate by design:

- `@shapeshift-labs/frontier-codec`
- `@shapeshift-labs/frontier-state`
- `@shapeshift-labs/frontier-crdt`
- `@shapeshift-labs/frontier-crdt-sync`
- `@shapeshift-labs/frontier-richtext`

Those packages are reserved but should be treated separately from this core package.

## License

MIT. See [LICENSE](./LICENSE).
