import { setOwnValue } from './object.js';
import type {
  JsonValue,
  TextLengthUnit,
  TextSegment,
  TextSegmentGranularity,
  TextSegmentationOptions,
  UnicodeNormalizationForm
} from './types.js';

const UNPAIRED_SURROGATE_PATTERN = /[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/;
const LOW_SURROGATE_PATTERN = /[\udc00-\udfff]/;
const stringIsWellFormed = (String.prototype as { isWellFormed?: () => boolean }).isWellFormed;
const stringToWellFormed = (String.prototype as { toWellFormed?: () => string }).toWellFormed;
const NORMALIZATION_FORMS = new Set(['NFC', 'NFD', 'NFKC', 'NFKD']);
const SEGMENTER_CACHE_LIMIT = 16;
const ASCII_NORMALIZE_FAST_LIMIT = 256;

interface NativeSegmentPart {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface NativeSegmenter {
  segment(value: string): Iterable<NativeSegmentPart>;
}

type NativeSegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity?: TextSegmentGranularity }
) => NativeSegmenter;

const segmenterCache = new Map<string, NativeSegmenter>();

export function hasUnpairedSurrogate(value: string): boolean {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  if (stringIsWellFormed !== undefined) return !stringIsWellFormed.call(value);
  return UNPAIRED_SURROGATE_PATTERN.test(value);
}

export function hasUnicodeNoncharacter(value: string): boolean {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  for (let i = 0, length = value.length; i < length; i++) {
    const codePoint = value.codePointAt(i);
    if (codePoint === undefined) continue;
    if (isUnicodeNoncharacter(codePoint)) return true;
    if (codePoint > 0xffff) i++;
  }
  return false;
}

export function isWellFormedString(value: string): boolean {
  return !hasUnpairedSurrogate(value);
}

export function toWellFormedString(value: string, replacement = '\ufffd'): string {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  if (typeof replacement !== 'string') throw new TypeError('replacement must be a string');
  if (replacement === '\ufffd' && stringToWellFormed !== undefined) {
    return stringToWellFormed.call(value);
  }

  let out = '';
  for (let i = 0, length = value.length; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < length) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += value[i] + value[i + 1];
          i++;
          continue;
        }
      }
      out += replacement;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += replacement;
      continue;
    }
    out += value[i];
  }
  return out;
}

export function normalizeString(value: string, form: UnicodeNormalizationForm = 'NFC'): string {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  assertNormalizationForm(form);
  if (value.length <= ASCII_NORMALIZE_FAST_LIMIT && isAsciiString(value)) return value;
  return value.normalize(form);
}

export function normalizeJsonStrings<T extends JsonValue>(value: T, form: UnicodeNormalizationForm = 'NFC'): T {
  assertNormalizationForm(form);
  return normalizeJsonStringsInner(value, form, new Set()) as T;
}

export function segmentString(value: string, options?: TextSegmentationOptions): TextSegment[] {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  const granularity = options && options.granularity !== undefined ? options.granularity : 'grapheme';
  assertGranularity(granularity);

  if (granularity === 'grapheme' && isSimpleAsciiGraphemeString(value)) {
    return asciiGraphemeSegments(value);
  }

  const segmenter = getCachedSegmenter(options && options.locale, granularity);
  if (segmenter !== null) {
    const segments = [];
    for (const part of segmenter.segment(value)) {
      const segment: TextSegment = { segment: part.segment, index: part.index };
      if (part.isWordLike !== undefined) segment.isWordLike = part.isWordLike;
      segments[segments.length] = segment;
    }
    return segments;
  }

  if (granularity !== 'grapheme') {
    return value.length === 0 ? [] : [{ segment: value, index: 0 }];
  }
  return fallbackGraphemeSegments(value);
}

export function stringLength(value: string, unit: TextLengthUnit = 'codeUnit'): number {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  if (unit === 'codeUnit') return value.length;
  if (unit === 'codePoint' && isAsciiString(value)) return value.length;
  if (unit === 'grapheme' && isSimpleAsciiGraphemeString(value)) return value.length;
  if (unit === 'codePoint') return Array.from(value).length;
  if (unit === 'grapheme') return countSegments(value, undefined, 'grapheme');
  throw new TypeError('unknown string length unit: ' + unit);
}

export function codeUnitOffsetToSegmentIndex(
  value: string,
  offset: number,
  options?: TextSegmentationOptions
): number {
  assertOffset(value, offset);
  const granularity = options && options.granularity !== undefined ? options.granularity : 'grapheme';
  assertGranularity(granularity);
  const assoc = options && options.assoc !== undefined && options.assoc < 0 ? -1 : 1;

  if (granularity === 'grapheme' && isSimpleAsciiGraphemeString(value)) return offset;

  const segmenter = getCachedSegmenter(options && options.locale, granularity);
  if (segmenter !== null) {
    let index = 0;
    for (const part of segmenter.segment(value)) {
      const start = part.index;
      if (offset === start) return index;
      if (offset < start) return assoc < 0 ? index - 1 : index;
      index++;
    }
    if (offset === value.length) return index;
    return assoc < 0 && index > 0 ? index - 1 : index;
  }

  const segments = segmentString(value, options);
  if (offset === value.length) return segments.length;
  for (let i = 0, length = segments.length; i < length; i++) {
    const start = segments[i].index;
    const end = i + 1 < length ? segments[i + 1].index : value.length;
    if (offset === start) return i;
    if (offset > start && offset < end) return assoc < 0 ? i : i + 1;
  }
  return segments.length;
}

