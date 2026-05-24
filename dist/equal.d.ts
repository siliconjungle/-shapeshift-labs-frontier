import type { DiffOptions, JsonValue } from './types.js';
export declare function equalsJson(left: JsonValue, right: JsonValue): boolean;
export declare function equalsJsonFast(left: JsonValue, right: JsonValue, options?: DiffOptions): boolean;