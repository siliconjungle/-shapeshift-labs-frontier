import type { JsonArray, JsonObject, JsonPath, JsonValue, PathSegment } from './types.js';
export declare function parsePointer(pointer: string): JsonPath;
export declare function stringifyPointer(path: JsonPath): string;
export declare function getPath(value: JsonValue, path: JsonPath): JsonValue | undefined;
export declare function getPointer(value: JsonValue, pointer: string): JsonValue | undefined;
export declare function findPointerParent(value: JsonValue, pointer: string): [JsonObject | JsonArray, PathSegment] | null;
export declare function getCachedPointerPath(pointer: string): JsonPath;
export declare function decodePointerSegment(pointer: string, start: number, end: number): string;
export declare function readArrayIndex(key: string | number, length: number, allowAppend: boolean): number;
//# sourceMappingURL=pointer.d.ts.map