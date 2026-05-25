/** JSON primitive values supported by the core diff and patch APIs. */
export type JsonPrimitive = null | boolean | number | string;
/** Any JSON-shaped value accepted by the public API. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
/** A plain JSON object. Runtime validation accepts plain and null-prototype objects. */
export interface JsonObject {
    [key: string]: JsonValue;
}
export type JsonRecord = JsonObject;
/** A JSON array. */
export interface JsonArray extends Array<JsonValue> {
}
export type PathSegment = string | number;
/** Array-form JSON path used by compact patch operations. */
export type JsonPath = PathSegment[];
export type ObjectKey = string | number;
/** Trusted cache/equality token returned by version or fingerprint producers. */
export type CacheToken = string | number | boolean | symbol | bigint | object;
export type Token = CacheToken;
/** Compact patch operation tuple. Prefer helpers over constructing these manually. */
export type PatchOperation = [0, JsonPath, JsonValue] | [1, JsonPath] | [2, JsonPath, number] | [3, JsonPath, JsonValue[]] | [4, JsonPath, JsonObject] | [5, JsonPath, number, number, string] | [6, JsonPath, number, number, JsonValue[]] | [7, JsonPath, number, number] | [8, JsonPath, number, number, number] | [9, JsonPath, number[], JsonValue[]] | [10, JsonPath, number[], JsonObject[]] | [11, JsonPath, number[], number[], JsonValue[]] | [12, JsonPath, number[], JsonPath[], JsonValue[]] | [13, JsonPath, JsonPrimitive[]] | [14, JsonPath, number, string, string, JsonPrimitive[], JsonPrimitive[]];
/** Compact patch format emitted by diff() and consumed by applyPatch(). */
export type Patch = PatchOperation[];
/** Standard RFC6902 JSON Patch operation shape. */
export type JsonPatchOperation = {
    op: 'add' | 'replace' | 'test';
    path: string;
    value: JsonValue;
} | {
    op: 'remove';
    path: string;
} | {
    op: 'move' | 'copy';
    from: string;
    path: string;
};
export type JsonPatch = JsonPatchOperation[];
/** Runtime JSON validation options. */
export interface JsonValidationOptions {
    /** Enforce the stricter interoperable JSON profile used by I-JSON/JCS-style workflows. */
    ijson?: boolean;
    /** Reject strings or object keys containing unpaired surrogate code units. */
    rejectUnpairedSurrogates?: boolean;
    /** Reject strings or object keys containing Unicode noncharacters. */
    rejectNoncharacters?: boolean;
    /** Reject integer numbers outside the ECMAScript safe-integer range. */
    rejectUnsafeIntegers?: boolean;
    /** Optional maximum container depth. The root value is depth 0. */
    maxDepth?: number;
}
export type UnicodeNormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
export type TextSegmentGranularity = 'grapheme' | 'word' | 'sentence';
export type TextLengthUnit = 'codeUnit' | 'codePoint' | 'grapheme';
/** Text segment with a UTF-16 code-unit start offset. */
export interface TextSegment {
    segment: string;
    index: number;
    isWordLike?: boolean;
}
/** Options for Intl.Segmenter-backed text segmentation helpers. */
export interface TextSegmentationOptions {
    /** Locale passed to Intl.Segmenter. Defaults to the runtime default locale. */
    locale?: string | string[];
    /** Segment granularity. Defaults to grapheme. */
    granularity?: TextSegmentGranularity;
    /** Boundary side used when converting an offset inside a segment. */
    assoc?: -1 | 1 | number;
}
export type KeyCompare = (left: string, right: string) => number;
export type TokenGetter<TValue extends JsonValue = JsonValue> = (value: TValue) => CacheToken | null | undefined;
export type ArrayKeyGetter<TValue extends JsonValue = JsonValue> = (value: TValue, index?: number, array?: TValue[]) => ObjectKey | null | undefined;
/** Compact trusted dirty frontier for homogeneous array rows. */
export interface DirtyRowsFrontier {
    /** Path to the array containing dirty rows. */
    path: JsonPath;
    /** Dirty row indexes. Sorted ascending unlocks the fastest grouped path. */
    rows: ArrayLike<number>;
    /** Relative field paths from each row. Omit fields when whole rows are dirty. */
    fields?: JsonPath[];
}
/**
 * Options for diff().
 *
 * Default diff() is safe and structural. Options such as versions,
 * fingerprints, and dirty paths are trusted producer contracts that can skip
 * traversal when the caller can prove the metadata is correct.
 */
export interface DiffOptions<TValue extends JsonValue = JsonValue> {
    /** Validate inputs and generated patch data. Disabled by default for speed. */
    validate?: boolean;
    /** Emit a root replacement patch unless both inputs are the same reference. */
    strategy?: 'replace';
    /** Optional patch-size keyframe threshold. */
    maxPatchOperations?: number | null;
    /** Sort object keys lexically, or with a supplied comparator, for deterministic patch order. */
    stable?: boolean | KeyCompare;
    /** Legacy alias for stable lexical object-key ordering. */
    sortKeys?: boolean;
    /** Custom object-key comparator used by stable diffing. */
    keyCompare?: KeyCompare;
    /** Object key that exposes a trusted subtree version token. */
    versionKey?: ObjectKey;
    /** Object key that exposes a trusted semantic fingerprint. */
    fingerprintKey?: ObjectKey;
    /** Getter for trusted subtree version tokens. */
    getVersion?: TokenGetter<TValue>;
    /** Getter for trusted semantic fingerprints. */
    getFingerprint?: TokenGetter<TValue>;
    /** Key or getter used to match object-array rows. */
    arrayKey?: ObjectKey | ArrayKeyGetter<TValue> | boolean | null;
    /** Enable conservative automatic key detection for reordered object arrays. */
    autoArrayKey?: boolean;
    /** Optional row identity field candidates used before structural identity inference. */
    recordKeyCandidates?: ObjectKey[] | false | null;
    /** Getter used to match object-array rows. */
    getArrayKey?: ArrayKeyGetter<TValue>;
    /** Trusted producer frontier. Include every changed region. */
    dirtyPaths?: JsonPath[] | null;
    /** Trusted compressed producer frontier for row-oriented arrays. */
    dirtyRows?: DirtyRowsFrontier[] | null;
}
/** Patch replay options. */
export interface ApplyOptions {
    /** Clone inserted/replaced JSON values before writing them into the target. */
    cloneValues?: boolean;
}
/** Patch normalization options. */
export interface NormalizeOptions {
    /** Validate the incoming patch before normalization. */
    validate?: boolean;
}
//# sourceMappingURL=types.d.ts.map