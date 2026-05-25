// Public package entry for @shapeshift-labs/frontier.
// Keep this surface limited to the stable JSON diff/apply core.
export { diff, diffInto, diffStable } from './diff.js';
export {
  OP_SET,
  OP_REMOVE,
  OP_TRUNCATE,
  OP_APPEND,
  OP_ASSIGN,
  OP_STRING_SPLICE,
  OP_ARRAY_SPLICE,
  OP_ARRAY_MOVE,
  OP_STRING_COPY,
  OP_ARRAY_ASSIGN,
  OP_ARRAY_OBJECT_ASSIGN,
  OP_ARRAY_TUPLE_ASSIGN,
  OP_ARRAY_OBJECT_FIELD_ASSIGN,
  OP_SCALAR_ARRAY_REPLACE,
  OP_ARRAY_TWO_FIELD_INSERT
} from './constants.js';
export { applyPatch, applyPatchImmutable } from './apply.js';
export { applyJsonPatch, applyJsonPatchImmutable } from './json-patch.js';
export { normalizePatch } from './normalize.js';
export { assertPatch } from './patch-validate.js';
export { parsePointer, stringifyPointer, getPointer, getPath } from './pointer.js';
export { cloneJson } from './clone.js';
export { equalsJson, equalsJsonFast } from './equal.js';
export { assertJsonValue } from './validate.js';
export {
  hasUnpairedSurrogate,
  hasUnicodeNoncharacter,
  isWellFormedString,
  toWellFormedString,
  normalizeString,
  normalizeJsonStrings,
  segmentString,
  stringLength,
  codeUnitOffsetToSegmentIndex,
  segmentIndexToCodeUnitOffset
} from './unicode.js';

export type {
  ApplyOptions,
  ArrayKeyGetter,
  CacheToken,
  DiffOptions,
  DirtyRowsFrontier,
  JsonArray,
  JsonObject,
  JsonPatch,
  JsonPatchOperation,
  JsonPath,
  JsonPrimitive,
  JsonRecord,
  JsonValidationOptions,
  JsonValue,
  KeyCompare,
  NormalizeOptions,
  ObjectKey,
  Patch,
  PatchOperation,
  PathSegment,
  TextLengthUnit,
  TextSegment,
  TextSegmentGranularity,
  TextSegmentationOptions,
  Token,
  TokenGetter,
  UnicodeNormalizationForm
} from './types.js';
