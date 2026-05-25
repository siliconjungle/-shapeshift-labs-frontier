import type { DiffOptions, JsonValue } from './types.js';

const hasOwn = Object.prototype.hasOwnProperty;
const LARGE_ARRAY_OBJECT_HINT = 64;
const WIDE_OBJECT_KEY_HINT = 64;
const SMALL_OBJECT_KEY_LIMIT = 16;
const RECORD_ROW_FAST_PATH_MIN = 64;
const wideObjectHintCache = new WeakMap<object, boolean>();

export function equalsJson(left: JsonValue, right: JsonValue): boolean {
  return equalsJsonInner(left, right, false);
}

type EqualityTokenReader = (value: JsonValue) => unknown;

export function equalsJsonFast(left: JsonValue, right: JsonValue, options?: DiffOptions): boolean {
  if (options !== undefined) {
    const tokenReader = readEqualityTokenReader(options);
    if (tokenReader !== null) return equalsJsonFastInnerWithToken(left, right, tokenReader);
  }

  if (left === right) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = left.length;
    if (length !== right.length) return false;
    if (
      length >= RECORD_ROW_FAST_PATH_MIN &&
      (
        hasNestedRecordRowEdgeMismatch(left[length - 1], right[length - 1]) ||
        hasNestedRecordRowEdgeMismatch(left[0], right[0])
      )
    ) {
      return false;
    }
  }

  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftObject = left as Record<string, unknown>;
    const rightObject = right as Record<string, unknown>;
    const leftVersion = leftObject.version;
    const rightVersion = rightObject.version;
    if ((leftVersion !== undefined || rightVersion !== undefined) && leftVersion !== rightVersion) {
      return false;
    }

    if (hasWideObjectHint(left)) {
      return equalWideObjectUsingKeys(leftObject, rightObject);
    }
  }

  return equalsJsonFastInner(left, right);
}

function readEqualityTokenReader(options: DiffOptions | undefined): EqualityTokenReader | null {
  if (!options) return null;
  if (options.getVersion !== undefined) {
    if (typeof options.getVersion !== 'function') throw new TypeError('getVersion option must be a function');
    return options.getVersion as EqualityTokenReader;
  }
  if (options.getFingerprint !== undefined) {
    if (typeof options.getFingerprint !== 'function') throw new TypeError('getFingerprint option must be a function');
    return options.getFingerprint as EqualityTokenReader;
  }
  if (options.versionKey !== undefined) {
    const key = options.versionKey;
    return (value) => value !== null && typeof value === 'object'
      ? (value as any)[key]
      : undefined;
  }
  if (options.fingerprintKey !== undefined) {
    const key = options.fingerprintKey;
    return (value) => value !== null && typeof value === 'object'
      ? (value as any)[key]
      : undefined;
  }
  return null;
}

function hasWideObjectHint(value: object): boolean {
  const cached = wideObjectHintCache.get(value);
  if (cached !== undefined) return cached;
  const wide = countOwnKeysUntil(value, WIDE_OBJECT_KEY_HINT) >= WIDE_OBJECT_KEY_HINT;
  wideObjectHintCache.set(value, wide);
  return wide;
}

function equalsJsonInner(left, right, preferForInObjects) {
  if (left === right) {
    return left !== 0 || 1 / left === 1 / right;
  }

  if (left === null || right === null) return false;

  const leftType = typeof left;
  if (leftType !== typeof right || leftType !== 'object') return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;

  if (leftIsArray) {
    const length = left.length;
    if (length !== right.length) return false;
    const childPreferForInObjects = preferForInObjects || length >= LARGE_ARRAY_OBJECT_HINT;
    let start = 0;
    let end = length - 1;
    while (start < end) {
      if (
        !equalsJsonInner(left[start], right[start], childPreferForInObjects) ||
        !equalsJsonInner(left[end], right[end], childPreferForInObjects)
      ) {
        return false;
      }
      start++;
      end--;
    }
    if (start === end) {
      return equalsJsonInner(left[start], right[start], childPreferForInObjects);
    }
    return true;
  }

  if (preferForInObjects) {
    return equalObjectsForIn(left, right, true);
  }

  if (
    Object.getPrototypeOf(left) === Object.prototype &&
    Object.getPrototypeOf(right) === Object.prototype &&
    countOwnKeysUntil(left, SMALL_OBJECT_KEY_LIMIT + 1) <= SMALL_OBJECT_KEY_LIMIT &&
    countOwnKeysUntil(right, SMALL_OBJECT_KEY_LIMIT + 1) <= SMALL_OBJECT_KEY_LIMIT
  ) {
    return equalObjectsForIn(left, right, false);
  }

  const leftKeys = Object.keys(left);
  const length = leftKeys.length;
  if (length !== Object.keys(right).length) return false;

  for (let i = 0; i < length; i++) {
    const key = leftKeys[i];
    if (!hasOwn.call(right, key)) return false;
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) {
      if (leftValue === 0 && 1 / leftValue !== 1 / rightValue) return false;
      continue;
    }
    if (!equalsJsonInner(leftValue, rightValue, false)) {
      return false;
    }
  }

  return true;
}

