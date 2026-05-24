import type { ApplyOptions, JsonValue, Patch } from './types.js';
export declare function applyPatch(value: JsonValue, patch: Patch, options?: ApplyOptions): JsonValue;
export declare function applyPatchImmutable(value: JsonValue, patch: Patch): JsonValue;