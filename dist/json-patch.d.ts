import type { ApplyOptions, JsonPatch, JsonValue } from './types.js';
export declare function applyJsonPatch(value: JsonValue, patch: JsonPatch, options?: ApplyOptions): JsonValue | undefined;
export declare function applyJsonPatchImmutable(value: JsonValue, patch: JsonPatch): JsonValue | undefined;