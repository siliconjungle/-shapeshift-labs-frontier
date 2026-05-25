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

void intoResult;
void pointer;
void object;