export function segmentIndexToCodeUnitOffset(
  value: string,
  index: number,
  options?: TextSegmentationOptions
): number {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError('segment index must be a non-negative safe integer');
  }

  const granularity = options && options.granularity !== undefined ? options.granularity : 'grapheme';
  assertGranularity(granularity);

  if (granularity === 'grapheme' && isSimpleAsciiGraphemeString(value)) {
    if (index > value.length) throw new RangeError('segment index out of bounds');
    return index;
  }

  const segmenter = getCachedSegmenter(options && options.locale, granularity);
  if (segmenter !== null) {
    let current = 0;
    for (const part of segmenter.segment(value)) {
      if (current === index) return part.index;
      current++;
    }
    if (index === current) return value.length;
    throw new RangeError('segment index out of bounds');
  }

  const segments = segmentString(value, options);
  if (index > segments.length) throw new RangeError('segment index out of bounds');
  return index === segments.length ? value.length : segments[index].index;
}

function normalizeJsonStringsInner(value, form, seen) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length <= ASCII_NORMALIZE_FAST_LIMIT && isAsciiString(value) ? value : value.normalize(form);
  }

  if (seen.has(value)) throw new TypeError('value must not contain a cycle');
  seen.add(value);

  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0, length = value.length; i < length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        throw new TypeError('value[' + i + '] must not be a sparse array hole');
      }
      out[i] = normalizeJsonStringsInner(value[i], form, seen);
    }
    seen.delete(value);
    return out;
  }

  if (typeof value !== 'object') {
    throw new TypeError('value must be JSON-serializable data');
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('value must be a plain object, array, or primitive JSON value');
  }

  const out = proto === null ? Object.create(null) : {};
  const keys = Object.keys(value);
  for (let i = 0, length = keys.length; i < length; i++) {
    const key = keys[i];
    const normalizedKey = key.length <= ASCII_NORMALIZE_FAST_LIMIT && isAsciiString(key) ? key : key.normalize(form);
    if (Object.prototype.hasOwnProperty.call(out, normalizedKey)) {
      throw new TypeError('normalizing object keys must not create duplicate keys');
    }
    setOwnValue(out, normalizedKey, normalizeJsonStringsInner(value[key], form, seen));
  }

  seen.delete(value);
  return out;
}

function getCachedSegmenter(
  locale: string | string[] | undefined,
  granularity: TextSegmentGranularity
): NativeSegmenter | null {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: NativeSegmenterConstructor }).Segmenter;
  if (Segmenter === undefined) return null;

  const key = segmenterCacheKey(locale, granularity);
  const cached = segmenterCache.get(key);
  if (cached !== undefined) return cached;

  const segmenter = new Segmenter(locale, { granularity });
  segmenterCache.set(key, segmenter);
  if (segmenterCache.size > SEGMENTER_CACHE_LIMIT) {
    const oldest = segmenterCache.keys().next().value;
    if (oldest !== undefined) segmenterCache.delete(oldest);
  }
  return segmenter;
}

function segmenterCacheKey(locale: string | string[] | undefined, granularity: TextSegmentGranularity): string {
  if (locale === undefined) return granularity + '\0';
  if (!Array.isArray(locale)) return granularity + '\0s\0' + locale;

  let key = granularity + '\0a';
  for (let i = 0, length = locale.length; i < length; i++) {
    key += '\0' + locale[i];
  }
  return key;
}

function countSegments(
  value: string,
  locale: string | string[] | undefined,
  granularity: TextSegmentGranularity
): number {
  const segmenter = getCachedSegmenter(locale, granularity);
  if (segmenter !== null) {
    let count = 0;
    for (const _part of segmenter.segment(value)) count++;
    return count;
  }
  return granularity === 'grapheme' ? fallbackGraphemeSegmentCount(value) : value.length === 0 ? 0 : 1;
}

function asciiGraphemeSegments(value: string): TextSegment[] {
  const segments = new Array(value.length);
  for (let i = 0, length = value.length; i < length; i++) {
    segments[i] = { segment: value[i], index: i };
  }
  return segments;
}

function isAsciiString(value: string): boolean {
  for (let i = 0, length = value.length; i < length; i++) {
    if (value.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function isSimpleAsciiGraphemeString(value: string): boolean {
  for (let i = 0, length = value.length; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x7f || code === 13) return false;
  }
  return true;
}

function fallbackGraphemeSegments(value: string): TextSegment[] {
  const segments = [];
  for (let i = 0, length = value.length; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < length && LOW_SURROGATE_PATTERN.test(value[i + 1])) {
      segments[segments.length] = { segment: value.slice(i, i + 2), index: i };
      i++;
    } else {
      segments[segments.length] = { segment: value[i], index: i };
    }
  }
  return segments;
}

function fallbackGraphemeSegmentCount(value: string): number {
  let count = 0;
  for (let i = 0, length = value.length; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < length && LOW_SURROGATE_PATTERN.test(value[i + 1])) i++;
    count++;
  }
  return count;
}

function assertNormalizationForm(form) {
  if (!NORMALIZATION_FORMS.has(form)) {
    throw new TypeError('normalization form must be NFC, NFD, NFKC, or NFKD');
  }
}

function assertGranularity(granularity) {
  if (granularity !== 'grapheme' && granularity !== 'word' && granularity !== 'sentence') {
    throw new TypeError('text segmentation granularity must be grapheme, word, or sentence');
  }
}

function assertOffset(value: string, offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length) {
    throw new RangeError('offset must be a non-negative safe integer within the string');
  }
}

function isUnicodeNoncharacter(codePoint: number): boolean {
  return (
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
    (codePoint <= 0x10ffff && (codePoint & 0xfffe) === 0xfffe)
  );
}
