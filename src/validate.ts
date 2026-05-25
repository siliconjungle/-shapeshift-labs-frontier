import { hasUnicodeNoncharacter, hasUnpairedSurrogate } from './unicode.js';
import type { JsonValidationOptions, JsonValue } from './types.js';

const hasOwn = Object.prototype.hasOwnProperty;

export function assertJsonValue<T = JsonValue>(
  value: T,
  labelOrOptions?: string | JsonValidationOptions,
  maybeOptions?: JsonValidationOptions
): T & JsonValue {
  const name = typeof labelOrOptions === 'string' ? labelOrOptions : 'value';
  const options = normalizeValidationOptions(
    typeof labelOrOptions === 'string' ? maybeOptions : labelOrOptions
  );
  validateValue(value, name, new Set(), 0, options);
  return value as T & JsonValue;
}

function validateValue(value, path, seen, depth, options) {
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    throw new TypeError(path + ' exceeds maximum JSON depth');
  }

  if (value === null) return;

  const type = typeof value;
  if (type === 'string') {
    validateString(value, path, options);
    return;
  }
  if (type === 'boolean') return;

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(path + ' must be a finite JSON number');
    }
    if (Object.is(value, -0)) {
      throw new TypeError(path + ' must not be -0 because JSON serialization cannot preserve it');
    }
    if (options.rejectUnsafeIntegers && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(path + ' must be a safe integer for interoperable JSON');
    }
    return;
  }

  if (type !== 'object') {
    throw new TypeError(path + ' must be JSON-serializable data');
  }

  if (seen.has(value)) {
    throw new TypeError(path + ' must not contain a cycle');
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0, length = value.length; i < length; i++) {
      if (!hasOwn.call(value, i)) {
        throw new TypeError(path + '[' + i + '] must not be a sparse array hole');
      }
      validateValue(value[i], path + '[' + i + ']', seen, depth + 1, options);
    }
    seen.delete(value);
    return;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(path + ' must be a plain object, array, or primitive JSON value');
  }

  const keys = Object.keys(value);
  for (let i = 0, length = keys.length; i < length; i++) {
    const key = keys[i];
    validateString(key, path + ' key', options);
    validateValue(value[key], path + '.' + key, seen, depth + 1, options);
  }

  seen.delete(value);
}

function normalizeValidationOptions(options?: JsonValidationOptions) {
  const normalized = options || {};
  if (
    normalized.maxDepth !== undefined &&
    (!Number.isSafeInteger(normalized.maxDepth) || normalized.maxDepth < 0)
  ) {
    throw new TypeError('maxDepth option must be a non-negative safe integer');
  }

  return {
    rejectUnpairedSurrogates: !!(normalized.ijson || normalized.rejectUnpairedSurrogates),
    rejectNoncharacters: !!(normalized.ijson || normalized.rejectNoncharacters),
    rejectUnsafeIntegers: !!(normalized.ijson || normalized.rejectUnsafeIntegers),
    maxDepth: normalized.maxDepth
  };
}

function validateString(value, path, options) {
  if (options.rejectUnpairedSurrogates && hasUnpairedSurrogate(value)) {
    throw new TypeError(path + ' must be a well-formed Unicode string');
  }
  if (options.rejectNoncharacters && hasUnicodeNoncharacter(value)) {
    throw new TypeError(path + ' must not contain Unicode noncharacters');
  }
}
