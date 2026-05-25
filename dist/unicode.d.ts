import type { JsonValue, TextLengthUnit, TextSegment, TextSegmentationOptions, UnicodeNormalizationForm } from './types.js';
export declare function hasUnpairedSurrogate(value: string): boolean;
export declare function hasUnicodeNoncharacter(value: string): boolean;
export declare function isWellFormedString(value: string): boolean;
export declare function toWellFormedString(value: string, replacement?: string): string;
export declare function normalizeString(value: string, form?: UnicodeNormalizationForm): string;
export declare function normalizeJsonStrings<T extends JsonValue>(value: T, form?: UnicodeNormalizationForm): T;
export declare function segmentString(value: string, options?: TextSegmentationOptions): TextSegment[];
export declare function stringLength(value: string, unit?: TextLengthUnit): number;
export declare function codeUnitOffsetToSegmentIndex(value: string, offset: number, options?: TextSegmentationOptions): number;
export declare function segmentIndexToCodeUnitOffset(value: string, index: number, options?: TextSegmentationOptions): number;
//# sourceMappingURL=unicode.d.ts.map