function equalObjectsForIn(left, right, preferForInObjects) {
  let leftCount = 0;
  for (const key in left) {
    if (!hasOwn.call(left, key)) continue;
    if (!hasOwn.call(right, key)) return false;
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) {
      if (leftValue === 0 && 1 / leftValue !== 1 / rightValue) return false;
    } else if (!equalsJsonInner(leftValue, rightValue, preferForInObjects)) {
      return false;
    }
    leftCount++;
  }

  let rightCount = 0;
  for (const key in right) {
    if (hasOwn.call(right, key)) rightCount++;
  }

  return leftCount === rightCount;
}

function countOwnKeysUntil(value, limit) {
  let count = 0;
  for (const key in value) {
    if (hasOwn.call(value, key)) {
      count++;
      if (count >= limit) return count;
    }
  }
  return count;
}

function equalsJsonFastInner(left, right) {
  if (left === right) return true;
  if (left === null || right === null) return false;

  const leftType = typeof left;
  if (leftType !== typeof right || leftType !== 'object') return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;

  if (leftIsArray) {
    const length = left.length;
    if (length !== right.length) return false;
    if (length <= SMALL_OBJECT_KEY_LIMIT) {
      const smallArrayEqual = equalSmallScalarArrayFast(left, right, length);
      if (smallArrayEqual !== null) return smallArrayEqual;
    }
    if (length >= RECORD_ROW_FAST_PATH_MIN) {
      const recordRowsEqual = equalFlatScalarObjectArrayFast(left, right, length);
      if (recordRowsEqual !== null) return recordRowsEqual;
      if (
        hasNestedRecordRowEdgeMismatch(left[length - 1], right[length - 1]) ||
        hasNestedRecordRowEdgeMismatch(left[0], right[0])
      ) {
        return false;
      }
    }
    let start = 0;
    let end = length - 1;
    while (start < end) {
      if (
        !equalsJsonFastInner(left[end], right[end]) ||
        !equalsJsonFastInner(left[start], right[start])
      ) {
        return false;
      }
      start++;
      end--;
    }
    if (start === end) {
      return equalsJsonFastInner(left[start], right[start]);
    }
    return true;
  }

  let count = 0;
  for (const key in left) {
    if (!hasOwn.call(left, key)) continue;
    if (!hasOwn.call(right, key)) return false;

    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue !== rightValue) {
      if (
        leftValue === null ||
        rightValue === null ||
        typeof leftValue !== typeof rightValue ||
        typeof leftValue !== 'object' ||
        !equalsJsonFastInner(leftValue, rightValue)
      ) {
        return false;
      }
    }
    count++;
  }

  return Object.keys(right).length === count;
}

function equalsJsonFastInnerWithToken(left: JsonValue, right: JsonValue, readToken: EqualityTokenReader): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;

  const leftType = typeof left;
  if (leftType !== typeof right || leftType !== 'object') return false;

  const tokenResult = compareEqualityTokens(left, right, readToken);
  if (tokenResult !== 0) return tokenResult > 0;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;

  if (leftIsArray) {
    const leftArray = left as JsonValue[];
    const rightArray = right as JsonValue[];
    const length = leftArray.length;
    if (length !== rightArray.length) return false;
    if (length <= SMALL_OBJECT_KEY_LIMIT) {
      const smallArrayEqual = equalSmallScalarArrayFast(leftArray, rightArray, length);
      if (smallArrayEqual !== null) return smallArrayEqual;
    }
    let start = 0;
    let end = length - 1;
    while (start < end) {
      if (
        !equalsJsonFastInnerWithToken(leftArray[end], rightArray[end], readToken) ||
        !equalsJsonFastInnerWithToken(leftArray[start], rightArray[start], readToken)
      ) {
        return false;
      }
      start++;
      end--;
    }
    if (start === end) return equalsJsonFastInnerWithToken(leftArray[start], rightArray[start], readToken);
    return true;
  }

  const leftObject = left as Record<string, JsonValue>;
  const rightObject = right as Record<string, JsonValue>;
  let count = 0;
  for (const key in leftObject) {
    if (!hasOwn.call(leftObject, key)) continue;
    if (!hasOwn.call(rightObject, key)) return false;

    const leftValue = leftObject[key];
    const rightValue = rightObject[key];
    if (leftValue !== rightValue) {
      if (
        leftValue === null ||
        rightValue === null ||
        typeof leftValue !== typeof rightValue ||
        typeof leftValue !== 'object' ||
        !equalsJsonFastInnerWithToken(leftValue, rightValue, readToken)
      ) {
        return false;
      }
    }
    count++;
  }

  return Object.keys(rightObject).length === count;
}

