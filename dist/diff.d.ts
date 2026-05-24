import type { DiffOptions, JsonValue, Patch } from './types.js';
export declare function diff(source: JsonValue, target: JsonValue, options?: DiffOptions): Patch;
export declare function diffStable(source: JsonValue, target: JsonValue, options?: DiffOptions): Patch;
export declare function diffInto(source: JsonValue, target: JsonValue, patch: Patch, options?: DiffOptions): Patch;