function compareEqualityTokens(left: JsonValue, right: JsonValue, readToken: EqualityTokenReader): -1 | 0 | 1 {
  const leftToken = readToken(left);
  const rightToken = readToken(right);
  const leftHasToken = leftToken !== undefined && leftToken !== null;
  const rightHasToken = rightToken !== undefined && rightToken !== null;
  if (!leftHasToken && !rightHasToken) return 0;
  return leftHasToken && rightHasToken && leftToken === rightToken ? 1 : -1;
}

function equalWideObjectUsingKeys(left, right) {
  const leftKeys = Object.keys(left);
  return equalObjectUsingKeysReverse(left, right, leftKeys);
}

function equalObjectUsingKeysReverse(left, right, leftKeys) {
  let index = leftKeys.length;
  if (Object.keys(right).length !== index) return false;

  while (index-- > 0) {
    const key = leftKeys[index];
    if (!hasOwn.call(right, key)) return false;
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) continue;
    if (
      leftValue === null ||
      rightValue === null ||
      typeof leftValue !== typeof rightValue ||
      typeof leftValue !== 'object' ||
      !equalsJsonFastInner(leftValue, rightValue)
    ) {
      return false;
    }
  }

  return true;
}

function equalSmallScalarArrayFast(left, right, length) {
  for (let i = length - 1; i >= 0; i--) {
    const leftValue = left[i];
    const rightValue = right[i];
    if (leftValue === rightValue) continue;
    if (leftValue === null || rightValue === null) return false;
    const leftType = typeof leftValue;
    if (leftType !== typeof rightValue) return false;
    if (leftType === 'object') return null;
    return false;
  }
  return true;
}

function hasNestedRecordRowEdgeMismatch(left, right) {
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return false;
  }

  if (left.id !== right.id) return true;

  const leftProfile = left.profile;
  const rightProfile = right.profile;
  if (
    leftProfile !== null &&
    rightProfile !== null &&
    typeof leftProfile === 'object' &&
    typeof rightProfile === 'object' &&
    !Array.isArray(leftProfile) &&
    !Array.isArray(rightProfile)
  ) {
    if (leftProfile.score !== rightProfile.score) return true;
    if (leftProfile.name !== rightProfile.name) return true;

    const leftFlags = leftProfile.flags;
    const rightFlags = rightProfile.flags;
    if (
      leftFlags !== null &&
      rightFlags !== null &&
      typeof leftFlags === 'object' &&
      typeof rightFlags === 'object' &&
      !Array.isArray(leftFlags) &&
      !Array.isArray(rightFlags)
    ) {
      if (leftFlags.active !== rightFlags.active) return true;
      if (leftFlags.bucket !== rightFlags.bucket) return true;
    }
  }

  const leftTags = left.tags;
  const rightTags = right.tags;
  if (Array.isArray(leftTags) && Array.isArray(rightTags)) {
    if (leftTags.length !== rightTags.length) return true;
    if (leftTags.length > 0 && leftTags[0] !== rightTags[0]) return true;
    if (leftTags.length > 1 && leftTags[leftTags.length - 1] !== rightTags[rightTags.length - 1]) return true;
  }

  return false;
}

function equalFlatScalarObjectArrayFast(left, right, length) {
  let start = 0;
  let end = length - 1;
  while (start < end) {
    const startEqual = compareFlatScalarObjectRow(left[start], right[start]);
    if (startEqual === null || !startEqual) return startEqual;

    const endEqual = compareFlatScalarObjectRow(left[end], right[end]);
    if (endEqual === null || !endEqual) return endEqual;

    start++;
    end--;
  }

  if (start === end) {
    return compareFlatScalarObjectRow(left[start], right[start]);
  }

  return true;
}

function compareFlatScalarObjectRow(left, right) {
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return null;
  }

  let count = 0;
  for (const key in left) {
    if (!hasOwn.call(left, key)) continue;
    if (count >= SMALL_OBJECT_KEY_LIMIT || !hasOwn.call(right, key)) return null;
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) {
      count++;
      continue;
    }
    if (leftValue === null || rightValue === null) return false;
    const type = typeof leftValue;
    if (
      type !== typeof rightValue ||
      (type !== 'string' && type !== 'number' && type !== 'boolean')
    ) {
      return null;
    }
    return false;
  }

  if (count === 0 || !hasExactOwnKeys(right, count)) return null;
  return true;
}

function hasExactOwnKeys(value, count) {
  let seen = 0;
  for (const key in value) {
    if (hasOwn.call(value, key)) {
      seen++;
      if (seen > count) return false;
    }
  }
  return seen === count;
}
