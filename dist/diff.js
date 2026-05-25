import { OP_SET, OP_REMOVE, OP_TRUNCATE, OP_APPEND, OP_ASSIGN, OP_STRING_SPLICE, OP_ARRAY_SPLICE, OP_ARRAY_MOVE, OP_STRING_COPY, OP_ARRAY_ASSIGN, OP_ARRAY_OBJECT_ASSIGN, OP_ARRAY_TUPLE_ASSIGN, OP_ARRAY_OBJECT_FIELD_ASSIGN, OP_SCALAR_ARRAY_REPLACE, OP_ARRAY_TWO_FIELD_INSERT } from './constants.js';
import { assertJsonValue } from './validate.js';
import { setOwnValue } from './object.js';
import { equalsJson } from './equal.js';
const hasOwn = Object.prototype.hasOwnProperty;
const TYPE_NULL = 0;
const TYPE_BOOLEAN = 1;
const TYPE_NUMBER = 2;
const TYPE_STRING = 3;
const TYPE_ARRAY = 4;
const TYPE_OBJECT = 5;
const TYPE_OTHER = 6;
const MISSING_PATH_VALUE = Symbol('missingPathValue');
const STRING_COMPARE_CHUNK = 128;
const LONG_STRING_COMPARE_CHUNK = 512;
const STRING_ROTATION_MIN = 64;
const STRING_ROTATION_MAX = 256 * 1024;
const STRING_COPY_MIN = 64;
const STRING_COPY_SPLIT_PREFIX_MAX = 128;
const STRING_COPY_SPLIT_SUFFIX_MAX = 128;
const STRING_MULTI_REPLACE_MAX_OPS = 16;
const STRING_MULTI_REPLACE_MAX_CHANGED = 512;
const STRING_MULTI_REPLACE_MAX_RUN = 32;
const SMALL_OBJECT_KEY_LIMIT = 16;
const EQUAL_OBJECT_SUBTREE_MIN_KEYS = 4;
const SMALL_ARRAY_SHIFT_LIMIT = 64;
const LARGE_PRIMITIVE_ARRAY_SHIFT_LIMIT = 4096;
const LARGE_PRIMITIVE_ARRAY_SHIFT_MIN_TAIL = 32;
const LARGE_SHIFTED_ARRAY_LIMIT = 1024;
const LARGE_SHIFTED_ARRAY_MIN_TAIL = 32;
const SCALAR_REPLACE_RUN_LIMIT = 1024;
const LARGE_SCALAR_RUN_ARRAY_MIN_LENGTH = 8192;
const ARRAY_ASSIGN_MIN = 4;
const ARRAY_ASSIGN_MIN_LENGTH = 64;
const ARRAY_RUN_SPLICE_MIN_RUNS = 8;
const ARRAY_RUN_SPLICE_MAX_RUNS = 2048;
const ARRAY_RUN_SPLICE_MIN_AVG = 8;
const ARRAY_TUPLE_ASSIGN_MIN = 4;
const ARRAY_TUPLE_ASSIGN_MIN_LENGTH = 16;
const ARRAY_TUPLE_ASSIGN_MAX_WIDTH = 64;
const DENSE_DIRTY_CELL_PLAN_MIN = 512;
const DENSE_DIRTY_CELL_ROW_MIN = 32;
const DIRTY_ARRAY_KEYFRAME_ROW_MAX_WIDTH = 64;
const DIRTY_PATH_GROUP_MAX = 4096;
const DIRTY_COMMON_OBJECT_SET_MIN = 4;
const DIRTY_ROW_NORMALIZE_MAX = 4096;
const DIRTY_ARRAY_ROW_GROUP_MIN = 4;
const TWO_KEY_RECORD_ARRAY_MIN = 512;
const KEYED_ARRAY_MIN = 8;
const KEYED_ARRAY_MOVE_LIMIT = 512;
const PURE_KEYED_MOVE_MAX = 2048;
const LARGE_PURE_KEYED_MOVE_MAX = 65536;
const STRUCTURAL_ARRAY_KEY_MAX = 1024;
const OBJECT_FIELD_ARRAY_KEY_MAX = 4096;
const LARGE_STRUCTURAL_SINGLE_MOVE_MIN = OBJECT_FIELD_ARRAY_KEY_MAX + 1;
const STRUCTURAL_KEY_SAMPLE_LIMIT = 32;
const ARRAY_KEY_SIGNAL_SAMPLE_LIMIT = 128;
const STRUCTURAL_KEY_MAX_CHARS = 1024;
const STRUCTURAL_KEY_MAX_DEPTH = 6;
const STRUCTURAL_KEY_MAX_NODES = 96;
const STRUCTURAL_KEY_MAX_KEYS = 32;
const STRUCTURAL_KEY_MAX_ARRAY = 32;
const STRUCTURAL_KEY_MAX_STRING = 128;
const FLAT_ARRAY_SHIFT_PROBE_MAX = 8;
const AUTO_COMPOSITE_KEY_PAIRS = [];
export function diff(source, target, options) {
    if (options && options.strategy === 'replace') {
        if (options.validate) {
            assertJsonValue(source, 'source');
            assertJsonValue(target, 'target');
        }
        if (source === target &&
            (typeof source !== 'number' || source !== 0 || 1 / source === 1 / target)) {
            return [];
        }
        return [[OP_SET, [], target]];
    }
    return diffInto(source, target, [], options);
}
export function diffStable(source, target, options) {
    const stableOptions = options
        ? { ...options, stable: true }
        : { stable: true };
    return diffInto(source, target, [], stableOptions);
}
export function diffInto(source, target, patch, options) {
    if (!Array.isArray(patch)) {
        throw new TypeError('patch output must be an array');
    }
    patch.length = 0;
    if (options && options.validate) {
        assertJsonValue(source, 'source');
        assertJsonValue(target, 'target');
    }
    if (options && options.strategy === 'replace') {
        if (source === target &&
            (typeof source !== 'number' || source !== 0 || 1 / source === 1 / target)) {
            return patch;
        }
        patch[0] = [OP_SET, [], target];
        return patch;
    }
    const keyCompare = readKeyCompare(options);
    const getVersion = readVersionGetter(options);
    const arrayKey = readArrayKey(options);
    const dirtyRows = readDirtyRows(options);
    const rawDirtyPaths = options ? options.dirtyPaths : undefined;
    const maxPatchOperations = readMaxPatchOperations(options);
    if ((rawDirtyPaths === undefined || rawDirtyPaths === null) &&
        (dirtyRows === undefined || dirtyRows === null)) {
        walk(source, target, [], patch, keyCompare, getVersion, arrayKey);
    }
    else {
        if (dirtyRows !== undefined && dirtyRows !== null) {
            diffDirtyRows(source, target, dirtyRows, patch, keyCompare, getVersion, arrayKey);
        }
        if (rawDirtyPaths !== undefined && rawDirtyPaths !== null) {
            if (tryDiffDirtyPathsAsCommonObjectSets(source, target, rawDirtyPaths, patch)) {
                return patch;
            }
            if (tryDiffDirtyPathsAsFieldMajorRowFields(source, target, rawDirtyPaths, patch)) {
                return patch;
            }
            const rowFieldPrefix = tryDiffDirtyPathsAsSingleRepeatedRowFieldPrefix(source, target, rawDirtyPaths, patch);
            if (rowFieldPrefix > 0) {
                if (rowFieldPrefix < rawDirtyPaths.length) {
                    const remainingDirtyPaths = normalizeDirtyPaths(rawDirtyPaths.slice(rowFieldPrefix), true);
                    if (remainingDirtyPaths === null) {
                        walk(source, target, [], patch, keyCompare, getVersion, arrayKey);
                    }
                    else {
                        diffDirtyPaths(source, target, remainingDirtyPaths, patch, keyCompare, getVersion, arrayKey);
                    }
                }
                return patch;
            }
            if (tryDiffDirtyPathsAsRepeatedRowFields(source, target, rawDirtyPaths, patch)) {
                return patch;
            }
            const dirtyPaths = readDirtyPaths(options);
            if (dirtyPaths === null) {
                walk(source, target, [], patch, keyCompare, getVersion, arrayKey);
                return patch;
            }
            diffDirtyPaths(source, target, dirtyPaths, patch, keyCompare, getVersion, arrayKey);
        }
    }
    if (maxPatchOperations >= 0 && patch.length > maxPatchOperations) {
        patch.length = 0;
        emitSet(patch, [], target);
    }
    return patch;
}
function readMaxPatchOperations(options) {
    if (!options || options.maxPatchOperations === undefined || options.maxPatchOperations === null)
        return -1;
    const value = options.maxPatchOperations;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError('maxPatchOperations option must be a non-negative safe integer');
    }
    return value;
}
function diffDirtyRows(source, target, dirtyRows, patch, keyCompare, getVersion, arrayKey) {
    for (let i = 0, length = dirtyRows.length; i < length; i++) {
        const frontier = dirtyRows[i];
        const rows = normalizeDirtyRowIndexes(frontier.rows);
        if (rows.length === 0)
            continue;
        const path = frontier.path;
        const fields = frontier.fields;
        const sourceRows = readPathValue(source, path);
        const targetRows = readPathValue(target, path);
        if (fields === undefined &&
            tryDiffDirtyWholeRows(sourceRows, targetRows, rows, path, patch)) {
            continue;
        }
        if (fields !== undefined &&
            fields.length !== 0 &&
            tryDiffDirtyRowObjectFieldAssign(sourceRows, targetRows, rows, fields, path, patch)) {
            continue;
        }
        if (fields !== undefined &&
            fields.length !== 0 &&
            tryDiffDirtyRowObjectFieldsAssign(sourceRows, targetRows, rows, fields, path, patch)) {
            continue;
        }
        diffDirtyRowsFallback(source, target, rows === frontier.rows ? frontier : { ...frontier, rows }, patch, keyCompare, getVersion, arrayKey);
    }
}
function normalizeDirtyRowIndexes(rows) {
    const length = rows.length;
    if (length < 2)
        return rows;
    let previous = -1;
    let ordered = true;
    for (let i = 0; i < length; i++) {
        const row = rows[i];
        if (row <= previous) {
            ordered = false;
            break;
        }
        previous = row;
    }
    if (ordered || length > DIRTY_ROW_NORMALIZE_MAX)
        return rows;
    const sorted = new Array(length);
    for (let i = 0; i < length; i++)
        sorted[i] = rows[i];
    sorted.sort(compareNumbers);
    let write = 1;
    previous = sorted[0];
    for (let i = 1; i < length; i++) {
        const row = sorted[i];
        if (row !== previous) {
            sorted[write++] = row;
            previous = row;
        }
    }
    sorted.length = write;
    return sorted;
}
function compareNumbers(left, right) {
    return left - right;
}
function tryDiffDirtyPathsAsCommonObjectSets(source, target, dirtyPaths, patch) {
    if (!Array.isArray(dirtyPaths) ||
        dirtyPaths.length < DIRTY_COMMON_OBJECT_SET_MIN) {
        return false;
    }
    const first = dirtyPaths[0];
    validateDirtyPath(first);
    const length = first.length;
    if (length < 1)
        return false;
    const prefixLength = length - 1;
    for (let i = 1, count = dirtyPaths.length; i < count; i++) {
        const path = dirtyPaths[i];
        validateDirtyPath(path);
        if (path.length !== length)
            return false;
        for (let segmentIndex = 0; segmentIndex < prefixLength; segmentIndex++) {
            if (path[segmentIndex] !== first[segmentIndex])
                return false;
        }
    }
    const parentPath = first.slice(0, prefixLength);
    const sourceObject = readPathValue(source, parentPath);
    const targetObject = readPathValue(target, parentPath);
    if (sourceObject === MISSING_PATH_VALUE ||
        targetObject === MISSING_PATH_VALUE ||
        sourceObject === null ||
        targetObject === null ||
        typeof sourceObject !== 'object' ||
        typeof targetObject !== 'object' ||
        Array.isArray(sourceObject) ||
        Array.isArray(targetObject)) {
        return false;
    }
    const patchStart = patch.length;
    const assigned = {};
    let changed = 0;
    for (let i = 0, count = dirtyPaths.length; i < count; i++) {
        const path = dirtyPaths[i];
        const key = path[prefixLength];
        if (typeof key !== 'string') {
            patch.length = patchStart;
            return false;
        }
        const sourceHasKey = hasOwn.call(sourceObject, key);
        const targetHasKey = hasOwn.call(targetObject, key);
        if (!targetHasKey) {
            patch.length = patchStart;
            return false;
        }
        const targetValue = targetObject[key];
        if (sourceHasKey) {
            const sourceValue = sourceObject[key];
            if (sourceValue === targetValue) {
                if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                    continue;
            }
            if (!shouldSetDirect(sourceValue, targetValue)) {
                patch.length = patchStart;
                return false;
            }
        }
        if (key === '__proto__') {
            setOwnValue(assigned, key, targetValue);
        }
        else {
            assigned[key] = targetValue;
        }
        changed++;
    }
    if (changed !== 0)
        patch[patch.length] = [OP_ASSIGN, parentPath, assigned];
    return true;
}
function tryDiffDirtyWholeRows(sourceRows, targetRows, rows, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || sourceRows.length !== targetRows.length) {
        return false;
    }
    const rowCount = rows.length;
    if (rowCount === 0)
        return true;
    const indexes = new Array(rowCount);
    const values = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
        const rowIndex = rows[i];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        indexes[i] = rowIndex;
        values[i] = targetRows[rowIndex];
    }
    patch[patch.length] = [OP_ARRAY_ASSIGN, path.slice(), indexes, values];
    return true;
}
function tryDiffDirtyRowObjectFieldAssign(sourceRows, targetRows, rows, fields, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || sourceRows.length !== targetRows.length) {
        return false;
    }
    const rowCount = rows.length;
    const fieldCount = fields.length;
    if (rowCount < DIRTY_ARRAY_ROW_GROUP_MIN || fieldCount < 1 || fieldCount > 16)
        return false;
    if (!areCompactDirtyRowFieldPaths(fields))
        return false;
    if (fieldCount === 1) {
        return tryDiffDirtySingleRowObjectFieldAssign(sourceRows, targetRows, rows, fields[0], path, patch);
    }
    const indexes = [];
    const values = [];
    const rowValues = new Array(fieldCount);
    let previousRow = -1;
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        const rowIndex = rows[rowOffset];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
            return false;
        }
        let changedCount = 0;
        for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
            const field = fields[fieldIndex];
            const sourceValue = readCompactRowField(sourceRow, field);
            const targetValue = readCompactRowField(targetRow, field);
            if (sourceValue === MISSING_PATH_VALUE ||
                targetValue === MISSING_PATH_VALUE ||
                !isJsonScalarForReplaceRun(sourceValue) ||
                !isJsonScalarForReplaceRun(targetValue)) {
                return false;
            }
            rowValues[fieldIndex] = targetValue;
            if (!sameJsonScalarOrRef(sourceValue, targetValue))
                changedCount++;
        }
        if (changedCount !== 0) {
            if (changedCount * 2 < fieldCount)
                return false;
            indexes[indexes.length] = rowIndex;
            for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
                values[values.length] = rowValues[fieldIndex];
            }
        }
        previousRow = rowIndex;
    }
    if (indexes.length === 0)
        return true;
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, copyFieldPaths(fields), values];
    return true;
}
function tryDiffDirtySingleRowObjectFieldAssign(sourceRows, targetRows, rows, field, path, patch) {
    const rowCount = rows.length;
    const indexes = [];
    const values = [];
    let previousRow = -1;
    if (field.length === 1) {
        const key = field[0];
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
            const rowIndex = rows[rowOffset];
            if (!Number.isSafeInteger(rowIndex) ||
                rowIndex < 0 ||
                rowIndex <= previousRow ||
                !hasOwn.call(sourceRows, rowIndex) ||
                !hasOwn.call(targetRows, rowIndex)) {
                return false;
            }
            const sourceRow = sourceRows[rowIndex];
            const targetRow = targetRows[rowIndex];
            if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
                return false;
            }
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key)) {
                return false;
            }
            const sourceValue = sourceRow[key];
            const targetValue = targetRow[key];
            if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
                return false;
            }
            if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
                indexes[indexes.length] = rowIndex;
                values[values.length] = targetValue;
            }
            previousRow = rowIndex;
        }
    }
    else {
        const key = field[0];
        const childKey = field[1];
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
            const rowIndex = rows[rowOffset];
            if (!Number.isSafeInteger(rowIndex) ||
                rowIndex < 0 ||
                rowIndex <= previousRow ||
                !hasOwn.call(sourceRows, rowIndex) ||
                !hasOwn.call(targetRows, rowIndex)) {
                return false;
            }
            const sourceRow = sourceRows[rowIndex];
            const targetRow = targetRows[rowIndex];
            if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
                return false;
            }
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key)) {
                return false;
            }
            const sourceParent = sourceRow[key];
            const targetParent = targetRow[key];
            if (sourceParent === null ||
                targetParent === null ||
                typeof sourceParent !== 'object' ||
                typeof targetParent !== 'object' ||
                !hasOwn.call(sourceParent, childKey) ||
                !hasOwn.call(targetParent, childKey)) {
                return false;
            }
            const sourceValue = sourceParent[childKey];
            const targetValue = targetParent[childKey];
            if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
                return false;
            }
            if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
                indexes[indexes.length] = rowIndex;
                values[values.length] = targetValue;
            }
            previousRow = rowIndex;
        }
    }
    if (indexes.length === 0)
        return true;
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, [field.slice()], values];
    return true;
}
function areCompactDirtyRowFieldPaths(fields) {
    for (let i = 0, length = fields.length; i < length; i++) {
        const field = fields[i];
        if (!Array.isArray(field) || field.length === 0 || field.length > 2)
            return false;
        const key = field[0];
        if (typeof key !== 'string')
            return false;
        if (field.length === 2) {
            const childKey = field[1];
            if (typeof childKey !== 'string' && typeof childKey !== 'number')
                return false;
        }
    }
    return true;
}
function readCompactRowField(row, field) {
    if (field.length === 1) {
        const key = field[0];
        return hasOwn.call(row, key) ? row[key] : MISSING_PATH_VALUE;
    }
    const key = field[0];
    if (!hasOwn.call(row, key))
        return MISSING_PATH_VALUE;
    const parent = row[key];
    if (parent === null || typeof parent !== 'object')
        return MISSING_PATH_VALUE;
    const childKey = field[1];
    return hasOwn.call(parent, childKey) ? parent[childKey] : MISSING_PATH_VALUE;
}
function tryDiffDirtyPathsAsRepeatedRowFields(source, target, dirtyPaths, patch) {
    if (!Array.isArray(dirtyPaths) || dirtyPaths.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    const first = dirtyPaths[0];
    validateDirtyPath(first);
    const rowDepth = findDirtyPathRowDepth(first);
    if (rowDepth < 0)
        return false;
    const second = dirtyPaths[1];
    if (Array.isArray(second) &&
        second[rowDepth] !== first[rowDepth] &&
        tryDiffDirtyPathsAsSingleRepeatedRowField(source, target, dirtyPaths, first, rowDepth, patch)) {
        return true;
    }
    const basePath = first.slice(0, rowDepth);
    const rows = [];
    const fields = [];
    let fieldCount = 0;
    let previousRow = -1;
    let index = 0;
    while (index < dirtyPaths.length) {
        const rowStart = dirtyPaths[index];
        if (index !== 0)
            validateDirtyPath(rowStart);
        if (!samePathPrefixLength(rowStart, first, rowDepth))
            return false;
        const rowIndex = rowStart[rowDepth];
        if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex <= previousRow)
            return false;
        let rowFieldCount = 0;
        while (index < dirtyPaths.length) {
            const path = dirtyPaths[index];
            if (path !== rowStart)
                validateDirtyPath(path);
            if (!samePathPrefixLength(path, first, rowDepth) ||
                path[rowDepth] !== rowIndex) {
                break;
            }
            const relativeLength = path.length - rowDepth - 1;
            if (relativeLength < 1 || relativeLength > 2)
                return false;
            if (fieldCount === 0) {
                if (rowFieldCount >= 16)
                    return false;
                const field = relativeLength === 1
                    ? [path[rowDepth + 1]]
                    : [path[rowDepth + 1], path[rowDepth + 2]];
                if (!isCompactDirtyRowFieldPath(field) || hasRepeatedDirtyRowField(fields, rowFieldCount, field)) {
                    return false;
                }
                fields[rowFieldCount] = field;
            }
            else {
                if (rowFieldCount >= fieldCount)
                    return false;
                const field = fields[rowFieldCount];
                if (field.length !== relativeLength ||
                    field[0] !== path[rowDepth + 1] ||
                    (relativeLength === 2 && field[1] !== path[rowDepth + 2])) {
                    return false;
                }
            }
            rowFieldCount++;
            index++;
        }
        if (fieldCount === 0) {
            fieldCount = rowFieldCount;
            if (fieldCount === 0 || fieldCount > 16)
                return false;
        }
        else if (rowFieldCount !== fieldCount) {
            return false;
        }
        rows[rows.length] = rowIndex;
        previousRow = rowIndex;
    }
    if (rows.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    const sourceRows = readPathValue(source, basePath);
    const targetRows = readPathValue(target, basePath);
    return tryDiffDirtyRowObjectFieldAssign(sourceRows, targetRows, rows, fields, basePath, patch);
}
function tryDiffDirtyPathsAsSingleRepeatedRowFieldPrefix(source, target, dirtyPaths, patch) {
    if (!Array.isArray(dirtyPaths) || dirtyPaths.length < DIRTY_ARRAY_ROW_GROUP_MIN + 1)
        return 0;
    const first = dirtyPaths[0];
    validateDirtyPath(first);
    const rowDepth = findDirtyPathRowDepth(first);
    if (rowDepth < 0)
        return 0;
    const relativeLength = first.length - rowDepth - 1;
    if (relativeLength < 1 || relativeLength > 2)
        return 0;
    const key = first[rowDepth + 1];
    if (typeof key !== 'string')
        return 0;
    const nested = relativeLength === 2;
    const childKey = nested ? first[rowDepth + 2] : undefined;
    if (nested && typeof childKey !== 'string' && typeof childKey !== 'number')
        return 0;
    const basePath = first.slice(0, rowDepth);
    const sourceRows = readPathValue(source, basePath);
    const targetRows = readPathValue(target, basePath);
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || sourceRows.length !== targetRows.length) {
        return 0;
    }
    const expectedLength = rowDepth + 1 + relativeLength;
    const indexes = [];
    const values = [];
    let previousRow = -1;
    let index = 0;
    for (let count = dirtyPaths.length; index < count; index++) {
        const path = dirtyPaths[index];
        if (index !== 0)
            validateDirtyPath(path);
        if (path.length !== expectedLength ||
            !samePathPrefixLength(path, first, rowDepth) ||
            path[rowDepth + 1] !== key ||
            (nested && path[rowDepth + 2] !== childKey)) {
            break;
        }
        const rowIndex = path[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return 0;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
            return 0;
        }
        let sourceValue;
        let targetValue;
        if (nested) {
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key))
                return 0;
            const sourceParent = sourceRow[key];
            const targetParent = targetRow[key];
            if (sourceParent === null ||
                targetParent === null ||
                typeof sourceParent !== 'object' ||
                typeof targetParent !== 'object' ||
                !hasOwn.call(sourceParent, childKey) ||
                !hasOwn.call(targetParent, childKey)) {
                return 0;
            }
            sourceValue = sourceParent[childKey];
            targetValue = targetParent[childKey];
        }
        else {
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key))
                return 0;
            sourceValue = sourceRow[key];
            targetValue = targetRow[key];
        }
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
            return 0;
        }
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            indexes[indexes.length] = rowIndex;
            values[values.length] = targetValue;
        }
        previousRow = rowIndex;
    }
    if (index < DIRTY_ARRAY_ROW_GROUP_MIN)
        return 0;
    if (indexes.length !== 0) {
        patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, basePath, indexes, [nested ? [key, childKey] : [key]], values];
    }
    return index;
}
function tryDiffDirtyPathsAsFieldMajorRowFields(source, target, dirtyPaths, patch) {
    if (!Array.isArray(dirtyPaths) || dirtyPaths.length < DIRTY_ARRAY_ROW_GROUP_MIN * 2)
        return false;
    const first = dirtyPaths[0];
    validateDirtyPath(first);
    const rowDepth = findDirtyPathRowDepth(first);
    if (rowDepth < 0)
        return false;
    const firstRelativeLength = first.length - rowDepth - 1;
    if (firstRelativeLength < 1 || firstRelativeLength > 2)
        return false;
    const firstExpectedLength = first.length;
    const firstField = copyDirtyRelativeField(first, rowDepth, firstRelativeLength);
    if (!isCompactDirtyRowFieldPath(firstField))
        return false;
    const basePath = first.slice(0, rowDepth);
    const rows = [];
    let index = 0;
    let previousRow = -1;
    while (index < dirtyPaths.length) {
        const path = dirtyPaths[index];
        if (index !== 0)
            validateDirtyPath(path);
        if (path.length !== firstExpectedLength ||
            !samePathPrefixLength(path, first, rowDepth) ||
            !sameDirtyRelativeField(path, rowDepth, firstField)) {
            break;
        }
        const rowIndex = path[rowDepth];
        if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex <= previousRow)
            return false;
        rows[rows.length] = rowIndex;
        previousRow = rowIndex;
        index++;
    }
    const rowCount = rows.length;
    if (rowCount < DIRTY_ARRAY_ROW_GROUP_MIN || index === dirtyPaths.length)
        return false;
    const fields = [firstField];
    while (index < dirtyPaths.length) {
        const fieldStart = dirtyPaths[index];
        validateDirtyPath(fieldStart);
        const relativeLength = fieldStart.length - rowDepth - 1;
        if (relativeLength < 1 ||
            relativeLength > 2 ||
            !samePathPrefixLength(fieldStart, first, rowDepth)) {
            return false;
        }
        const field = copyDirtyRelativeField(fieldStart, rowDepth, relativeLength);
        if (!isCompactDirtyRowFieldPath(field) ||
            hasRepeatedDirtyRowField(fields, fields.length, field) ||
            fields.length >= 16) {
            return false;
        }
        fields[fields.length] = field;
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
            const path = dirtyPaths[index + rowOffset];
            if (path === undefined)
                return false;
            if (rowOffset !== 0)
                validateDirtyPath(path);
            if (path.length !== fieldStart.length ||
                !samePathPrefixLength(path, first, rowDepth) ||
                path[rowDepth] !== rows[rowOffset] ||
                !sameDirtyRelativeField(path, rowDepth, field)) {
                return false;
            }
        }
        index += rowCount;
    }
    const sourceRows = readPathValue(source, basePath);
    const targetRows = readPathValue(target, basePath);
    return tryDiffDirtyRowObjectFieldAssign(sourceRows, targetRows, rows, fields, basePath, patch);
}
function copyDirtyRelativeField(path, rowDepth, relativeLength) {
    return relativeLength === 1
        ? [path[rowDepth + 1]]
        : [path[rowDepth + 1], path[rowDepth + 2]];
}
function sameDirtyRelativeField(path, rowDepth, field) {
    if (path[rowDepth + 1] !== field[0])
        return false;
    return field.length === 1 || path[rowDepth + 2] === field[1];
}
function tryDiffDirtyPathsAsSingleRepeatedRowField(source, target, dirtyPaths, first, rowDepth, patch) {
    const relativeLength = first.length - rowDepth - 1;
    if (relativeLength < 1 || relativeLength > 2)
        return false;
    const key = first[rowDepth + 1];
    if (typeof key !== 'string')
        return false;
    const nested = relativeLength === 2;
    const childKey = nested ? first[rowDepth + 2] : undefined;
    if (nested && typeof childKey !== 'string' && typeof childKey !== 'number')
        return false;
    const basePath = first.slice(0, rowDepth);
    const sourceRows = readPathValue(source, basePath);
    const targetRows = readPathValue(target, basePath);
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || sourceRows.length !== targetRows.length) {
        return false;
    }
    const expectedLength = rowDepth + 1 + relativeLength;
    const indexes = [];
    const values = [];
    let previousRow = -1;
    for (let index = 0, count = dirtyPaths.length; index < count; index++) {
        const path = dirtyPaths[index];
        if (index !== 0)
            validateDirtyPath(path);
        if (path.length !== expectedLength ||
            !samePathPrefixLength(path, first, rowDepth) ||
            path[rowDepth + 1] !== key ||
            (nested && path[rowDepth + 2] !== childKey)) {
            return false;
        }
        const rowIndex = path[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
            return false;
        }
        let sourceValue;
        let targetValue;
        if (nested) {
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key))
                return false;
            const sourceParent = sourceRow[key];
            const targetParent = targetRow[key];
            if (sourceParent === null ||
                targetParent === null ||
                typeof sourceParent !== 'object' ||
                typeof targetParent !== 'object' ||
                !hasOwn.call(sourceParent, childKey) ||
                !hasOwn.call(targetParent, childKey)) {
                return false;
            }
            sourceValue = sourceParent[childKey];
            targetValue = targetParent[childKey];
        }
        else {
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key))
                return false;
            sourceValue = sourceRow[key];
            targetValue = targetRow[key];
        }
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
            return false;
        }
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            indexes[indexes.length] = rowIndex;
            values[values.length] = targetValue;
        }
        previousRow = rowIndex;
    }
    if (indexes.length === 0)
        return true;
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    const field = nested ? [key, childKey] : [key];
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, basePath, indexes, [field], values];
    return true;
}
function findDirtyPathRowDepth(path) {
    for (let i = path.length - 2; i >= 0; i--) {
        if (typeof path[i] === 'number' && typeof path[i + 1] === 'string')
            return i;
    }
    return -1;
}
function samePathPrefixLength(left, right, length) {
    if (left.length <= length || right.length <= length)
        return false;
    for (let i = 0; i < length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}
function isCompactDirtyRowFieldPath(field) {
    if (field.length === 0 || field.length > 2 || typeof field[0] !== 'string')
        return false;
    return field.length === 1 || typeof field[1] === 'string' || typeof field[1] === 'number';
}
function hasRepeatedDirtyRowField(fields, length, field) {
    for (let i = 0; i < length; i++) {
        const current = fields[i];
        if (current.length === field.length &&
            current[0] === field[0] &&
            (field.length === 1 || current[1] === field[1])) {
            return true;
        }
    }
    return false;
}
function copyFieldPaths(fields) {
    const out = new Array(fields.length);
    for (let i = 0, length = fields.length; i < length; i++)
        out[i] = fields[i].slice();
    return out;
}
function tryDiffDirtyRowObjectFieldsAssign(sourceRows, targetRows, rows, fields, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || sourceRows.length !== targetRows.length) {
        return false;
    }
    const rowCount = rows.length;
    if (rowCount < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    const fieldPlan = prepareDirtyRowObjectFieldPlan(fields);
    if (fieldPlan === null)
        return false;
    const directKeys = fieldPlan[0];
    const nestedKeys = fieldPlan[1];
    const nestedFields = fieldPlan[2];
    const indexes = [];
    const values = [];
    let previousRow = -1;
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        const rowIndex = rows[rowOffset];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
            return false;
        }
        let assign = null;
        for (let fieldIndex = 0, fieldCount = directKeys.length; fieldIndex < fieldCount; fieldIndex++) {
            const key = directKeys[fieldIndex];
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key)) {
                return false;
            }
            const sourceValue = sourceRow[key];
            const targetValue = targetRow[key];
            if (sameJsonScalarOrRef(sourceValue, targetValue) || boundedJsonEquals(sourceValue, targetValue)) {
                continue;
            }
            if (shouldSetCollapsedChild(sourceValue, targetValue))
                return false;
            if (assign === null)
                assign = {};
            setOwnValue(assign, key, targetValue);
        }
        for (let groupIndex = 0, groupCount = nestedKeys.length; groupIndex < groupCount; groupIndex++) {
            const key = nestedKeys[groupIndex];
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key)) {
                return false;
            }
            const sourceTopValue = sourceRow[key];
            const targetTopValue = targetRow[key];
            if (sameJsonScalarOrRef(sourceTopValue, targetTopValue)) {
                continue;
            }
            const groupFields = nestedFields[groupIndex];
            let changed = false;
            for (let fieldIndex = 0, fieldCount = groupFields.length; fieldIndex < fieldCount; fieldIndex++) {
                const field = groupFields[fieldIndex];
                const sourceValue = readPathPrefixValueFrom(sourceTopValue, field, 1, field.length);
                const targetValue = readPathPrefixValueFrom(targetTopValue, field, 1, field.length);
                if (sourceValue === MISSING_PATH_VALUE || targetValue === MISSING_PATH_VALUE) {
                    return false;
                }
                if (!sameJsonScalarOrRef(sourceValue, targetValue) && !boundedJsonEquals(sourceValue, targetValue)) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                if (!isSmallDirtyNestedAssignValue(targetTopValue))
                    return false;
                if (assign === null)
                    assign = {};
                setOwnValue(assign, key, targetTopValue);
            }
        }
        if (assign !== null) {
            indexes[indexes.length] = rowIndex;
            values[values.length] = assign;
        }
        previousRow = rowIndex;
    }
    if (indexes.length === 0)
        return true;
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    emitArrayObjectAssign(patch, path, indexes, values);
    return true;
}
function prepareDirtyRowObjectFieldPlan(fields) {
    const directKeys = [];
    const nestedKeys = [];
    const nestedFields = [];
    for (let fieldIndex = 0, fieldCount = fields.length; fieldIndex < fieldCount; fieldIndex++) {
        const field = fields[fieldIndex];
        const topKey = field[0];
        if (field.length === 0 || typeof topKey !== 'string')
            return null;
        if (field.length === 1) {
            if (directKeys.indexOf(topKey) === -1)
                directKeys[directKeys.length] = topKey;
            continue;
        }
        if (directKeys.indexOf(topKey) !== -1)
            continue;
        let groupIndex = nestedKeys.indexOf(topKey);
        if (groupIndex === -1) {
            groupIndex = nestedKeys.length;
            nestedKeys[groupIndex] = topKey;
            nestedFields[groupIndex] = [field];
        }
        else {
            nestedFields[groupIndex][nestedFields[groupIndex].length] = field;
        }
    }
    for (let i = nestedKeys.length - 1; i >= 0; i--) {
        if (directKeys.indexOf(nestedKeys[i]) !== -1) {
            nestedKeys.splice(i, 1);
            nestedFields.splice(i, 1);
        }
    }
    return [directKeys, nestedKeys, nestedFields];
}
function readPathPrefixValueFrom(root, path, start, length) {
    let value = root;
    for (let i = start; i < length; i++) {
        if (value === null || typeof value !== 'object') {
            return MISSING_PATH_VALUE;
        }
        const key = path[i];
        if (!hasOwn.call(value, key)) {
            return MISSING_PATH_VALUE;
        }
        value = value[key];
    }
    return value;
}
function diffDirtyRowsFallback(source, target, frontier, patch, keyCompare, getVersion, arrayKey) {
    const rows = frontier.rows;
    const fields = frontier.fields;
    const basePath = frontier.path;
    const path = basePath.slice();
    const baseLength = path.length;
    for (let rowOffset = 0, rowCount = rows.length; rowOffset < rowCount; rowOffset++) {
        const rowIndex = rows[rowOffset];
        path[baseLength] = rowIndex;
        if (fields === undefined || fields.length === 0) {
            diffOneDirtyPath(source, target, path, patch, keyCompare, getVersion, arrayKey);
            path.length = baseLength;
            continue;
        }
        for (let fieldIndex = 0, fieldCount = fields.length; fieldIndex < fieldCount; fieldIndex++) {
            const field = fields[fieldIndex];
            for (let segmentIndex = 0, segmentCount = field.length; segmentIndex < segmentCount; segmentIndex++) {
                path[baseLength + 1 + segmentIndex] = field[segmentIndex];
            }
            path.length = baseLength + 1 + field.length;
            diffOneDirtyPath(source, target, path, patch, keyCompare, getVersion, arrayKey);
            path.length = baseLength + 1;
        }
        path.length = baseLength;
    }
}
function diffDirtyPaths(source, target, dirtyPaths, patch, keyCompare, getVersion, arrayKey) {
    if (dirtyPaths.length === 0)
        return;
    if (dirtyPaths.length === 1) {
        const path = expandDirtyPath(source, target, dirtyPaths[0]);
        if (path.length === 0) {
            walk(source, target, [], patch, keyCompare, getVersion, arrayKey);
        }
        else {
            diffOneDirtyPath(source, target, path, patch, keyCompare, getVersion, arrayKey);
        }
        return;
    }
    let expanded = null;
    for (let i = 0, length = dirtyPaths.length; i < length; i++) {
        const original = dirtyPaths[i];
        const path = expandDirtyPath(source, target, original);
        if (path.length === 0) {
            walk(source, target, [], patch, keyCompare, getVersion, arrayKey);
            return;
        }
        if (expanded !== null) {
            expanded[i] = path;
        }
        else if (path !== original) {
            expanded = new Array(length);
            for (let j = 0; j < i; j++)
                expanded[j] = dirtyPaths[j];
            expanded[i] = path;
        }
    }
    const frontier = expanded === null ? dirtyPaths : normalizeDirtyPaths(expanded, false);
    if (tryDiffDirtyCommonScalarArrayCellAssign(source, target, frontier, patch)) {
        return;
    }
    if (tryDiffDirtyCommonScalarArrayIndexAssign(source, target, frontier, patch)) {
        return;
    }
    if (tryDiffDirtyCommonArrayObjectAssign(source, target, frontier, patch)) {
        return;
    }
    if (frontier.length >= DIRTY_ARRAY_ROW_GROUP_MIN && frontier.length <= DIRTY_PATH_GROUP_MAX) {
        diffDirtyPathGroups(source, target, frontier, 0, frontier.length, 0, [], patch, keyCompare, getVersion, arrayKey);
    }
    else {
        for (let i = 0, length = frontier.length; i < length; i++) {
            diffOneDirtyPath(source, target, frontier[i], patch, keyCompare, getVersion, arrayKey);
        }
    }
}
function tryDiffDirtyCommonScalarArrayCellAssign(source, target, paths, patch) {
    const count = paths.length;
    if (count < ARRAY_TUPLE_ASSIGN_MIN)
        return false;
    const first = paths[0];
    const length = first.length;
    if (length < 2)
        return false;
    const prefixLength = length - 2;
    const last = paths[count - 1];
    if (last.length !== length)
        return false;
    for (let i = 0; i < prefixLength; i++) {
        if (first[i] !== last[i])
            return false;
    }
    for (let i = 1; i < count - 1; i++) {
        if (paths[i].length !== length)
            return false;
    }
    const path = first.slice(0, prefixLength);
    const sourceRows = readPathValue(source, path);
    const targetRows = readPathValue(target, path);
    if (count >= DENSE_DIRTY_CELL_PLAN_MIN &&
        hasPotentialDenseDirtyCellRows(paths, prefixLength) &&
        tryDiffDirtyScalarArrayCellPlan(sourceRows, targetRows, paths, 0, count, prefixLength, path, patch)) {
        return true;
    }
    return tryDiffDirtyScalarArrayCellAssign(sourceRows, targetRows, paths, 0, count, prefixLength, path, patch);
}
function tryDiffDirtyCommonScalarArrayIndexAssign(source, target, paths, patch) {
    const pathCount = paths.length;
    if (pathCount < ARRAY_ASSIGN_MIN)
        return false;
    const first = paths[0];
    const length = first.length;
    if (length < 1)
        return false;
    const prefixLength = length - 1;
    const last = paths[pathCount - 1];
    if (last.length !== length)
        return false;
    for (let i = 0; i < prefixLength; i++) {
        if (first[i] !== last[i])
            return false;
    }
    for (let i = 1; i < pathCount - 1; i++) {
        if (paths[i].length !== length)
            return false;
    }
    const path = first.slice(0, prefixLength);
    const sourceArray = readPathValue(source, path);
    const targetArray = readPathValue(target, path);
    if (!Array.isArray(sourceArray) || !Array.isArray(targetArray) || sourceArray.length !== targetArray.length) {
        return false;
    }
    let indexes = null;
    let values = null;
    let count = 0;
    let previousIndex = -1;
    let previousChangedIndex = -2;
    let firstChangedIndex = -1;
    let contiguous = true;
    for (let i = 0; i < pathCount; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== length)
            return false;
        for (let j = 0; j < prefixLength; j++) {
            if (dirtyPath[j] !== first[j])
                return false;
        }
        const index = dirtyPath[prefixLength];
        if (!Number.isSafeInteger(index) ||
            index < 0 ||
            index <= previousIndex ||
            !hasOwn.call(sourceArray, index) ||
            !hasOwn.call(targetArray, index)) {
            return false;
        }
        const sourceValue = sourceArray[index];
        const targetValue = targetArray[index];
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue))
            return false;
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            if (indexes === null) {
                indexes = [];
                values = [];
                firstChangedIndex = index;
            }
            if (previousChangedIndex >= 0 && index !== previousChangedIndex + 1)
                contiguous = false;
            indexes[count] = index;
            values[count] = targetValue;
            count++;
            previousChangedIndex = index;
        }
        previousIndex = index;
    }
    if (count === 0)
        return true;
    if (count < ARRAY_ASSIGN_MIN)
        return false;
    if (contiguous && count <= SCALAR_REPLACE_RUN_LIMIT) {
        patch[patch.length] = [OP_ARRAY_SPLICE, path, firstChangedIndex, count, values];
        return true;
    }
    patch[patch.length] = [OP_ARRAY_ASSIGN, path, indexes, values];
    return true;
}
function tryDiffDirtyCommonArrayObjectAssign(source, target, paths, patch) {
    const count = paths.length;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || count > DIRTY_PATH_GROUP_MAX)
        return false;
    const first = paths[0];
    const last = paths[count - 1];
    const rowDepth = commonPathPrefixLength(first, last);
    if (rowDepth < 0 || rowDepth >= first.length || rowDepth >= last.length)
        return false;
    if (count > 1 && paths[1][rowDepth] === first[rowDepth])
        return false;
    for (let i = 1; i < count - 1; i++) {
        if (!pathHasPrefix(paths[i], first, rowDepth))
            return false;
    }
    const path = first.slice(0, rowDepth);
    const sourceRows = readPathValue(source, path);
    const targetRows = readPathValue(target, path);
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    return (tryDiffDirtyArrayObjectFieldAssign(sourceRows, targetRows, paths, 0, count, rowDepth, path, patch) ||
        tryDiffDirtyArrayObjectRowFieldAssign(sourceRows, targetRows, paths, 0, count, rowDepth, path, patch) ||
        tryDiffDirtyArrayObjectNestedAssign(sourceRows, targetRows, paths, 0, count, rowDepth, path, patch));
}
function commonPathPrefixLength(left, right) {
    const length = left.length < right.length ? left.length : right.length;
    for (let i = 0; i < length; i++) {
        if (left[i] !== right[i])
            return i;
    }
    return length;
}
function pathHasPrefix(path, prefixPath, length) {
    if (path.length <= length)
        return false;
    for (let i = 0; i < length; i++) {
        if (path[i] !== prefixPath[i])
            return false;
    }
    return true;
}
function hasPotentialDenseDirtyCellRows(paths, rowDepth) {
    let currentRow = -1;
    let currentCount = 0;
    for (let i = 0, length = paths.length; i < length; i++) {
        const rowIndex = paths[i][rowDepth];
        if (rowIndex === currentRow) {
            currentCount++;
        }
        else {
            currentRow = rowIndex;
            currentCount = 1;
        }
        if (currentCount >= DENSE_DIRTY_CELL_ROW_MIN)
            return true;
    }
    return false;
}
function diffOneDirtyPath(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceValue = readPathValue(source, path);
    const targetValue = readPathValue(target, path);
    diffDirtyValue(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
}
function diffDirtyPathGroups(source, target, paths, start, end, depth, path, patch, keyCompare, getVersion, arrayKey) {
    let index = start;
    while (index < end) {
        const segment = paths[index][depth];
        let groupEnd = index + 1;
        while (groupEnd < end && paths[groupEnd][depth] === segment) {
            groupEnd++;
        }
        path[path.length] = segment;
        const sourceValue = readChildValue(source, segment);
        const targetValue = readChildValue(target, segment);
        if (depth + 1 === paths[index].length) {
            diffDirtyValue(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        }
        else if (tryDiffDirtyObjectLeafGroup(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch)) {
            // handled by grouped leaf assignment
        }
        else if (!tryDiffDirtyScalarArrayRowBandAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyScalarArrayRowKeyframeAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyScalarArrayCellAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyScalarArrayRows(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyArrayObjectRowFieldAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyArrayObjectFieldAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyArrayObjectAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch) &&
            !tryDiffDirtyArrayObjectNestedAssign(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch)) {
            diffDirtyPathGroups(sourceValue, targetValue, paths, index, groupEnd, depth + 1, path, patch, keyCompare, getVersion, arrayKey);
        }
        path.length--;
        index = groupEnd;
    }
}
function tryDiffDirtyObjectLeafGroup(sourceObject, targetObject, paths, start, end, keyDepth, path, patch) {
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN ||
        sourceObject === MISSING_PATH_VALUE ||
        targetObject === MISSING_PATH_VALUE ||
        sourceObject === null ||
        targetObject === null ||
        typeof sourceObject !== 'object' ||
        typeof targetObject !== 'object' ||
        Array.isArray(sourceObject) ||
        Array.isArray(targetObject)) {
        return false;
    }
    let assign = null;
    let assignCount = 0;
    let assignKey = null;
    let assignValue = undefined;
    const patchStart = patch.length;
    const pathDepth = path.length;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== keyDepth + 1) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const key = dirtyPath[keyDepth];
        if (typeof key !== 'string') {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const sourceHasKey = hasOwn.call(sourceObject, key);
        const targetHasKey = hasOwn.call(targetObject, key);
        if (sourceHasKey) {
            if (targetHasKey) {
                const sourceValue = sourceObject[key];
                const targetValue = targetObject[key];
                if (sourceValue === targetValue) {
                    if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                        continue;
                }
                if (!shouldSetDirect(sourceValue, targetValue)) {
                    patch.length = patchStart;
                    path.length = pathDepth;
                    return false;
                }
                if (assign === null)
                    assign = {};
                setOwnValue(assign, key, targetValue);
                assignKey = key;
                assignValue = targetValue;
                assignCount++;
            }
            else {
                if (assign !== null) {
                    patch.length = patchStart;
                    path.length = pathDepth;
                    return false;
                }
                path[pathDepth] = key;
                patch[patch.length] = [OP_REMOVE, path.slice()];
                path.length = pathDepth;
            }
        }
        else if (targetHasKey) {
            if (assign === null)
                assign = {};
            setOwnValue(assign, key, targetObject[key]);
            assignKey = key;
            assignValue = targetObject[key];
            assignCount++;
        }
    }
    if (assign !== null) {
        if (assignCount === 1) {
            path[pathDepth] = assignKey;
            emitSet(patch, path, assignValue);
        }
        else {
            patch[patch.length] = [OP_ASSIGN, path.slice(), assign];
        }
    }
    path.length = pathDepth;
    return patch.length > patchStart;
}
function tryDiffDirtyScalarArrayRowBandAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || sourceRows.length !== targetRows.length)
        return false;
    let indexes = null;
    let values = null;
    let previousRow = -1;
    let rowWidth = 0;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 1)
            return false;
        const rowIndex = dirtyPath[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isFullDirtyScalarRow(sourceRow, targetRow))
            return false;
        if (rowWidth === 0)
            rowWidth = sourceRow.length;
        else if (sourceRow.length !== rowWidth)
            return false;
        if (indexes === null) {
            indexes = [];
            values = [];
        }
        indexes[indexes.length] = rowIndex;
        values[values.length] = targetRows[rowIndex];
        previousRow = rowIndex;
    }
    if (indexes === null || indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    patch[patch.length] = [OP_ARRAY_ASSIGN, path.slice(), indexes, values];
    return true;
}
function isFullDirtyScalarRow(sourceRow, targetRow) {
    if (!Array.isArray(sourceRow) || !Array.isArray(targetRow))
        return false;
    const length = sourceRow.length;
    if (length === 0 || length !== targetRow.length)
        return false;
    for (let i = 0; i < length; i++) {
        if (!hasOwn.call(sourceRow, i) ||
            !hasOwn.call(targetRow, i) ||
            !isJsonScalarForReplaceRun(sourceRow[i]) ||
            !isJsonScalarForReplaceRun(targetRow[i]) ||
            sameJsonScalarOrRef(sourceRow[i], targetRow[i])) {
            return false;
        }
    }
    return true;
}
function tryDiffDirtyScalarArrayRowKeyframeAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const rowCount = end - start;
    if (rowCount < 8 ||
        path.length < 4 ||
        sourceRows.length !== targetRows.length) {
        return false;
    }
    let indexes = null;
    let values = null;
    let previousRow = -1;
    let width = 0;
    let denseSamples = 0;
    const sampleOffset0 = 0;
    const sampleOffset1 = rowCount >> 1;
    const sampleOffset2 = rowCount - 1;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 1)
            return false;
        const rowIndex = dirtyPath[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        const offset = i - start;
        if (offset === sampleOffset0 ||
            offset === sampleOffset1 ||
            offset === sampleOffset2) {
            const sourceRow = sourceRows[rowIndex];
            const targetRow = targetRows[rowIndex];
            const rowWidth = readKeyframeScalarRowWidth(sourceRow);
            if (rowWidth === 0 || !isFixedScalarTupleRow(targetRow, rowWidth))
                return false;
            if (width === 0)
                width = rowWidth;
            else if (rowWidth !== width)
                return false;
            const changed = countChangedScalarRowCells(sourceRow, targetRow, rowWidth);
            if (!isDenseDirtyRowSample(changed, rowWidth))
                return false;
            denseSamples++;
        }
        if (indexes === null) {
            indexes = [];
            values = [];
        }
        indexes[indexes.length] = rowIndex;
        values[values.length] = targetRows[rowIndex];
        previousRow = rowIndex;
    }
    if (indexes === null || denseSamples === 0)
        return false;
    patch[patch.length] = [OP_ARRAY_ASSIGN, path.slice(), indexes, values];
    return true;
}
function tryDiffDirtyScalarArrayCellAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const pathCount = end - start;
    if (pathCount < ARRAY_TUPLE_ASSIGN_MIN || sourceRows.length !== targetRows.length)
        return false;
    let rowIndexes = null;
    let fieldIndexes = null;
    let values = null;
    let count = 0;
    let previousRow = -1;
    let previousField = -1;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 2)
            return false;
        const rowIndex = dirtyPath[rowDepth];
        const fieldIndex = dirtyPath[rowDepth + 1];
        if (!Number.isSafeInteger(rowIndex) ||
            !Number.isSafeInteger(fieldIndex) ||
            rowIndex < 0 ||
            fieldIndex < 0 ||
            rowIndex < previousRow ||
            (rowIndex === previousRow && fieldIndex <= previousField) ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!Array.isArray(sourceRow) ||
            !Array.isArray(targetRow) ||
            sourceRow.length !== targetRow.length ||
            !hasOwn.call(sourceRow, fieldIndex) ||
            !hasOwn.call(targetRow, fieldIndex)) {
            return false;
        }
        const sourceValue = sourceRow[fieldIndex];
        const targetValue = targetRow[fieldIndex];
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue))
            return false;
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            if (rowIndexes === null) {
                rowIndexes = [];
                fieldIndexes = [];
                values = [];
            }
            rowIndexes[count] = rowIndex;
            fieldIndexes[count] = fieldIndex;
            values[count] = targetValue;
            count++;
        }
        previousRow = rowIndex;
        previousField = fieldIndex;
    }
    if (count === 0)
        return true;
    if (count < ARRAY_TUPLE_ASSIGN_MIN)
        return false;
    patch[patch.length] = [OP_ARRAY_TUPLE_ASSIGN, path.slice(), rowIndexes, fieldIndexes, values];
    return true;
}
function tryDiffDirtyScalarArrayCellPlan(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || sourceRows.length !== targetRows.length) {
        return false;
    }
    const patchStart = patch.length;
    const pathDepth = path.length;
    const tupleRowIndexes = [];
    const tupleFieldIndexes = [];
    const tupleValues = [];
    const rowIndexes = [];
    const rowValues = [];
    let currentRowIndex = -1;
    let currentSourceRow = null;
    let currentTargetRow = null;
    let currentRowLength = 0;
    let currentFields = [];
    let currentValues = [];
    let previousRow = -1;
    let previousField = -1;
    let denseRows = 0;
    let changedCount = 0;
    const flushRow = () => {
        const rowChangeCount = currentValues.length;
        if (rowChangeCount === 0)
            return true;
        if (rowChangeCount >= DENSE_DIRTY_CELL_ROW_MIN &&
            rowChangeCount * 2 >= currentRowLength) {
            rowIndexes[rowIndexes.length] = currentRowIndex;
            rowValues[rowValues.length] = currentTargetRow;
            denseRows++;
        }
        else {
            for (let i = 0; i < rowChangeCount; i++) {
                tupleRowIndexes[tupleRowIndexes.length] = currentRowIndex;
                tupleFieldIndexes[tupleFieldIndexes.length] = currentFields[i];
                tupleValues[tupleValues.length] = currentValues[i];
            }
        }
        return true;
    };
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 2) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const rowIndex = dirtyPath[rowDepth];
        const fieldIndex = dirtyPath[rowDepth + 1];
        if (!Number.isSafeInteger(rowIndex) ||
            !Number.isSafeInteger(fieldIndex) ||
            rowIndex < 0 ||
            fieldIndex < 0 ||
            rowIndex < previousRow ||
            (rowIndex === previousRow && fieldIndex <= previousField)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (rowIndex !== currentRowIndex) {
            if (!flushRow()) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            if (!hasOwn.call(sourceRows, rowIndex) || !hasOwn.call(targetRows, rowIndex)) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            currentSourceRow = sourceRows[rowIndex];
            currentTargetRow = targetRows[rowIndex];
            if (!Array.isArray(currentSourceRow) ||
                !Array.isArray(currentTargetRow) ||
                currentSourceRow.length !== currentTargetRow.length) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            currentRowIndex = rowIndex;
            currentRowLength = currentSourceRow.length;
            currentFields = [];
            currentValues = [];
        }
        if (fieldIndex >= currentRowLength ||
            !hasOwn.call(currentSourceRow, fieldIndex) ||
            !hasOwn.call(currentTargetRow, fieldIndex)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const sourceValue = currentSourceRow[fieldIndex];
        const targetValue = currentTargetRow[fieldIndex];
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            currentFields[currentFields.length] = fieldIndex;
            currentValues[currentValues.length] = targetValue;
            changedCount++;
        }
        previousRow = rowIndex;
        previousField = fieldIndex;
    }
    if (!flushRow()) {
        patch.length = patchStart;
        path.length = pathDepth;
        return false;
    }
    if (denseRows === 0) {
        patch.length = patchStart;
        path.length = pathDepth;
        return false;
    }
    if (changedCount === 0)
        return true;
    const arrayPath = path.slice();
    if (rowIndexes.length !== 0) {
        patch[patch.length] = [OP_ARRAY_ASSIGN, arrayPath, rowIndexes, rowValues];
    }
    if (tupleValues.length >= ARRAY_TUPLE_ASSIGN_MIN) {
        patch[patch.length] = [OP_ARRAY_TUPLE_ASSIGN, arrayPath, tupleRowIndexes, tupleFieldIndexes, tupleValues];
    }
    else {
        for (let i = 0, length = tupleValues.length; i < length; i++) {
            path[pathDepth] = tupleRowIndexes[i];
            path[pathDepth + 1] = tupleFieldIndexes[i];
            emitSet(patch, path, tupleValues[i]);
            path.length = pathDepth;
        }
    }
    return true;
}
function countChangedScalarRowCells(sourceRow, targetRow, width) {
    let count = 0;
    for (let i = 0; i < width; i++) {
        if (!sameJsonScalarOrRef(sourceRow[i], targetRow[i]))
            count++;
    }
    return count;
}
function isDenseDirtyRowSample(changed, width) {
    if (changed < 4)
        return false;
    return changed * 4 >= width;
}
function tryDiffDirtyScalarArrayRows(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || sourceRows.length !== targetRows.length)
        return false;
    const patchStart = patch.length;
    const pathDepth = path.length;
    let previousRow = -1;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 1) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const rowIndex = dirtyPath[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (!emitDirtyScalarArrayRowPatch(sourceRows[rowIndex], targetRows[rowIndex], path, rowIndex, patch)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        previousRow = rowIndex;
    }
    path.length = pathDepth;
    return true;
}
function emitDirtyScalarArrayRowPatch(sourceRow, targetRow, path, rowIndex, patch) {
    if (!Array.isArray(sourceRow) || !Array.isArray(targetRow))
        return false;
    const length = sourceRow.length;
    if (length === 0 || length !== targetRow.length)
        return false;
    let start = 0;
    while (start < length && sameJsonScalarOrRef(sourceRow[start], targetRow[start])) {
        start++;
    }
    if (start === length)
        return true;
    let end = length - 1;
    while (end > start && sameJsonScalarOrRef(sourceRow[end], targetRow[end])) {
        end--;
    }
    let indexes = null;
    let values = null;
    let count = 0;
    let previous = -2;
    let contiguous = true;
    for (let i = start; i <= end; i++) {
        const sourceValue = sourceRow[i];
        const targetValue = targetRow[i];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue))
            return false;
        if (indexes === null) {
            indexes = [];
            values = [];
        }
        if (i !== previous + 1)
            contiguous = count === 0;
        indexes[count] = i;
        values[count] = targetValue;
        count++;
        previous = i;
    }
    if (count === 0)
        return true;
    const pathDepth = path.length;
    path[pathDepth] = rowIndex;
    if (contiguous && count >= 2 && count <= SCALAR_REPLACE_RUN_LIMIT) {
        patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), indexes[0], count, values];
        path.length = pathDepth;
        return true;
    }
    if (count >= ARRAY_ASSIGN_MIN) {
        patch[patch.length] = [OP_ARRAY_ASSIGN, path.slice(), indexes, values];
        path.length = pathDepth;
        return true;
    }
    for (let i = 0; i < count; i++) {
        path[pathDepth + 1] = indexes[i];
        emitSet(patch, path, values[i]);
    }
    path.length = pathDepth;
    return true;
}
function tryDiffDirtyArrayObjectAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || sourceRows.length !== targetRows.length)
        return false;
    const patchStart = patch.length;
    const pathDepth = path.length;
    let indexes = null;
    let values = null;
    let currentRowIndex = -1;
    let currentAssign = null;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 2) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const rowIndex = dirtyPath[rowDepth];
        const key = dirtyPath[rowDepth + 1];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            typeof key !== 'string' ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (rowIndex !== currentRowIndex) {
            if (rowIndex <= currentRowIndex) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            const sourceRow = sourceRows[rowIndex];
            const targetRow = targetRows[rowIndex];
            if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            currentAssign = null;
            currentRowIndex = rowIndex;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const sourceValue = sourceRow[key];
        const targetValue = targetRow[key];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
        }
        if (shouldSetCollapsedChild(sourceValue, targetValue)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (currentAssign === null) {
            if (indexes === null) {
                indexes = [];
                values = [];
            }
            currentAssign = {};
            indexes[indexes.length] = rowIndex;
            values[values.length] = currentAssign;
        }
        setOwnValue(currentAssign, key, targetValue);
    }
    if (indexes === null || indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN) {
        patch.length = patchStart;
        path.length = pathDepth;
        return false;
    }
    emitArrayObjectAssign(patch, path, indexes, values);
    path.length = pathDepth;
    return true;
}
function tryDiffDirtyArrayObjectRowFieldAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || sourceRows.length !== targetRows.length)
        return false;
    const patchStart = patch.length;
    const pathDepth = path.length;
    let fields = null;
    let fieldCount = 0;
    const indexes = [];
    const values = [];
    const changedKeys = [];
    const changedValues = [];
    let previousRow = -1;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length !== rowDepth + 1) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const rowIndex = dirtyPath[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const changedCount = collectChangedDirectScalarFields(sourceRow, targetRow, changedKeys, changedValues);
        if (changedCount === 0) {
            previousRow = rowIndex;
            continue;
        }
        if (changedCount < 0 || changedCount > 16) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (fields === null) {
            fieldCount = changedCount;
            fields = new Array(fieldCount);
            for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
                fields[fieldIndex] = [changedKeys[fieldIndex]];
            }
        }
        else if (changedCount !== fieldCount) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        else {
            for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
                if (fields[fieldIndex][0] !== changedKeys[fieldIndex]) {
                    patch.length = patchStart;
                    path.length = pathDepth;
                    return false;
                }
            }
        }
        indexes[indexes.length] = rowIndex;
        for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
            values[values.length] = changedValues[fieldIndex];
        }
        previousRow = rowIndex;
    }
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN) {
        patch.length = patchStart;
        path.length = pathDepth;
        return false;
    }
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, fields, values];
    path.length = pathDepth;
    return true;
}
function collectChangedDirectScalarFields(sourceRow, targetRow, keys, values) {
    keys.length = 0;
    values.length = 0;
    for (const key in sourceRow) {
        if (!hasOwn.call(sourceRow, key))
            continue;
        if (!hasOwn.call(targetRow, key))
            return -1;
        const sourceValue = sourceRow[key];
        const targetValue = targetRow[key];
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
                if (boundedJsonEquals(sourceValue, targetValue))
                    continue;
                return -1;
            }
            keys[keys.length] = key;
            values[values.length] = targetValue;
        }
    }
    for (const key in targetRow) {
        if (!hasOwn.call(targetRow, key))
            continue;
        if (!hasOwn.call(sourceRow, key))
            return -1;
    }
    return keys.length;
}
function tryDiffDirtyArrayObjectFieldAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || sourceRows.length !== targetRows.length)
        return false;
    const patchStart = patch.length;
    const pathDepth = path.length;
    let fields = null;
    let fieldCount = 0;
    const indexes = [];
    const values = [];
    const rowValues = [];
    const detectedFields = [];
    let previousRow = -1;
    let index = start;
    while (index < end) {
        const firstPath = paths[index];
        const rowIndex = firstPath[rowDepth];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            rowIndex <= previousRow ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const sourceRow = sourceRows[rowIndex];
        const targetRow = targetRows[rowIndex];
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        let changedCount = 0;
        let currentFieldCount = 0;
        while (index < end && paths[index][rowDepth] === rowIndex) {
            const dirtyPath = paths[index];
            const relativeLength = dirtyPath.length - rowDepth - 1;
            if (relativeLength < 1 || relativeLength > 2) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            const key = dirtyPath[rowDepth + 1];
            if (typeof key !== 'string') {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            let field;
            if (fields === null) {
                if (currentFieldCount >= 16) {
                    patch.length = patchStart;
                    path.length = pathDepth;
                    return false;
                }
                if (relativeLength === 1) {
                    field = [key];
                }
                else {
                    const childKey = dirtyPath[rowDepth + 2];
                    if (typeof childKey !== 'string' && typeof childKey !== 'number') {
                        patch.length = patchStart;
                        path.length = pathDepth;
                        return false;
                    }
                    field = [key, childKey];
                }
                detectedFields[currentFieldCount] = field;
            }
            else {
                if (currentFieldCount >= fieldCount) {
                    patch.length = patchStart;
                    path.length = pathDepth;
                    return false;
                }
                field = fields[currentFieldCount];
                if (field.length !== relativeLength ||
                    field[0] !== key ||
                    (relativeLength === 2 && field[1] !== dirtyPath[rowDepth + 2])) {
                    patch.length = patchStart;
                    path.length = pathDepth;
                    return false;
                }
            }
            const sourceValue = readCompactRowField(sourceRow, field);
            const targetValue = readCompactRowField(targetRow, field);
            if (sourceValue === MISSING_PATH_VALUE ||
                targetValue === MISSING_PATH_VALUE ||
                !isJsonScalarForReplaceRun(sourceValue) ||
                !isJsonScalarForReplaceRun(targetValue)) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            rowValues[currentFieldCount] = targetValue;
            if (!sameJsonScalarOrRef(sourceValue, targetValue))
                changedCount++;
            currentFieldCount++;
            index++;
        }
        if (fields === null) {
            if (currentFieldCount === 0 || currentFieldCount > 16) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            fieldCount = currentFieldCount;
            fields = new Array(fieldCount);
            for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
                fields[fieldIndex] = detectedFields[fieldIndex];
            }
        }
        else if (currentFieldCount !== fieldCount) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (changedCount !== 0) {
            indexes[indexes.length] = rowIndex;
            for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
                values[values.length] = rowValues[fieldIndex];
            }
        }
        previousRow = rowIndex;
    }
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN) {
        patch.length = patchStart;
        path.length = pathDepth;
        return false;
    }
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, copyFieldPaths(fields), values];
    path.length = pathDepth;
    return true;
}
function tryDiffDirtyArrayObjectNestedAssign(sourceRows, targetRows, paths, start, end, rowDepth, path, patch) {
    if (!Array.isArray(sourceRows) || !Array.isArray(targetRows))
        return false;
    const count = end - start;
    if (count < DIRTY_ARRAY_ROW_GROUP_MIN || sourceRows.length !== targetRows.length)
        return false;
    const patchStart = patch.length;
    const pathDepth = path.length;
    let indexes = null;
    let values = null;
    let currentRowIndex = -1;
    let currentAssign = null;
    let currentTopKey = null;
    let sourceRow = null;
    let targetRow = null;
    for (let i = start; i < end; i++) {
        const dirtyPath = paths[i];
        if (dirtyPath.length < rowDepth + 2) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const rowIndex = dirtyPath[rowDepth];
        const topKey = dirtyPath[rowDepth + 1];
        if (!Number.isSafeInteger(rowIndex) ||
            rowIndex < 0 ||
            typeof topKey !== 'string' ||
            !hasOwn.call(sourceRows, rowIndex) ||
            !hasOwn.call(targetRows, rowIndex)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (rowIndex !== currentRowIndex) {
            if (rowIndex < currentRowIndex) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            sourceRow = sourceRows[rowIndex];
            targetRow = targetRows[rowIndex];
            if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)) {
                patch.length = patchStart;
                path.length = pathDepth;
                return false;
            }
            currentAssign = null;
            currentTopKey = null;
            currentRowIndex = rowIndex;
        }
        if (topKey === currentTopKey)
            continue;
        if (!hasOwn.call(sourceRow, topKey) || !hasOwn.call(targetRow, topKey)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        const sourceValue = sourceRow[topKey];
        const targetValue = targetRow[topKey];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue) {
                currentTopKey = topKey;
                continue;
            }
        }
        else if (boundedJsonEquals(sourceValue, targetValue)) {
            currentTopKey = topKey;
            continue;
        }
        if (dirtyPath.length > rowDepth + 2 && !isSmallDirtyNestedAssignValue(targetValue)) {
            patch.length = patchStart;
            path.length = pathDepth;
            return false;
        }
        if (currentAssign === null) {
            if (indexes === null) {
                indexes = [];
                values = [];
            }
            currentAssign = {};
            indexes[indexes.length] = rowIndex;
            values[values.length] = currentAssign;
        }
        setOwnValue(currentAssign, topKey, targetValue);
        currentTopKey = topKey;
    }
    if (indexes === null || indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN) {
        patch.length = patchStart;
        path.length = pathDepth;
        return false;
    }
    emitArrayObjectAssign(patch, path, indexes, values);
    path.length = pathDepth;
    return true;
}
function isSmallDirtyNestedAssignValue(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    let count = 0;
    for (const key in value) {
        if (!hasOwn.call(value, key))
            continue;
        count++;
        if (count > 8)
            return false;
        const child = value[key];
        if (child !== null && typeof child === 'object')
            return false;
    }
    return count > 0;
}
function diffDirtyValue(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey) {
    if (sourceValue !== MISSING_PATH_VALUE) {
        if (targetValue !== MISSING_PATH_VALUE) {
            walk(sourceValue, targetValue, path.slice(), patch, keyCompare, getVersion, arrayKey);
        }
        else {
            patch[patch.length] = [OP_REMOVE, path.slice()];
        }
    }
    else if (targetValue !== MISSING_PATH_VALUE) {
        emitSet(patch, path, targetValue);
    }
}
function readChildValue(value, key) {
    if (value === MISSING_PATH_VALUE ||
        value === null ||
        typeof value !== 'object' ||
        !hasOwn.call(value, key)) {
        return MISSING_PATH_VALUE;
    }
    return value[key];
}
function expandDirtyPath(source, target, path) {
    if (path.length < 4)
        return expandDirtyPathFromLeaf(source, target, path);
    let sourceValue = source;
    let targetValue = target;
    let structuralArrayDepth = -1;
    for (let depth = 0, length = path.length; depth < length; depth++) {
        const key = path[depth];
        if (sourceValue !== MISSING_PATH_VALUE &&
            targetValue !== MISSING_PATH_VALUE &&
            Array.isArray(sourceValue) &&
            Array.isArray(targetValue)) {
            if (sourceValue.length !== targetValue.length ||
                hasOwn.call(sourceValue, key) !== hasOwn.call(targetValue, key)) {
                structuralArrayDepth = depth;
            }
        }
        sourceValue = readChildValue(sourceValue, key);
        targetValue = readChildValue(targetValue, key);
    }
    return structuralArrayDepth === -1 ? path : path.slice(0, structuralArrayDepth);
}
function expandDirtyPathFromLeaf(source, target, path) {
    for (let depth = path.length - 1; depth >= 0; depth--) {
        const sourceValue = readPathPrefixValue(source, path, depth);
        const targetValue = readPathPrefixValue(target, path, depth);
        if (sourceValue !== MISSING_PATH_VALUE &&
            targetValue !== MISSING_PATH_VALUE &&
            Array.isArray(sourceValue) &&
            Array.isArray(targetValue)) {
            const key = path[depth];
            if (sourceValue.length !== targetValue.length ||
                hasOwn.call(sourceValue, key) !== hasOwn.call(targetValue, key)) {
                return path.slice(0, depth);
            }
        }
    }
    return path;
}
function readPathValue(root, path) {
    return readPathPrefixValue(root, path, path.length);
}
function readPathPrefixValue(root, path, length) {
    let value = root;
    for (let i = 0; i < length; i++) {
        if (value === null || typeof value !== 'object') {
            return MISSING_PATH_VALUE;
        }
        const key = path[i];
        if (!hasOwn.call(value, key)) {
            return MISSING_PATH_VALUE;
        }
        value = value[key];
    }
    return value;
}
function walk(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    if (source === target) {
        if (source !== 0 || 1 / source === 1 / target)
            return;
    }
    const sourceType = jsonType(source);
    const targetType = jsonType(target);
    if (sourceType === TYPE_STRING &&
        targetType === TYPE_STRING &&
        shouldUseStringSplice(source, target)) {
        emitStringSplice(patch, path, source, target);
        return;
    }
    if (sourceType !== targetType ||
        targetType <= TYPE_STRING ||
        sourceType === TYPE_OTHER) {
        emitSet(patch, path, target);
        return;
    }
    if (getVersion !== null && sameVersionedSubtree(source, target, getVersion))
        return;
    if (targetType === TYPE_ARRAY) {
        diffArrays(source, target, path, patch, keyCompare, getVersion, arrayKey);
        return;
    }
    diffObjects(source, target, path, patch, keyCompare, getVersion, arrayKey);
}
function diffArrays(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const lengthDelta = targetLength - sourceLength;
    const commonLength = sourceLength < targetLength ? sourceLength : targetLength;
    const depth = path.length;
    if (shouldUseSparseArrayDiff(source, target, commonLength)) {
        diffSparseArrays(source, target, path, patch, keyCompare, getVersion, arrayKey);
        return;
    }
    let startIndex = 0;
    if (lengthDelta > 1) {
        while (startIndex < sourceLength) {
            const sourceValue = source[startIndex];
            const targetValue = target[startIndex];
            if (sourceValue !== targetValue || (sourceValue === 0 && 1 / sourceValue !== 1 / targetValue))
                break;
            startIndex++;
        }
        if (startIndex === sourceLength) {
            emitAppend(patch, path, sourceLength, targetLength, target);
            return;
        }
    }
    if (lengthDelta !== 0 &&
        (lengthDelta < -SMALL_ARRAY_SHIFT_LIMIT || lengthDelta > SMALL_ARRAY_SHIFT_LIMIT) &&
        tryLargePrimitiveShiftedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    if (lengthDelta !== 0 &&
        (lengthDelta < -SMALL_ARRAY_SHIFT_LIMIT || lengthDelta > SMALL_ARRAY_SHIFT_LIMIT) &&
        tryLargeShiftedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    if (targetLength === sourceLength &&
        commonLength >= 32 &&
        tryRecordArrayNestedScalarFieldDiff(source, target, path, patch, commonLength)) {
        return;
    }
    if (arrayKey === null &&
        keyCompare === null &&
        targetLength === sourceLength &&
        sourceLength <= STRUCTURAL_ARRAY_KEY_MAX &&
        tryPureSingleCompositeMoveArrayDiff(source, target, path, patch, 'type', 'label')) {
        return;
    }
    if (arrayKey === null &&
        keyCompare === null &&
        targetLength === sourceLength &&
        tryPureSingleScalarMoveArrayDiff(source, target, path, patch)) {
        return;
    }
    if (arrayKey === null &&
        keyCompare === null &&
        targetLength === sourceLength &&
        sourceLength >= LARGE_STRUCTURAL_SINGLE_MOVE_MIN &&
        sourceLength <= LARGE_PURE_KEYED_MOVE_MAX &&
        tryLargePureSingleStructuralMoveArrayDiff(source, target, path, patch)) {
        return;
    }
    if (targetLength === sourceLength &&
        tryTupleArrayAssignDiff(source, target, path, patch)) {
        return;
    }
    if (shouldReplaceArray(source, target, commonLength, getVersion) &&
        (arrayKey === false ||
            !shouldPreserveAlignedKeyedArray(source, target, commonLength, keyCompare))) {
        if (arrayKey === false ||
            !tryKeyedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
            if (tryEmitScalarArrayReplace(patch, path, target))
                return;
            emitSet(patch, path, target);
            return;
        }
        return;
    }
    if (arrayKey !== false &&
        !shouldSkipAutoKeyedArrayDiff(source, target, commonLength, keyCompare, arrayKey) &&
        tryKeyedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    if (targetLength === sourceLength &&
        commonLength >= 512) {
        if (hasSampledRecordRowScalarChange(source, target, commonLength) &&
            tryRecordArrayFieldAssignDiff(source, target, path, patch)) {
            return;
        }
    }
    const tryFlatRecords = commonLength >= 512;
    const tryBoundedRowEquals = targetLength === sourceLength && commonLength >= 512;
    const collectFlatAssigns = targetLength === sourceLength && commonLength >= 512;
    let flatKey0 = null;
    let flatKey1 = null;
    let assignIndexes = null;
    let assignValues = null;
    if (lengthDelta !== 0 &&
        lengthDelta >= -SMALL_ARRAY_SHIFT_LIMIT &&
        lengthDelta <= SMALL_ARRAY_SHIFT_LIMIT &&
        tryShiftedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    if (lengthDelta !== 0 &&
        tryTailArraySpliceDiff(source, target, path, patch)) {
        return;
    }
    if (targetLength === sourceLength &&
        tryBalancedRecordShiftDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    if (targetLength === sourceLength &&
        tryScalarReplaceRunDiff(source, target, path, patch)) {
        return;
    }
    if (targetLength === sourceLength &&
        tryLargeScalarArrayRunSpliceDiff(source, target, path, patch)) {
        return;
    }
    if (targetLength === sourceLength &&
        tryScalarArrayAssignDiff(source, target, path, patch)) {
        return;
    }
    if (keyCompare === null &&
        targetLength === sourceLength &&
        commonLength >= TWO_KEY_RECORD_ARRAY_MIN &&
        tryTwoKeyRecordArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    for (let i = startIndex; i < commonLength; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
        }
        if (getVersion !== null &&
            sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
            continue;
        }
        if (tryBoundedRowEquals &&
            sourceValue !== null &&
            targetValue !== null &&
            typeof sourceValue === 'object' &&
            typeof targetValue === 'object' &&
            boundedJsonEquals(sourceValue, targetValue)) {
            continue;
        }
        if (tryFlatRecords &&
            sourceValue !== null &&
            targetValue !== null &&
            typeof sourceValue === 'object' &&
            typeof targetValue === 'object' &&
            flatKey0 !== null &&
            flatTwoKeyObjectEquals(sourceValue, targetValue, flatKey0, flatKey1)) {
            continue;
        }
        if (tryFlatRecords &&
            flatKey0 === null &&
            sourceValue !== null &&
            targetValue !== null &&
            typeof sourceValue === 'object' &&
            typeof targetValue === 'object' &&
            flatPrimitiveObjectEquals(sourceValue, targetValue)) {
            const keys = Object.keys(sourceValue);
            if (keys.length === 2) {
                flatKey0 = keys[0];
                flatKey1 = keys[1];
            }
            continue;
        }
        if (collectFlatAssigns) {
            const assign = makeFlatObjectAssign(sourceValue, targetValue);
            if (assign !== null) {
                if (assignIndexes === null) {
                    assignIndexes = [];
                    assignValues = [];
                }
                assignIndexes[assignIndexes.length] = i;
                assignValues[assignValues.length] = assign;
                continue;
            }
        }
        path[depth] = i;
        walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        path.length = depth;
    }
    if (assignIndexes !== null) {
        if (assignIndexes.length >= DIRTY_ARRAY_ROW_GROUP_MIN) {
            emitArrayObjectAssignFromTarget(patch, path, assignIndexes, assignValues, target);
        }
        else {
            emitArrayObjectAssignsIndividually(patch, path, assignIndexes, assignValues);
        }
    }
    if (targetLength < sourceLength) {
        patch[patch.length] = [OP_TRUNCATE, path.slice(), targetLength];
        return;
    }
    if (lengthDelta > 1) {
        emitAppend(patch, path, sourceLength, targetLength, target);
        return;
    }
    for (let i = sourceLength; i < targetLength; i++) {
        path[depth] = i;
        emitSet(patch, path, target[i]);
        path.length = depth;
    }
}
function shouldPreserveAlignedKeyedArray(source, target, commonLength, keyCompare) {
    if (keyCompare !== null ||
        commonLength < KEYED_ARRAY_MIN ||
        commonLength > OBJECT_FIELD_ARRAY_KEY_MAX ||
        source.length !== target.length) {
        return false;
    }
    return inferObjectFieldArrayKey(source, target, false) !== null;
}
function shouldSkipAutoKeyedArrayDiff(source, target, commonLength, keyCompare, arrayKey) {
    if (arrayKey !== null ||
        keyCompare !== null ||
        source.length !== target.length ||
        commonLength < KEYED_ARRAY_MIN) {
        return false;
    }
    const readKey = inferObjectFieldArrayKey(source, target, false);
    return readKey !== null && alignedArrayReaderKeyFullyMatches(source, target, commonLength, readKey);
}
function alignedArrayReaderKeyFullyMatches(source, target, commonLength, readKey) {
    for (let i = 0; i < commonLength; i++) {
        const sourceKey = readKey(source[i]);
        const targetKey = readKey(target[i]);
        if (!isValidArrayKey(sourceKey) || sourceKey !== targetKey)
            return false;
    }
    return true;
}
function emitAppend(patch, path, sourceLength, targetLength, target) {
    const values = new Array(targetLength - sourceLength);
    for (let i = sourceLength; i < targetLength; i++) {
        values[i - sourceLength] = target[i];
    }
    patch[patch.length] = [OP_APPEND, path.slice(), values];
}
function emitArrayInsert(patch, path, index, values) {
    const twoField = tryMakeTwoFieldInsert(values);
    if (twoField !== null) {
        patch[patch.length] = [
            OP_ARRAY_TWO_FIELD_INSERT,
            path.slice(),
            index,
            twoField.key0,
            twoField.key1,
            twoField.values0,
            twoField.values1
        ];
        return;
    }
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), index, 0, values];
}
function tryMakeTwoFieldInsert(values) {
    const length = values.length;
    if (length === 0)
        return null;
    const first = values[0];
    if (first === null || typeof first !== 'object' || Array.isArray(first) || hasOwn.call(first, '__proto__')) {
        return null;
    }
    const keys = Object.keys(first);
    if (keys.length !== 2)
        return null;
    const key0 = keys[0];
    const key1 = keys[1];
    const values0 = new Array(length);
    const values1 = new Array(length);
    for (let i = 0; i < length; i++) {
        const value = values[i];
        if (value === null ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            hasOwn.call(value, '__proto__') ||
            !hasExactOwnKeys2(value, key0, key1)) {
            return null;
        }
        const value0 = value[key0];
        const value1 = value[key1];
        if (!isJsonScalarForReplaceRun(value0) || !isJsonScalarForReplaceRun(value1))
            return null;
        values0[i] = value0;
        values1[i] = value1;
    }
    return { key0, key1, values0, values1 };
}
function tryEmitScalarArrayReplace(patch, path, target) {
    if (target.length === 0) {
        patch[patch.length] = [OP_SCALAR_ARRAY_REPLACE, path.slice(), []];
        return true;
    }
    const values = new Array(target.length);
    for (let i = 0, length = target.length; i < length; i++) {
        const value = target[i];
        if (!isJsonScalarForReplaceRun(value))
            return false;
        values[i] = value;
    }
    patch[patch.length] = [OP_SCALAR_ARRAY_REPLACE, path.slice(), values];
    return true;
}
function tryKeyedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceLength = source.length;
    const targetLength = target.length;
    if (sourceLength < KEYED_ARRAY_MIN && targetLength < KEYED_ARRAY_MIN)
        return false;
    const readKey = arrayKey === null || isArrayKeyPolicy(arrayKey)
        ? inferArrayKey(source, target, arrayKey)
        : arrayKey;
    if (readKey === null)
        return false;
    if (sourceLength === targetLength &&
        (sourceLength <= PURE_KEYED_MOVE_MAX ||
            (sourceLength <= LARGE_PURE_KEYED_MOVE_MAX &&
                readKey.keyKind === 'object'))) {
        if (readKey.keyKind === 'object') {
            if (tryPureSingleObjectKeyMoveArrayDiff(source, target, path, patch, readKey.key)) {
                return true;
            }
        }
        else if (isPureMoveKeyReader(readKey) &&
            tryPureSingleKeyMoveArrayDiff(source, target, path, patch, readKey)) {
            return true;
        }
    }
    const sourceKeys = readKey.keyKind === 'object'
        ? readUniqueObjectArrayKeys(source, readKey.key)
        : readUniqueArrayKeys(source, readKey);
    if (sourceKeys === null)
        return false;
    const targetKeys = readKey.keyKind === 'object'
        ? readUniqueObjectArrayKeys(target, readKey.key)
        : readUniqueArrayKeys(target, readKey);
    if (targetKeys === null)
        return false;
    const sourceKeyToIndex = sourceKeys.index;
    const targetKeyToIndex = targetKeys.index;
    const targetSourceIndexes = [];
    let commonCount = 0;
    let structuralChange = sourceLength !== targetLength;
    for (let i = 0; i < targetLength; i++) {
        const key = targetKeys.keys[i];
        const sourceIndex = sourceKeyToIndex.get(key);
        if (sourceIndex !== undefined) {
            targetSourceIndexes[targetSourceIndexes.length] = sourceIndex;
            commonCount++;
            if (sourceIndex !== i)
                structuralChange = true;
        }
        else {
            structuralChange = true;
        }
    }
    if (!structuralChange || commonCount < KEYED_ARRAY_MIN)
        return false;
    if (commonCount * 2 < (sourceLength < targetLength ? sourceLength : targetLength))
        return false;
    if (sourceLength === targetLength &&
        commonCount === sourceLength &&
        trySingleKeyMoveArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey, sourceKeys.keys, targetKeys.keys, sourceKeyToIndex)) {
        return true;
    }
    const keepCommon = markLongestIncreasingSubsequence(targetSourceIndexes);
    const stableSourceIndexes = new Uint8Array(sourceLength);
    for (let i = 0, length = keepCommon.length; i < length; i++) {
        if (keepCommon[i]) {
            const sourceIndex = targetSourceIndexes[i];
            stableSourceIndexes[sourceIndex] = 1;
        }
    }
    const patchStart = patch.length;
    const arrayPath = path.slice();
    const workKeys = sourceKeys.keys.slice();
    let moveCount = 0;
    for (let i = sourceLength - 1; i >= 0;) {
        if (targetKeyToIndex.get(sourceKeys.keys[i]) !== undefined) {
            i--;
            continue;
        }
        const end = i + 1;
        do {
            i--;
        } while (i >= 0 && targetKeyToIndex.get(sourceKeys.keys[i]) === undefined);
        const start = i + 1;
        const deleteCount = end - start;
        patch[patch.length] = [OP_ARRAY_SPLICE, arrayPath, start, deleteCount, []];
        workKeys.splice(start, deleteCount);
    }
    for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
        const targetKey = targetKeys.keys[targetIndex];
        if (workKeys[targetIndex] === targetKey)
            continue;
        const targetSourceIndex = sourceKeyToIndex.get(targetKey);
        if (targetSourceIndex === undefined) {
            let insertEnd = targetIndex + 1;
            while (insertEnd < targetLength && sourceKeyToIndex.get(targetKeys.keys[insertEnd]) === undefined) {
                insertEnd++;
            }
            const insertCount = insertEnd - targetIndex;
            const values = new Array(insertCount);
            const keys = new Array(insertCount);
            for (let i = 0; i < insertCount; i++) {
                values[i] = target[targetIndex + i];
                keys[i] = targetKeys.keys[targetIndex + i];
            }
            emitArrayInsert(patch, arrayPath, targetIndex, values);
            insertArrayItems(workKeys, targetIndex, keys);
            targetIndex = insertEnd - 1;
            continue;
        }
        if (stableSourceIndexes[targetSourceIndex] === 1) {
            const blockerKey = workKeys[targetIndex];
            const blockerSourceIndex = sourceKeyToIndex.get(blockerKey);
            if (blockerSourceIndex !== undefined &&
                stableSourceIndexes[blockerSourceIndex] !== 1) {
                const blockerTargetIndex = targetKeyToIndex.get(blockerKey);
                if (blockerTargetIndex !== targetIndex) {
                    moveCount++;
                    if (moveCount > KEYED_ARRAY_MOVE_LIMIT) {
                        patch.length = patchStart;
                        return false;
                    }
                    patch[patch.length] = [OP_ARRAY_MOVE, arrayPath, targetIndex, blockerTargetIndex];
                    moveArrayItem(workKeys, targetIndex, blockerTargetIndex);
                    targetIndex--;
                    continue;
                }
            }
        }
        const sourceIndex = indexOfKey(workKeys, targetKey, targetIndex + 1);
        if (sourceIndex < 0) {
            patch.length = patchStart;
            return false;
        }
        moveCount++;
        if (moveCount > KEYED_ARRAY_MOVE_LIMIT) {
            patch.length = patchStart;
            return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, arrayPath, sourceIndex, targetIndex];
        moveArrayItem(workKeys, sourceIndex, targetIndex);
    }
    if (!sameKeyOrder(workKeys, targetKeys.keys)) {
        patch.length = patchStart;
        return false;
    }
    diffKeyedTargetValues(source, target, path, patch, keyCompare, getVersion, arrayKey, targetKeys.keys, sourceKeyToIndex);
    return true;
}
function trySingleKeyMoveArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey, sourceKeys, targetKeys, sourceKeyToIndex) {
    const length = sourceKeys.length;
    let start = 0;
    while (start < length && sourceKeys[start] === targetKeys[start])
        start++;
    if (start === length)
        return false;
    let end = length - 1;
    while (end > start && sourceKeys[end] === targetKeys[end])
        end--;
    if (sourceKeys[start] === targetKeys[end]) {
        for (let sourceIndex = start + 1, targetIndex = start; targetIndex < end; sourceIndex++, targetIndex++) {
            if (sourceKeys[sourceIndex] !== targetKeys[targetIndex])
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), start, end];
    }
    else if (sourceKeys[end] === targetKeys[start]) {
        for (let sourceIndex = start, targetIndex = start + 1; sourceIndex < end; sourceIndex++, targetIndex++) {
            if (sourceKeys[sourceIndex] !== targetKeys[targetIndex])
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), end, start];
    }
    else {
        return false;
    }
    diffKeyedTargetValues(source, target, path, patch, keyCompare, getVersion, arrayKey, targetKeys, sourceKeyToIndex);
    return true;
}
function diffKeyedTargetValues(source, target, path, patch, keyCompare, getVersion, arrayKey, targetKeys, sourceKeyToIndex) {
    const depth = path.length;
    let assignIndexes = null;
    let assignValues = null;
    for (let i = 0, length = target.length; i < length; i++) {
        const sourceIndex = sourceKeyToIndex.get(targetKeys[i]);
        if (sourceIndex === undefined)
            continue;
        const sourceValue = source[sourceIndex];
        const targetValue = target[i];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
        }
        else if (getVersion !== null &&
            sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
            continue;
        }
        else if (boundedJsonEquals(sourceValue, targetValue)) {
            continue;
        }
        const assign = makeKeyedArrayObjectAssign(sourceValue, targetValue);
        if (assign !== null) {
            if (assignIndexes === null) {
                assignIndexes = [];
                assignValues = [];
            }
            assignIndexes[assignIndexes.length] = i;
            assignValues[assignValues.length] = assign;
            continue;
        }
        path[depth] = i;
        walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        path.length = depth;
    }
    if (assignIndexes !== null) {
        emitArrayObjectAssignFromTarget(patch, path, assignIndexes, assignValues, target);
    }
}
function makeKeyedArrayObjectAssign(source, target) {
    return makeChangedObjectAssign(source, target);
}
function makeChangedObjectAssign(source, target) {
    if (!isRecordObject(source) || !isRecordObject(target))
        return null;
    const sourceKeys = Object.keys(source);
    if (sourceKeys.length === 0 || sourceKeys.length > SMALL_OBJECT_KEY_LIMIT)
        return null;
    if (sourceKeys.length !== Object.keys(target).length)
        return null;
    let assign = null;
    let changed = 0;
    for (let i = 0, length = sourceKeys.length; i < length; i++) {
        const key = sourceKeys[i];
        if (!hasOwn.call(target, key))
            return null;
        const sourceValue = source[key];
        const targetValue = target[key];
        if (sameJsonScalarOrRef(sourceValue, targetValue) || boundedJsonEquals(sourceValue, targetValue))
            continue;
        if (++changed > 4)
            return null;
        if (assign === null)
            assign = {};
        setOwnValue(assign, key, targetValue);
    }
    return assign;
}
function inferArrayKey(source, target, policy) {
    const policyKey = inferPolicyArrayKey(source, target, policy);
    if (policyKey !== null)
        return policyKey;
    const fieldKey = inferObjectFieldArrayKey(source, target, true);
    if (fieldKey !== null)
        return fieldKey;
    const compositeKey = inferCompositeArrayKey(source, target);
    if (compositeKey !== null)
        return compositeKey;
    return inferStructuralArrayKey(source, target);
}
function isArrayKeyPolicy(value) {
    return value !== null && typeof value === 'object' && value.keyKind === 'policy';
}
function inferPolicyArrayKey(source, target, policy) {
    if (!isArrayKeyPolicy(policy) || policy.recordKeyCandidates === null)
        return null;
    const candidates = policy.recordKeyCandidates;
    for (let i = 0, length = candidates.length; i < length; i++) {
        const key = candidates[i];
        if (arrayKeyHasReorderSignal(source, target, key))
            return makeObjectKeyReader(key);
    }
    return null;
}
function isScalarArrayKeyCandidate(value) {
    if (typeof value === 'string')
        return value.length > 0 && value.length <= STRUCTURAL_KEY_MAX_STRING;
    if (typeof value === 'number')
        return Number.isSafeInteger(value) && !Object.is(value, -0);
    return false;
}
function arrayKeyHasReorderSignal(source, target, key) {
    const commonLength = source.length < target.length ? source.length : target.length;
    if (commonLength < KEYED_ARRAY_MIN)
        return false;
    const sampleCount = keySignalSampleCount(commonLength);
    const last = commonLength - 1;
    const sourceSeen = [];
    const targetSeen = [];
    let hasSignal = false;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceValue = source[index];
        const targetValue = target[index];
        if (!isRecordObject(sourceValue) || !isRecordObject(targetValue))
            return false;
        const sourceKey = sourceValue[key];
        const targetKey = targetValue[key];
        if (!isValidArrayKey(sourceKey) || !isValidArrayKey(targetKey))
            return false;
        if (smallSeenHas(sourceSeen, sourceKey) || smallSeenHas(targetSeen, targetKey))
            return false;
        sourceSeen[sourceSeen.length] = sourceKey;
        targetSeen[targetSeen.length] = targetKey;
        if (sourceKey !== targetKey)
            hasSignal = true;
    }
    return hasSignal;
}
function makeObjectKeyReader(key) {
    const reader = (value) => isRecordObject(value) ? value[key] : undefined;
    reader.keyKind = 'object';
    reader.key = key;
    return reader;
}
function inferCompositeArrayKey(source, target) {
    for (let i = 0, length = AUTO_COMPOSITE_KEY_PAIRS.length; i < length; i++) {
        const keys = AUTO_COMPOSITE_KEY_PAIRS[i];
        if (compositeArrayKeyHasReorderSignal(source, target, keys[0], keys[1])) {
            return makeCompositeObjectKeyReader(keys[0], keys[1]);
        }
    }
    return null;
}
function compositeArrayKeyHasReorderSignal(source, target, key0, key1) {
    const commonLength = source.length < target.length ? source.length : target.length;
    if (commonLength < KEYED_ARRAY_MIN || commonLength > STRUCTURAL_ARRAY_KEY_MAX)
        return false;
    const sampleCount = keySignalSampleCount(commonLength);
    const last = commonLength - 1;
    const sourceSeen = [];
    const targetSeen = [];
    let hasSignal = false;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceKey = readCompositeObjectKey(source[index], key0, key1);
        const targetKey = readCompositeObjectKey(target[index], key0, key1);
        if (sourceKey === undefined || targetKey === undefined)
            return false;
        if (smallSeenHas(sourceSeen, sourceKey) || smallSeenHas(targetSeen, targetKey))
            return false;
        sourceSeen[sourceSeen.length] = sourceKey;
        targetSeen[targetSeen.length] = targetKey;
        if (sourceKey !== targetKey)
            hasSignal = true;
    }
    return hasSignal;
}
function inferObjectFieldArrayKey(source, target, requireReorderSignal) {
    const commonLength = source.length < target.length ? source.length : target.length;
    if (commonLength < KEYED_ARRAY_MIN || commonLength > OBJECT_FIELD_ARRAY_KEY_MAX)
        return null;
    const first = source[0];
    if (!isRecordObject(first))
        return null;
    const keys = Object.keys(first);
    if (keys.length === 0 || keys.length > SMALL_OBJECT_KEY_LIMIT)
        return null;
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        const firstValue = first[key];
        if (isScalarArrayKeyCandidate(firstValue)) {
            if (scalarObjectFieldArrayKeyHasSignal(source, target, key, requireReorderSignal)) {
                return makeObjectKeyReader(key);
            }
        }
        else if (objectFieldArrayKeyHasSignal(source, target, key, requireReorderSignal)) {
            return makeObjectFieldKeyReader(key);
        }
    }
    return null;
}
function scalarObjectFieldArrayKeyHasSignal(source, target, key, requireReorderSignal) {
    const commonLength = source.length < target.length ? source.length : target.length;
    const sampleCount = keySignalSampleCount(commonLength);
    const last = commonLength - 1;
    const sourceSeen = [];
    const targetSeen = [];
    let hasSignal = false;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceValue = source[index];
        const targetValue = target[index];
        if (!isRecordObject(sourceValue) || !isRecordObject(targetValue))
            return false;
        const sourceKey = sourceValue[key];
        const targetKey = targetValue[key];
        if (!isValidArrayKey(sourceKey) || !isValidArrayKey(targetKey))
            return false;
        if (smallSeenHas(sourceSeen, sourceKey) || smallSeenHas(targetSeen, targetKey))
            return false;
        sourceSeen[sourceSeen.length] = sourceKey;
        targetSeen[targetSeen.length] = targetKey;
        if (sourceKey !== targetKey)
            hasSignal = true;
    }
    return requireReorderSignal ? hasSignal : true;
}
function objectFieldArrayKeyHasSignal(source, target, key, requireReorderSignal) {
    const commonLength = source.length < target.length ? source.length : target.length;
    const sampleCount = keySignalSampleCount(commonLength);
    const last = commonLength - 1;
    const sourceSeen = [];
    const targetSeen = [];
    let hasSignal = false;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceKey = readObjectFieldArrayKey(source[index], key);
        const targetKey = readObjectFieldArrayKey(target[index], key);
        if (sourceKey === undefined || targetKey === undefined)
            return false;
        if (smallSeenHas(sourceSeen, sourceKey) || smallSeenHas(targetSeen, targetKey))
            return false;
        sourceSeen[sourceSeen.length] = sourceKey;
        targetSeen[targetSeen.length] = targetKey;
        if (sourceKey !== targetKey)
            hasSignal = true;
    }
    return requireReorderSignal ? hasSignal : true;
}
function makeObjectFieldKeyReader(key) {
    const reader = (value) => readObjectFieldArrayKey(value, key);
    reader.keyKind = 'objectField';
    reader.key = key;
    return reader;
}
function readObjectFieldArrayKey(value, key) {
    if (!isRecordObject(value) || !hasOwn.call(value, key))
        return undefined;
    const field = value[key];
    if (isScalarArrayKeyCandidate(field)) {
        return field;
    }
    if (isStructuralKeyCandidate(field)) {
        return structuralArrayKey(field);
    }
    return undefined;
}
function smallSeenHas(values, value) {
    for (let i = 0, length = values.length; i < length; i++) {
        if (values[i] === value)
            return true;
    }
    return false;
}
function makeCompositeObjectKeyReader(key0, key1) {
    const reader = (value) => readCompositeObjectKey(value, key0, key1);
    reader.keyKind = 'composite';
    reader.key0 = key0;
    reader.key1 = key1;
    return reader;
}
function readCompositeObjectKey(value, key0, key1) {
    if (!isRecordObject(value))
        return undefined;
    const value0 = value[key0];
    const value1 = value[key1];
    if (!isCompositeKeyPart(value0) || !isCompositeKeyPart(value1))
        return undefined;
    return ('c' +
        key0.length + ':' + key0 +
        encodeCompositeKeyPart(value0) +
        key1.length + ':' + key1 +
        encodeCompositeKeyPart(value1));
}
function isCompositeKeyPart(value) {
    if (typeof value === 'string')
        return value.length > 0 && value.length <= STRUCTURAL_KEY_MAX_STRING;
    if (typeof value === 'number')
        return Number.isSafeInteger(value) && !Object.is(value, -0);
    if (typeof value === 'boolean')
        return true;
    return false;
}
function encodeCompositeKeyPart(value) {
    if (typeof value === 'string')
        return 's' + value.length + ':' + value;
    if (typeof value === 'number')
        return 'd' + String(value) + ';';
    return value ? 't;' : 'f;';
}
function boundedJsonEquals(source, target) {
    if (source === target)
        return source !== 0 || 1 / source === 1 / target;
    const state = { nodes: 0 };
    return boundedJsonEqualsInner(source, target, 0, state);
}
function boundedJsonEqualsInner(source, target, depth, state) {
    if (source === target)
        return source !== 0 || 1 / source === 1 / target;
    if (depth > STRUCTURAL_KEY_MAX_DEPTH || ++state.nodes > STRUCTURAL_KEY_MAX_NODES)
        return false;
    if (source === null || target === null)
        return false;
    const sourceType = typeof source;
    if (sourceType !== typeof target)
        return false;
    if (sourceType !== 'object')
        return false;
    const sourceIsArray = Array.isArray(source);
    if (sourceIsArray !== Array.isArray(target))
        return false;
    if (sourceIsArray) {
        const length = source.length;
        if (length !== target.length || length > STRUCTURAL_KEY_MAX_ARRAY)
            return false;
        for (let i = 0; i < length; i++) {
            if (!hasOwn.call(source, i) || !hasOwn.call(target, i))
                return false;
            if (!boundedJsonEqualsInner(source[i], target[i], depth + 1, state))
                return false;
        }
        return true;
    }
    if (!isPlainStructuralObject(source) || !isPlainStructuralObject(target))
        return false;
    let count = 0;
    for (const key in source) {
        if (!hasOwn.call(source, key))
            continue;
        if (!hasOwn.call(target, key))
            return false;
        if (++count > STRUCTURAL_KEY_MAX_KEYS)
            return false;
        if (!boundedJsonEqualsInner(source[key], target[key], depth + 1, state))
            return false;
    }
    let targetCount = 0;
    for (const key in target) {
        if (hasOwn.call(target, key))
            targetCount++;
    }
    return count === targetCount;
}
function inferStructuralArrayKey(source, target) {
    const commonLength = source.length < target.length ? source.length : target.length;
    if (commonLength < KEYED_ARRAY_MIN || commonLength > STRUCTURAL_ARRAY_KEY_MAX)
        return null;
    const sampleCount = keySignalSampleCount(commonLength);
    const last = commonLength - 1;
    const readKey = makeStructuralArrayKeyReader();
    let hasReorderSignal = false;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceValue = source[index];
        const targetValue = target[index];
        if (!isStructuralKeyCandidate(sourceValue) || !isStructuralKeyCandidate(targetValue))
            return null;
        const sourceKey = readKey(sourceValue);
        const targetKey = readKey(targetValue);
        if (sourceKey === undefined || targetKey === undefined)
            return null;
        if (sourceKey !== targetKey)
            hasReorderSignal = true;
    }
    return hasReorderSignal ? readKey : null;
}
function keySignalSampleCount(length) {
    if (length <= STRUCTURAL_KEY_SAMPLE_LIMIT)
        return length;
    const sqrtCount = Math.ceil(Math.sqrt(length));
    if (sqrtCount <= STRUCTURAL_KEY_SAMPLE_LIMIT)
        return STRUCTURAL_KEY_SAMPLE_LIMIT;
    return sqrtCount < ARRAY_KEY_SIGNAL_SAMPLE_LIMIT ? sqrtCount : ARRAY_KEY_SIGNAL_SAMPLE_LIMIT;
}
function makeStructuralArrayKeyReader() {
    const cache = new WeakMap();
    const reader = (value) => {
        if (!isStructuralKeyCandidate(value))
            return undefined;
        const cached = cache.get(value);
        if (cached !== undefined)
            return cached;
        const key = structuralArrayKey(value);
        if (key !== undefined)
            cache.set(value, key);
        return key;
    };
    reader.keyKind = 'structural';
    return reader;
}
function isPureMoveKeyReader(readKey) {
    return readKey && (readKey.keyKind === 'composite' ||
        readKey.keyKind === 'structural');
}
function tryPureSingleScalarMoveArrayDiff(source, target, path, patch) {
    const length = source.length;
    if (length < KEYED_ARRAY_MIN || length > PURE_KEYED_MOVE_MAX)
        return false;
    let start = 0;
    while (start < length) {
        const sourceValue = source[start];
        const targetValue = target[start];
        if (!isScalarArrayKeyCandidate(sourceValue) || !isScalarArrayKeyCandidate(targetValue))
            return false;
        if (!sameJsonScalarOrRef(sourceValue, targetValue))
            break;
        start++;
    }
    if (start === length)
        return false;
    let end = length - 1;
    while (end > start) {
        const sourceValue = source[end];
        const targetValue = target[end];
        if (!isScalarArrayKeyCandidate(sourceValue) || !isScalarArrayKeyCandidate(targetValue))
            return false;
        if (!sameJsonScalarOrRef(sourceValue, targetValue))
            break;
        end--;
    }
    if (sameJsonScalarOrRef(source[end], target[start])) {
        for (let sourceIndex = start, targetIndex = start + 1; sourceIndex < end; sourceIndex++, targetIndex++) {
            if (!sameJsonScalarOrRef(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), end, start];
        return true;
    }
    if (sameJsonScalarOrRef(source[start], target[end])) {
        for (let sourceIndex = start + 1, targetIndex = start; sourceIndex <= end; sourceIndex++, targetIndex++) {
            if (!sameJsonScalarOrRef(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), start, end];
        return true;
    }
    return false;
}
function tryPureSingleObjectKeyMoveArrayDiff(source, target, path, patch, key) {
    const length = source.length;
    let start = 0;
    while (start < length) {
        if (sameJsonScalarOrRef(source[start], target[start])) {
            start++;
            continue;
        }
        const keyMatch = sameObjectKey(source[start], target[start], key);
        if (keyMatch === null)
            return false;
        if (!keyMatch)
            break;
        if (!boundedJsonEquals(source[start], target[start]))
            return false;
        start++;
    }
    if (start === length)
        return false;
    let end = length - 1;
    while (end > start) {
        if (sameJsonScalarOrRef(source[end], target[end])) {
            end--;
            continue;
        }
        const keyMatch = sameObjectKey(source[end], target[end], key);
        if (keyMatch === null)
            return false;
        if (!keyMatch)
            break;
        if (!boundedJsonEquals(source[end], target[end]))
            return false;
        end--;
    }
    const endToStartKeyMatch = sameObjectKey(source[end], target[start], key);
    if (endToStartKeyMatch === null)
        return false;
    if (endToStartKeyMatch && boundedJsonEquals(source[end], target[start])) {
        for (let sourceIndex = start, targetIndex = start + 1; sourceIndex < end; sourceIndex++, targetIndex++) {
            const keyMatch = sameObjectKey(source[sourceIndex], target[targetIndex], key);
            if (keyMatch !== true || !boundedJsonEquals(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), end, start];
        return true;
    }
    const startToEndKeyMatch = sameObjectKey(source[start], target[end], key);
    if (startToEndKeyMatch === null)
        return false;
    if (startToEndKeyMatch && boundedJsonEquals(source[start], target[end])) {
        for (let sourceIndex = start + 1, targetIndex = start; sourceIndex <= end; sourceIndex++, targetIndex++) {
            const keyMatch = sameObjectKey(source[sourceIndex], target[targetIndex], key);
            if (keyMatch !== true || !boundedJsonEquals(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), start, end];
        return true;
    }
    return false;
}
function tryPureSingleKeyMoveArrayDiff(source, target, path, patch, readKey) {
    const length = source.length;
    let start = 0;
    while (start < length) {
        if (sameJsonScalarOrRef(source[start], target[start])) {
            start++;
            continue;
        }
        const keyMatch = sameReaderKey(readKey, source[start], target[start]);
        if (keyMatch === null)
            return false;
        if (!keyMatch)
            break;
        if (!boundedJsonEquals(source[start], target[start]))
            return false;
        start++;
    }
    if (start === length)
        return false;
    let end = length - 1;
    while (end > start) {
        if (sameJsonScalarOrRef(source[end], target[end])) {
            end--;
            continue;
        }
        const keyMatch = sameReaderKey(readKey, source[end], target[end]);
        if (keyMatch === null)
            return false;
        if (!keyMatch)
            break;
        if (!boundedJsonEquals(source[end], target[end]))
            return false;
        end--;
    }
    const endToStartKeyMatch = sameReaderKey(readKey, source[end], target[start]);
    if (endToStartKeyMatch === null)
        return false;
    if (endToStartKeyMatch && boundedJsonEquals(source[end], target[start])) {
        for (let sourceIndex = start, targetIndex = start + 1; sourceIndex < end; sourceIndex++, targetIndex++) {
            const keyMatch = sameReaderKey(readKey, source[sourceIndex], target[targetIndex]);
            if (keyMatch !== true || !boundedJsonEquals(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), end, start];
        return true;
    }
    const startToEndKeyMatch = sameReaderKey(readKey, source[start], target[end]);
    if (startToEndKeyMatch === null)
        return false;
    if (startToEndKeyMatch && boundedJsonEquals(source[start], target[end])) {
        for (let sourceIndex = start + 1, targetIndex = start; sourceIndex <= end; sourceIndex++, targetIndex++) {
            const keyMatch = sameReaderKey(readKey, source[sourceIndex], target[targetIndex]);
            if (keyMatch !== true || !boundedJsonEquals(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), start, end];
        return true;
    }
    return false;
}
function tryPureSingleCompositeMoveArrayDiff(source, target, path, patch, key0, key1) {
    const length = source.length;
    if (length < KEYED_ARRAY_MIN)
        return false;
    let start = 0;
    while (start < length) {
        if (sameJsonScalarOrRef(source[start], target[start])) {
            start++;
            continue;
        }
        const keyMatch = sameCompositeObjectKey(source[start], target[start], key0, key1);
        if (keyMatch === null)
            return false;
        if (!keyMatch)
            break;
        if (!boundedJsonEquals(source[start], target[start]))
            return false;
        start++;
    }
    if (start === length)
        return false;
    let end = length - 1;
    while (end > start) {
        if (sameJsonScalarOrRef(source[end], target[end])) {
            end--;
            continue;
        }
        const keyMatch = sameCompositeObjectKey(source[end], target[end], key0, key1);
        if (keyMatch === null)
            return false;
        if (!keyMatch)
            break;
        if (!boundedJsonEquals(source[end], target[end]))
            return false;
        end--;
    }
    const endToStartKeyMatch = sameCompositeObjectKey(source[end], target[start], key0, key1);
    if (endToStartKeyMatch === null)
        return false;
    if (endToStartKeyMatch && boundedJsonEquals(source[end], target[start])) {
        for (let sourceIndex = start, targetIndex = start + 1; sourceIndex < end; sourceIndex++, targetIndex++) {
            const keyMatch = sameCompositeObjectKey(source[sourceIndex], target[targetIndex], key0, key1);
            if (keyMatch !== true || !boundedJsonEquals(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), end, start];
        return true;
    }
    const startToEndKeyMatch = sameCompositeObjectKey(source[start], target[end], key0, key1);
    if (startToEndKeyMatch === null)
        return false;
    if (startToEndKeyMatch && boundedJsonEquals(source[start], target[end])) {
        for (let sourceIndex = start + 1, targetIndex = start; sourceIndex <= end; sourceIndex++, targetIndex++) {
            const keyMatch = sameCompositeObjectKey(source[sourceIndex], target[targetIndex], key0, key1);
            if (keyMatch !== true || !boundedJsonEquals(source[sourceIndex], target[targetIndex]))
                return false;
        }
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), start, end];
        return true;
    }
    return false;
}
function tryLargePureSingleStructuralMoveArrayDiff(source, target, path, patch) {
    const length = source.length;
    let start = 0;
    while (start < length && sameStructuralMoveNode(source[start], target[start])) {
        start++;
    }
    if (start === length)
        return true;
    let end = length - 1;
    while (end > start && sameStructuralMoveNode(source[end], target[end])) {
        end--;
    }
    if (sameStructuralMoveNode(source[end], target[start]) &&
        matchesLargeStructuralMoveEndToStart(source, target, start, end)) {
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), end, start];
        return true;
    }
    if (sameStructuralMoveNode(source[start], target[end]) &&
        matchesLargeStructuralMoveStartToEnd(source, target, start, end)) {
        patch[patch.length] = [OP_ARRAY_MOVE, path.slice(), start, end];
        return true;
    }
    return false;
}
function matchesLargeStructuralMoveEndToStart(source, target, start, end) {
    for (let sourceIndex = start, targetIndex = start + 1; sourceIndex < end; sourceIndex++, targetIndex++) {
        if (!sameStructuralMoveNode(source[sourceIndex], target[targetIndex]))
            return false;
    }
    return true;
}
function matchesLargeStructuralMoveStartToEnd(source, target, start, end) {
    for (let sourceIndex = start + 1, targetIndex = start; sourceIndex <= end; sourceIndex++, targetIndex++) {
        if (!sameStructuralMoveNode(source[sourceIndex], target[targetIndex]))
            return false;
    }
    return true;
}
function sameStructuralMoveNode(source, target) {
    return sameJsonScalarOrRef(source, target) || boundedJsonEquals(source, target);
}
function sameReaderKey(readKey, sourceValue, targetValue) {
    if (readKey.keyKind === 'object') {
        return sameObjectKey(sourceValue, targetValue, readKey.key);
    }
    if (readKey.keyKind === 'composite') {
        return sameCompositeObjectKey(sourceValue, targetValue, readKey.key0, readKey.key1);
    }
    const sourceKey = readKey(sourceValue);
    const targetKey = readKey(targetValue);
    if (!isValidArrayKey(sourceKey) || !isValidArrayKey(targetKey))
        return null;
    return sourceKey === targetKey;
}
function sameObjectKey(sourceValue, targetValue, key) {
    if (!isRecordObject(sourceValue) || !isRecordObject(targetValue))
        return null;
    const sourceKey = sourceValue[key];
    const targetKey = targetValue[key];
    if (!isValidArrayKey(sourceKey) || !isValidArrayKey(targetKey))
        return null;
    return sourceKey === targetKey;
}
function sameCompositeObjectKey(sourceValue, targetValue, key0, key1) {
    if (!isRecordObject(sourceValue) || !isRecordObject(targetValue))
        return null;
    const sourceValue0 = sourceValue[key0];
    const targetValue0 = targetValue[key0];
    if (!isCompositeKeyPart(sourceValue0) || !isCompositeKeyPart(targetValue0))
        return null;
    if (sourceValue0 !== targetValue0)
        return false;
    const sourceValue1 = sourceValue[key1];
    const targetValue1 = targetValue[key1];
    if (!isCompositeKeyPart(sourceValue1) || !isCompositeKeyPart(targetValue1))
        return null;
    return sourceValue1 === targetValue1;
}
function structuralArrayKey(value) {
    const state = { parts: [], chars: 0, nodes: 0, failed: false };
    writeStructuralArrayKey(value, 0, state);
    return state.failed ? undefined : state.parts.join('');
}
function writeStructuralArrayKey(value, depth, state) {
    if (state.failed)
        return;
    if (depth > STRUCTURAL_KEY_MAX_DEPTH || ++state.nodes > STRUCTURAL_KEY_MAX_NODES) {
        state.failed = true;
        return;
    }
    if (value === null) {
        appendStructuralKeyPart(state, 'n;');
        return;
    }
    const type = typeof value;
    if (type === 'string') {
        if (value.length > STRUCTURAL_KEY_MAX_STRING) {
            state.failed = true;
            return;
        }
        appendStructuralKeyPart(state, 's' + value.length + ':' + value + ';');
        return;
    }
    if (type === 'number') {
        appendStructuralKeyPart(state, 'd' + (Object.is(value, -0) ? '-0' : String(value)) + ';');
        return;
    }
    if (type === 'boolean') {
        appendStructuralKeyPart(state, value ? 't;' : 'f;');
        return;
    }
    if (type !== 'object') {
        state.failed = true;
        return;
    }
    if (Array.isArray(value)) {
        const length = value.length;
        if (length > STRUCTURAL_KEY_MAX_ARRAY) {
            state.failed = true;
            return;
        }
        appendStructuralKeyPart(state, '[' + length + '|');
        for (let i = 0; i < length; i++) {
            if (!hasOwn.call(value, i)) {
                state.failed = true;
                return;
            }
            writeStructuralArrayKey(value[i], depth + 1, state);
        }
        appendStructuralKeyPart(state, ']');
        return;
    }
    if (!isPlainStructuralObject(value)) {
        state.failed = true;
        return;
    }
    const keys = Object.keys(value);
    if (keys.length > STRUCTURAL_KEY_MAX_KEYS) {
        state.failed = true;
        return;
    }
    sortStrings(keys);
    appendStructuralKeyPart(state, '{' + keys.length + '|');
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        if (key.length > STRUCTURAL_KEY_MAX_STRING) {
            state.failed = true;
            return;
        }
        appendStructuralKeyPart(state, 'k' + key.length + ':' + key + '=');
        writeStructuralArrayKey(value[key], depth + 1, state);
    }
    appendStructuralKeyPart(state, '}');
}
function appendStructuralKeyPart(state, part) {
    const nextLength = state.chars + part.length;
    if (nextLength > STRUCTURAL_KEY_MAX_CHARS) {
        state.failed = true;
        return;
    }
    state.parts[state.parts.length] = part;
    state.chars = nextLength;
}
function isStructuralKeyCandidate(value) {
    return value !== null && typeof value === 'object';
}
function isPlainStructuralObject(value) {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function sortStrings(values) {
    if (values.length <= 8) {
        for (let i = 1, length = values.length; i < length; i++) {
            const value = values[i];
            let j = i - 1;
            while (j >= 0 && values[j] > value) {
                values[j + 1] = values[j];
                j--;
            }
            values[j + 1] = value;
        }
        return values;
    }
    return values.sort();
}
function readUniqueArrayKeys(array, readKey) {
    const length = array.length;
    const keys = new Array(length);
    const index = new Map();
    for (let i = 0; i < length; i++) {
        const key = readKey(array[i], i, array);
        if (!isValidArrayKey(key) || index.get(key) !== undefined)
            return null;
        keys[i] = key;
        index.set(key, i);
    }
    return { keys, index };
}
function readUniqueObjectArrayKeys(array, key) {
    const length = array.length;
    const keys = new Array(length);
    const index = new Map();
    for (let i = 0; i < length; i++) {
        const item = array[i];
        if (!isRecordObject(item))
            return null;
        const value = item[key];
        if (!isValidArrayKey(value) || index.get(value) !== undefined)
            return null;
        keys[i] = value;
        index.set(value, i);
    }
    return { keys, index };
}
function isValidArrayKey(value) {
    if (typeof value === 'string')
        return value.length !== 0;
    return (typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        !Object.is(value, -0));
}
function markLongestIncreasingSubsequence(values) {
    const length = values.length;
    const keep = new Array(length).fill(false);
    if (length === 0)
        return keep;
    const tails = [];
    const tailsIndexes = [];
    const previousIndexes = new Array(length);
    for (let i = 0; i < length; i++) {
        const value = values[i];
        let low = 0;
        let high = tails.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (tails[mid] < value)
                low = mid + 1;
            else
                high = mid;
        }
        const size = tails.length;
        previousIndexes[i] = low > 0 ? tailsIndexes[low - 1] : -1;
        tails[low] = value;
        tailsIndexes[low] = i;
        if (low === size)
            tails.length++;
    }
    let index = tailsIndexes[tails.length - 1];
    while (index >= 0) {
        keep[index] = true;
        index = previousIndexes[index];
    }
    return keep;
}
function indexOfKey(keys, key, start) {
    for (let i = start, length = keys.length; i < length; i++) {
        if (keys[i] === key)
            return i;
    }
    return -1;
}
function moveArrayItem(array, from, to) {
    const value = array[from];
    array.splice(from, 1);
    array.splice(to, 0, value);
}
function insertArrayItems(array, index, values) {
    const count = values.length;
    if (count === 0)
        return;
    const oldLength = array.length;
    array.length = oldLength + count;
    for (let i = oldLength - 1; i >= index; i--) {
        array[i + count] = array[i];
    }
    for (let i = 0; i < count; i++) {
        array[index + i] = values[i];
    }
}
function sameKeyOrder(left, right) {
    if (left.length !== right.length)
        return false;
    for (let i = 0, length = left.length; i < length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}
function tryLargePrimitiveShiftedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const commonLength = sourceLength < targetLength ? sourceLength : targetLength;
    const delta = targetLength - sourceLength;
    const absDelta = delta < 0 ? -delta : delta;
    if (absDelta > LARGE_PRIMITIVE_ARRAY_SHIFT_LIMIT)
        return false;
    let index = 0;
    while (index < commonLength && sameJsonScalarOrRef(source[index], target[index])) {
        index++;
    }
    if (index === commonLength)
        return false;
    if (delta > 0) {
        const shiftedLength = sourceLength - index;
        if (shiftedLength < LARGE_PRIMITIVE_ARRAY_SHIFT_MIN_TAIL ||
            !hasShiftedPrimitiveSignal(source, target, index, index + delta, shiftedLength)) {
            return false;
        }
    }
    else {
        const deleteCount = -delta;
        const shiftedLength = targetLength - index;
        if (shiftedLength < LARGE_PRIMITIVE_ARRAY_SHIFT_MIN_TAIL ||
            !hasShiftedPrimitiveSignal(source, target, index + deleteCount, index, shiftedLength)) {
            return false;
        }
    }
    return emitShiftedArrayDiffFromIndex(source, target, path, patch, keyCompare, getVersion, arrayKey, index);
}
function tryLargeShiftedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const commonLength = sourceLength < targetLength ? sourceLength : targetLength;
    const delta = targetLength - sourceLength;
    const absDelta = delta < 0 ? -delta : delta;
    if (absDelta > LARGE_SHIFTED_ARRAY_LIMIT)
        return false;
    let index = 0;
    while (index < commonLength && sameShiftProbe(source[index], target[index])) {
        index++;
    }
    if (index === commonLength)
        return false;
    if (delta > 0) {
        const shiftedLength = sourceLength - index;
        if (shiftedLength < LARGE_SHIFTED_ARRAY_MIN_TAIL ||
            !hasShiftedSignal(source, target, index, index + delta, shiftedLength)) {
            return false;
        }
    }
    else {
        const deleteCount = -delta;
        const shiftedLength = targetLength - index;
        if (shiftedLength < LARGE_SHIFTED_ARRAY_MIN_TAIL ||
            !hasShiftedSignal(source, target, index + deleteCount, index, shiftedLength)) {
            return false;
        }
    }
    return emitShiftedArrayDiffFromIndex(source, target, path, patch, keyCompare, getVersion, arrayKey, index);
}
function hasShiftedPrimitiveSignal(source, target, sourceStart, targetStart, length) {
    const last = length - 1;
    const third = length / 3 | 0;
    const twoThirds = (length * 2) / 3 | 0;
    return (shiftedPrimitiveProbe(source, target, sourceStart, targetStart, 0) &&
        shiftedPrimitiveProbe(source, target, sourceStart, targetStart, third) &&
        shiftedPrimitiveProbe(source, target, sourceStart, targetStart, twoThirds) &&
        shiftedPrimitiveProbe(source, target, sourceStart, targetStart, last));
}
function shiftedPrimitiveProbe(source, target, sourceStart, targetStart, offset) {
    const sourceValue = source[sourceStart + offset];
    const targetValue = target[targetStart + offset];
    return (isJsonScalarForReplaceRun(sourceValue) &&
        isJsonScalarForReplaceRun(targetValue) &&
        sameJsonScalarOrRef(sourceValue, targetValue));
}
function hasShiftedSignal(source, target, sourceStart, targetStart, length) {
    const last = length - 1;
    const third = length / 3 | 0;
    const twoThirds = (length * 2) / 3 | 0;
    return (sameShiftProbe(source[sourceStart], target[targetStart]) &&
        sameShiftProbe(source[sourceStart + third], target[targetStart + third]) &&
        sameShiftProbe(source[sourceStart + twoThirds], target[targetStart + twoThirds]) &&
        sameShiftProbe(source[sourceStart + last], target[targetStart + last]));
}
function tryShiftedArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const commonLength = sourceLength < targetLength ? sourceLength : targetLength;
    let index = 0;
    while (index < commonLength && sameShiftProbe(source[index], target[index])) {
        index++;
    }
    if (index === commonLength)
        return false;
    return emitShiftedArrayDiffFromIndex(source, target, path, patch, keyCompare, getVersion, arrayKey, index);
}
function emitShiftedArrayDiffFromIndex(source, target, path, patch, keyCompare, getVersion, arrayKey, index) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const delta = targetLength - sourceLength;
    const depth = path.length;
    if (delta > 0) {
        if (!sameShiftProbe(source[index], target[index + delta]))
            return false;
        const values = new Array(delta);
        for (let i = 0; i < delta; i++)
            values[i] = target[index + i];
        emitArrayInsert(patch, path, index, values);
        for (let sourceIndex = index, targetIndex = index + delta; sourceIndex < sourceLength; sourceIndex++, targetIndex++) {
            const sourceValue = source[sourceIndex];
            const targetValue = target[targetIndex];
            if (sameShiftProbe(sourceValue, targetValue))
                continue;
            path[depth] = targetIndex;
            walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
            path.length = depth;
        }
        return true;
    }
    const deleteCount = -delta;
    if (!sameShiftProbe(source[index + deleteCount], target[index]))
        return false;
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), index, deleteCount, []];
    for (let sourceIndex = index + deleteCount, targetIndex = index; sourceIndex < sourceLength; sourceIndex++, targetIndex++) {
        const sourceValue = source[sourceIndex];
        const targetValue = target[targetIndex];
        if (sameShiftProbe(sourceValue, targetValue))
            continue;
        path[depth] = targetIndex;
        walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        path.length = depth;
    }
    return true;
}
function tryTailArraySpliceDiff(source, target, path, patch) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const commonLength = sourceLength < targetLength ? sourceLength : targetLength;
    let start = 0;
    while (start < commonLength && sameShiftProbe(source[start], target[start])) {
        start++;
    }
    if (sourceLength > 4 || start !== sourceLength - 1)
        return false;
    if (start === commonLength) {
        if (targetLength > sourceLength) {
            emitAppend(patch, path, sourceLength, targetLength, target);
            return true;
        }
        if (targetLength < sourceLength) {
            patch[patch.length] = [OP_TRUNCATE, path.slice(), targetLength];
            return true;
        }
        return false;
    }
    let sourceEnd = sourceLength;
    let targetEnd = targetLength;
    while (sourceEnd > start &&
        targetEnd > start &&
        sameShiftProbe(source[sourceEnd - 1], target[targetEnd - 1])) {
        sourceEnd--;
        targetEnd--;
    }
    const deleteCount = sourceEnd - start;
    const insertCount = targetEnd - start;
    if (deleteCount + insertCount > SCALAR_REPLACE_RUN_LIMIT)
        return false;
    const values = new Array(insertCount);
    for (let i = 0; i < insertCount; i++)
        values[i] = target[start + i];
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), start, deleteCount, values];
    return true;
}
function tryBalancedRecordShiftDiff(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const length = source.length;
    if (length < 64 || length > 2048)
        return false;
    let insertIndex = -1;
    for (let i = 0, last = length - 1; i < last; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        const shiftedTarget = target[i + 1];
        if (sourceValue !== null &&
            shiftedTarget !== null &&
            typeof sourceValue === 'object' &&
            typeof shiftedTarget === 'object' &&
            sameShiftProbe(sourceValue, shiftedTarget)) {
            insertIndex = i;
            break;
        }
    }
    if (insertIndex < 0)
        return false;
    let sourceIndex = insertIndex;
    let targetIndex = insertIndex + 1;
    while (sourceIndex < length - 1 &&
        targetIndex < length &&
        sameShiftProbe(source[sourceIndex], target[targetIndex])) {
        sourceIndex++;
        targetIndex++;
    }
    const deleteIndex = sourceIndex;
    if (deleteIndex - insertIndex < 8)
        return false;
    if (deleteIndex >= length - 1 || targetIndex >= length)
        return false;
    if (!sameShiftProbe(source[deleteIndex + 1], target[targetIndex]))
        return false;
    diffAlignedArrayRange(source, target, 0, insertIndex, path, patch, keyCompare, getVersion, arrayKey);
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), insertIndex, 0, [target[insertIndex]]];
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), deleteIndex + 1, 1, []];
    diffAlignedArrayRange(source, target, deleteIndex + 1, length, path, patch, keyCompare, getVersion, arrayKey);
    return true;
}
function diffAlignedArrayRange(source, target, start, end, path, patch, keyCompare, getVersion, arrayKey) {
    const depth = path.length;
    for (let i = start; i < end; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
        }
        if (getVersion !== null &&
            sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
            continue;
        }
        path[depth] = i;
        walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        path.length = depth;
    }
}
function sameJsonScalarOrRef(source, target) {
    return source === target && (source !== 0 || 1 / source === 1 / target);
}
function tryScalarReplaceRunDiff(source, target, path, patch) {
    const length = source.length;
    if (length < 4)
        return false;
    let start = 0;
    while (start < length && sameJsonScalarOrRef(source[start], target[start])) {
        start++;
    }
    if (start === length)
        return true;
    let end = length - 1;
    while (end > start && sameJsonScalarOrRef(source[end], target[end])) {
        end--;
    }
    const count = end - start + 1;
    if (count < 4 || count > SCALAR_REPLACE_RUN_LIMIT)
        return false;
    const values = new Array(count);
    for (let i = 0; i < count; i++) {
        const sourceValue = source[start + i];
        const targetValue = target[start + i];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            return false;
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
            return false;
        }
        values[i] = targetValue;
    }
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), start, count, values];
    return true;
}
function tryLargeScalarArrayRunSpliceDiff(source, target, path, patch) {
    const length = source.length;
    if (length < LARGE_SCALAR_RUN_ARRAY_MIN_LENGTH ||
        !arrayLooksScalarAssignable(source, target, length)) {
        return false;
    }
    let runStarts = null;
    let runLengths = null;
    let runCount = 0;
    let count = 0;
    let previous = -2;
    for (let i = 0; i < length; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
            return false;
        }
        if (runStarts === null) {
            runStarts = [];
            runLengths = [];
        }
        if (i !== previous + 1) {
            runStarts[runCount] = i;
            runLengths[runCount] = 1;
            runCount++;
        }
        else {
            runLengths[runCount - 1]++;
        }
        count++;
        previous = i;
    }
    if (count === 0)
        return true;
    if (!shouldEmitScalarArrayRunSplices(count, runCount, path.length))
        return false;
    emitScalarArrayRunSplicesFromTarget(patch, path, target, runStarts, runLengths);
    return true;
}
function tryScalarArrayAssignDiff(source, target, path, patch) {
    const length = source.length;
    if (length < ARRAY_ASSIGN_MIN_LENGTH || !arrayLooksScalarAssignable(source, target, length)) {
        return false;
    }
    let indexes = null;
    let values = null;
    let runStarts = null;
    let runLengths = null;
    let runCount = 0;
    let count = 0;
    let first = -1;
    let previous = -2;
    let contiguous = true;
    for (let i = 0; i < length; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
            return false;
        }
        if (indexes === null) {
            indexes = [];
            values = [];
            runStarts = [];
            runLengths = [];
            first = i;
        }
        if (i !== previous + 1) {
            contiguous = count === 0;
            runStarts[runCount] = i;
            runLengths[runCount] = 1;
            runCount++;
        }
        else {
            runLengths[runCount - 1]++;
        }
        indexes[count] = i;
        values[count] = targetValue;
        count++;
        previous = i;
    }
    if (count === 0)
        return true;
    if (contiguous && count >= 4 && count <= SCALAR_REPLACE_RUN_LIMIT) {
        patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), first, count, values];
        return true;
    }
    if (shouldEmitScalarArrayRunSplices(count, runCount, path.length)) {
        emitScalarArrayRunSplices(patch, path, runStarts, runLengths, values);
        return true;
    }
    if (count >= ARRAY_ASSIGN_MIN) {
        patch[patch.length] = [OP_ARRAY_ASSIGN, path.slice(), indexes, values];
        return true;
    }
    const depth = path.length;
    for (let i = 0; i < count; i++) {
        path[depth] = indexes[i];
        emitSet(patch, path, values[i]);
    }
    path.length = depth;
    return true;
}
function shouldEmitScalarArrayRunSplices(count, runCount, pathDepth) {
    return (runCount >= ARRAY_RUN_SPLICE_MIN_RUNS &&
        runCount <= ARRAY_RUN_SPLICE_MAX_RUNS &&
        count >= runCount * (ARRAY_RUN_SPLICE_MIN_AVG + pathDepth));
}
function emitScalarArrayRunSplices(patch, path, runStarts, runLengths, values) {
    let offset = 0;
    for (let run = 0, runCount = runStarts.length; run < runCount; run++) {
        const length = runLengths[run];
        const runValues = new Array(length);
        for (let i = 0; i < length; i++) {
            runValues[i] = values[offset + i];
        }
        patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), runStarts[run], length, runValues];
        offset += length;
    }
}
function emitScalarArrayRunSplicesFromTarget(patch, path, target, runStarts, runLengths) {
    for (let run = 0, runCount = runStarts.length; run < runCount; run++) {
        const start = runStarts[run];
        const length = runLengths[run];
        const runValues = new Array(length);
        for (let i = 0; i < length; i++) {
            runValues[i] = target[start + i];
        }
        patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), start, length, runValues];
    }
}
function arrayLooksScalarAssignable(source, target, length) {
    const sampleCount = length < 8 ? length : 8;
    const last = length - 1;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        if (!hasOwn.call(source, index) ||
            !hasOwn.call(target, index) ||
            !isJsonScalarForReplaceRun(source[index]) ||
            !isJsonScalarForReplaceRun(target[index])) {
            return false;
        }
    }
    return true;
}
function tryTupleArrayAssignDiff(source, target, path, patch) {
    const length = source.length;
    if (length < ARRAY_TUPLE_ASSIGN_MIN_LENGTH)
        return false;
    const width = readTupleArrayWidth(source, target, length);
    if (width === 0)
        return false;
    if (tryFullTupleRowArrayAssignDiff(source, target, path, patch, width))
        return true;
    let rowIndexes = null;
    let fieldIndexes = null;
    let values = null;
    let count = 0;
    let changedRows = 0;
    let fullChangedRows = 0;
    let previousChangedRow = -2;
    let contiguousChangedRows = true;
    for (let i = 0; i < length; i++) {
        const sourceRow = source[i];
        const targetRow = target[i];
        if (sourceRow === targetRow)
            continue;
        if (sameFixedScalarTupleRow(sourceRow, targetRow, width))
            continue;
        if (!isFixedScalarTupleRow(sourceRow, width) || !isFixedScalarTupleRow(targetRow, width)) {
            return false;
        }
        let rowChangeCount = 0;
        for (let field = 0; field < width; field++) {
            const sourceValue = sourceRow[field];
            const targetValue = targetRow[field];
            if (sameJsonScalarOrRef(sourceValue, targetValue))
                continue;
            if (rowIndexes === null) {
                rowIndexes = [];
                fieldIndexes = [];
                values = [];
            }
            rowIndexes[count] = i;
            fieldIndexes[count] = field;
            values[count] = targetValue;
            count++;
            rowChangeCount++;
        }
        if (rowChangeCount > 0) {
            if (i !== previousChangedRow + 1)
                contiguousChangedRows = changedRows === 0;
            changedRows++;
            if (rowChangeCount === width)
                fullChangedRows++;
            previousChangedRow = i;
        }
    }
    if (count === 0)
        return true;
    if (changedRows === fullChangedRows &&
        contiguousChangedRows &&
        changedRows >= 4 &&
        changedRows <= SCALAR_REPLACE_RUN_LIMIT) {
        const assignIndexes = new Array(changedRows);
        const assignValues = new Array(changedRows);
        for (let rowOffset = 0; rowOffset < changedRows; rowOffset++) {
            const rowIndex = rowIndexes[rowOffset * width];
            assignIndexes[rowOffset] = rowIndex;
            assignValues[rowOffset] = target[rowIndex];
        }
        patch[patch.length] = [OP_ARRAY_ASSIGN, path.slice(), assignIndexes, assignValues];
        return true;
    }
    if (count >= ARRAY_TUPLE_ASSIGN_MIN) {
        patch[patch.length] = [OP_ARRAY_TUPLE_ASSIGN, path.slice(), rowIndexes, fieldIndexes, values];
        return true;
    }
    const depth = path.length;
    for (let i = 0; i < count; i++) {
        path[depth] = rowIndexes[i];
        path[depth + 1] = fieldIndexes[i];
        emitSet(patch, path, values[i]);
    }
    path.length = depth;
    return true;
}
function tryFullTupleRowArrayAssignDiff(source, target, path, patch, width) {
    let values = null;
    let changedRows = 0;
    let firstChangedRow = -1;
    let previousChangedRow = -2;
    for (let i = 0, length = source.length; i < length; i++) {
        const sourceRow = source[i];
        const targetRow = target[i];
        if (!isFixedScalarTupleRow(sourceRow, width) || !isFixedScalarTupleRow(targetRow, width))
            return false;
        let changed = 0;
        for (let field = 0; field < width; field++) {
            if (!sameJsonScalarOrRef(sourceRow[field], targetRow[field]))
                changed++;
        }
        if (changed === 0)
            continue;
        if (changed !== width)
            return false;
        if (values === null) {
            values = [];
            firstChangedRow = i;
        }
        else if (i !== previousChangedRow + 1) {
            return false;
        }
        values[values.length] = targetRow;
        changedRows++;
        previousChangedRow = i;
    }
    if (values === null)
        return true;
    if (changedRows < 4 || changedRows > SCALAR_REPLACE_RUN_LIMIT)
        return false;
    patch[patch.length] = [OP_ARRAY_SPLICE, path.slice(), firstChangedRow, changedRows, values];
    return true;
}
function tryRecordArrayNestedScalarFieldDiff(source, target, path, patch, commonLength) {
    const nestedScalarField = readSampledRecordRowNestedScalarField(source, target, commonLength);
    const minChangedRows = commonLength < 512 ? 1 : DIRTY_ARRAY_ROW_GROUP_MIN;
    return nestedScalarField !== null &&
        tryRecordArraySingleNestedFieldAssignDiff(source, target, path, patch, nestedScalarField, minChangedRows);
}
function tryRecordArrayFieldAssignDiff(source, target, path, patch) {
    const length = source.length;
    const indexes = [];
    const changedKeys = [];
    const fieldNames = [];
    let fieldSeen = null;
    for (let i = 0; i < length; i++) {
        const sourceRow = source[i];
        const targetRow = target[i];
        if (sourceRow === targetRow)
            continue;
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow))
            return false;
        const changedCount = collectChangedDirectScalarKeys(sourceRow, targetRow, changedKeys);
        if (changedCount === 0)
            continue;
        if (changedCount < 0 || changedCount > 16)
            return false;
        if (fieldSeen === null)
            fieldSeen = Object.create(null);
        for (let fieldIndex = 0; fieldIndex < changedCount; fieldIndex++) {
            const key = changedKeys[fieldIndex];
            if (fieldSeen[key] !== true) {
                fieldSeen[key] = true;
                fieldNames[fieldNames.length] = key;
                if (fieldNames.length > 16)
                    return false;
            }
        }
        indexes[indexes.length] = i;
    }
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    const fieldCount = fieldNames.length;
    if (fieldCount === 0)
        return false;
    const fields = new Array(fieldCount);
    for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
        fields[fieldIndex] = [fieldNames[fieldIndex]];
    }
    const values = [];
    for (let rowOffset = 0, rowCount = indexes.length; rowOffset < rowCount; rowOffset++) {
        const row = target[indexes[rowOffset]];
        for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
            const value = row[fieldNames[fieldIndex]];
            if (!hasOwn.call(row, fieldNames[fieldIndex]) || !isJsonScalarForReplaceRun(value))
                return false;
            values[values.length] = value;
        }
    }
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, fields, values];
    return true;
}
function tryRecordArrayNestedFieldAssignDiff(source, target, path, patch) {
    const length = source.length;
    const indexes = [];
    const changedFields = [];
    const fields = [];
    let fieldSeen = null;
    for (let i = 0; i < length; i++) {
        const sourceRow = source[i];
        const targetRow = target[i];
        if (sourceRow === targetRow)
            continue;
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow))
            return false;
        const changedCount = collectChangedDirectOrNestedScalarFields(sourceRow, targetRow, changedFields);
        if (changedCount === 0)
            continue;
        if (changedCount < 0 || changedCount > 16)
            return false;
        if (fieldSeen === null)
            fieldSeen = Object.create(null);
        for (let fieldIndex = 0; fieldIndex < changedCount; fieldIndex++) {
            const field = changedFields[fieldIndex];
            const key = field.length === 1
                ? 'd:' + String(field[0])
                : 'n:' + String(field[0]) + '\u0000' + String(field[1]);
            if (fieldSeen[key] !== true) {
                fieldSeen[key] = true;
                fields[fields.length] = field.slice();
                if (fields.length > 16)
                    return false;
            }
        }
        indexes[indexes.length] = i;
    }
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN || fields.length === 0)
        return false;
    const values = [];
    for (let rowOffset = 0, rowCount = indexes.length; rowOffset < rowCount; rowOffset++) {
        const row = target[indexes[rowOffset]];
        for (let fieldIndex = 0, fieldCount = fields.length; fieldIndex < fieldCount; fieldIndex++) {
            const field = fields[fieldIndex];
            let value;
            if (field.length === 1) {
                value = row[field[0]];
                if (!hasOwn.call(row, field[0]))
                    return false;
            }
            else {
                const parent = row[field[0]];
                if (parent === null || typeof parent !== 'object' || !hasOwn.call(parent, field[1]))
                    return false;
                value = parent[field[1]];
            }
            if (!isJsonScalarForReplaceRun(value))
                return false;
            values[values.length] = value;
        }
    }
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, fields, values];
    return true;
}
function tryRecordArraySingleNestedFieldAssignDiff(source, target, path, patch, field, minChangedRows) {
    const length = source.length;
    const topKey = field[0];
    const childKey = field[1];
    const plan = readSingleNestedScalarFieldRowPlan(source[0], field);
    if (plan === null)
        return false;
    if (plan.fastKind === 1) {
        return tryRecordArraySingleNestedFieldAssignDiffFast1(source, target, path, patch, field, plan, minChangedRows);
    }
    const indexes = [];
    const values = [];
    for (let i = 0; i < length; i++) {
        const sourceRow = source[i];
        const targetRow = target[i];
        if (sourceRow === targetRow)
            continue;
        if (plan.fastKind !== 1 && (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow)))
            return false;
        const rowState = compareRecordRowWithSingleNestedFieldPlan(sourceRow, targetRow, plan);
        if (rowState < 0)
            return false;
        if (rowState > 0) {
            const parent = targetRow[topKey];
            indexes[indexes.length] = i;
            values[values.length] = parent[childKey];
        }
    }
    if (indexes.length === 0)
        return true;
    if (indexes.length < minChangedRows)
        return false;
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, [field.slice()], values];
    return true;
}
function tryRecordArraySingleNestedFieldAssignDiffFast1(source, target, path, patch, field, plan, minChangedRows) {
    const topKey = field[0];
    const childKey = field[1];
    const topScalarKey = plan.topScalarKeys[0];
    const arrayKey = plan.topArrayKeys[0].key;
    const parentScalarKey = plan.parentScalarKeys[0];
    const group = plan.parentObjectGroups[0];
    const groupKey = group.key;
    const groupKey0 = group.keys[0];
    const groupKey1 = group.keys[1];
    const indexes = [];
    const values = [];
    for (let i = 0, length = source.length; i < length; i++) {
        const sourceRow = source[i];
        const targetRow = target[i];
        if (sourceRow === targetRow)
            continue;
        if (!hasExactOwnKeys3(sourceRow, topScalarKey, arrayKey, topKey) ||
            !hasExactOwnKeys3(targetRow, topScalarKey, arrayKey, topKey) ||
            sourceRow[topScalarKey] !== targetRow[topScalarKey]) {
            return false;
        }
        const sourceArray = sourceRow[arrayKey];
        const targetArray = targetRow[arrayKey];
        if (!Array.isArray(sourceArray) ||
            !Array.isArray(targetArray) ||
            sourceArray.length !== 2 ||
            targetArray.length !== 2 ||
            sourceArray[0] === undefined ||
            sourceArray[1] === undefined ||
            targetArray[0] === undefined ||
            targetArray[1] === undefined ||
            sourceArray[0] !== targetArray[0] ||
            sourceArray[1] !== targetArray[1]) {
            return false;
        }
        const sourceParent = sourceRow[topKey];
        const targetParent = targetRow[topKey];
        if (!hasExactOwnKeys3(sourceParent, childKey, parentScalarKey, groupKey) ||
            !hasExactOwnKeys3(targetParent, childKey, parentScalarKey, groupKey) ||
            sourceParent[parentScalarKey] !== targetParent[parentScalarKey]) {
            return false;
        }
        const sourceObject = sourceParent[groupKey];
        const targetObject = targetParent[groupKey];
        if (!hasExactOwnKeys2(sourceObject, groupKey0, groupKey1) ||
            !hasExactOwnKeys2(targetObject, groupKey0, groupKey1) ||
            sourceObject[groupKey0] !== targetObject[groupKey0] ||
            sourceObject[groupKey1] !== targetObject[groupKey1]) {
            return false;
        }
        const sourceValue = sourceParent[childKey];
        const targetValue = targetParent[childKey];
        if (sourceValue === targetValue)
            continue;
        if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue))
            return false;
        indexes[indexes.length] = i;
        values[values.length] = targetValue;
    }
    if (indexes.length === 0)
        return true;
    if (indexes.length < minChangedRows)
        return false;
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, [field.slice()], values];
    return true;
}
function readSingleNestedScalarFieldRowPlan(row, field) {
    if (!isPlainStructuralObject(row))
        return null;
    const topKey = field[0];
    const childKey = field[1];
    const topScalarKeys = [];
    const topArrayKeys = [];
    const parentScalarKeys = [];
    const parentObjectGroups = [];
    let topCount = 0;
    let parentCount = 0;
    let sawTop = false;
    let sawChild = false;
    for (const key in row) {
        if (!hasOwn.call(row, key))
            continue;
        topCount++;
        const value = row[key];
        if (key === topKey) {
            if (!isPlainStructuralObject(value))
                return null;
            sawTop = true;
            for (const child in value) {
                if (!hasOwn.call(value, child))
                    continue;
                parentCount++;
                const childValue = value[child];
                if (child === childKey) {
                    if (!isJsonScalarForReplaceRun(childValue))
                        return null;
                    sawChild = true;
                }
                else if (isJsonScalarForReplaceRun(childValue)) {
                    parentScalarKeys[parentScalarKeys.length] = child;
                }
                else if (isPlainStructuralObject(childValue)) {
                    const group = readScalarObjectGroup(child, childValue);
                    if (group === null)
                        return null;
                    parentObjectGroups[parentObjectGroups.length] = group;
                }
                else {
                    return null;
                }
            }
            continue;
        }
        if (isJsonScalarForReplaceRun(value)) {
            topScalarKeys[topScalarKeys.length] = key;
        }
        else if (Array.isArray(value)) {
            const arrayPlan = readScalarArrayFieldPlan(key, value);
            if (arrayPlan === null)
                return null;
            topArrayKeys[topArrayKeys.length] = arrayPlan;
        }
        else {
            return null;
        }
    }
    if (!sawTop || !sawChild)
        return null;
    const plan = {
        topKey,
        childKey,
        topCount,
        parentCount,
        topScalarKeys,
        topArrayKeys,
        parentScalarKeys,
        parentObjectGroups,
        fastKind: 0
    };
    if (topCount === 3 &&
        parentCount === 3 &&
        topScalarKeys.length === 1 &&
        topArrayKeys.length === 1 &&
        topArrayKeys[0].length === 2 &&
        parentScalarKeys.length === 1 &&
        parentObjectGroups.length === 1 &&
        parentObjectGroups[0].count === 2 &&
        parentObjectGroups[0].keys.length === 2) {
        plan.fastKind = 1;
    }
    return plan;
}
function readScalarObjectGroup(key, object) {
    const keys = [];
    let count = 0;
    for (const childKey in object) {
        if (!hasOwn.call(object, childKey))
            continue;
        const value = object[childKey];
        if (!isJsonScalarForReplaceRun(value))
            return null;
        keys[keys.length] = childKey;
        count++;
    }
    return count === 0 ? null : { key, count, keys };
}
function readScalarArrayFieldPlan(key, array) {
    const length = array.length;
    if (length < 1 || length > 8)
        return null;
    for (let i = 0; i < length; i++) {
        if (!hasOwn.call(array, i) || !isJsonScalarForReplaceRun(array[i]))
            return null;
    }
    return { key, length };
}
function compareRecordRowWithSingleNestedFieldPlan(sourceRow, targetRow, plan) {
    if (plan.fastKind === 1) {
        return compareRecordRowWithSingleNestedFieldPlanFast1(sourceRow, targetRow, plan);
    }
    if (countOwnKeysUntil(sourceRow, plan.topCount + 1) !== plan.topCount ||
        countOwnKeysUntil(targetRow, plan.topCount + 1) !== plan.topCount) {
        return -1;
    }
    const topScalarKeys = plan.topScalarKeys;
    for (let i = 0, length = topScalarKeys.length; i < length; i++) {
        const key = topScalarKeys[i];
        if (!hasOwn.call(sourceRow, key) ||
            !hasOwn.call(targetRow, key) ||
            !sameJsonScalarOrRef(sourceRow[key], targetRow[key])) {
            return -1;
        }
    }
    const topArrayKeys = plan.topArrayKeys;
    for (let i = 0, length = topArrayKeys.length; i < length; i++) {
        const arrayPlan = topArrayKeys[i];
        if (!sameScalarArrayField(sourceRow[arrayPlan.key], targetRow[arrayPlan.key], arrayPlan.length)) {
            return -1;
        }
    }
    const sourceParent = sourceRow[plan.topKey];
    const targetParent = targetRow[plan.topKey];
    if (!isPlainStructuralObject(sourceParent) ||
        !isPlainStructuralObject(targetParent) ||
        countOwnKeysUntil(sourceParent, plan.parentCount + 1) !== plan.parentCount ||
        countOwnKeysUntil(targetParent, plan.parentCount + 1) !== plan.parentCount) {
        return -1;
    }
    const parentScalarKeys = plan.parentScalarKeys;
    for (let i = 0, length = parentScalarKeys.length; i < length; i++) {
        const key = parentScalarKeys[i];
        if (!hasOwn.call(sourceParent, key) ||
            !hasOwn.call(targetParent, key) ||
            !sameJsonScalarOrRef(sourceParent[key], targetParent[key])) {
            return -1;
        }
    }
    const parentObjectGroups = plan.parentObjectGroups;
    for (let i = 0, length = parentObjectGroups.length; i < length; i++) {
        if (!sameScalarObjectGroup(sourceParent, targetParent, parentObjectGroups[i]))
            return -1;
    }
    const sourceValue = sourceParent[plan.childKey];
    const targetValue = targetParent[plan.childKey];
    if (!hasOwn.call(sourceParent, plan.childKey) || !hasOwn.call(targetParent, plan.childKey))
        return -1;
    if (sameJsonScalarOrRef(sourceValue, targetValue))
        return 0;
    return isJsonScalarForReplaceRun(sourceValue) && isJsonScalarForReplaceRun(targetValue) ? 1 : -1;
}
function compareRecordRowWithSingleNestedFieldPlanFast1(sourceRow, targetRow, plan) {
    const topScalarKey = plan.topScalarKeys[0];
    const arrayKey = plan.topArrayKeys[0].key;
    if (!hasExactOwnKeys3(sourceRow, topScalarKey, arrayKey, plan.topKey) ||
        !hasExactOwnKeys3(targetRow, topScalarKey, arrayKey, plan.topKey)) {
        return -1;
    }
    if (sourceRow[topScalarKey] !== targetRow[topScalarKey]) {
        return -1;
    }
    const sourceArray = sourceRow[arrayKey];
    const targetArray = targetRow[arrayKey];
    if (!Array.isArray(sourceArray) ||
        !Array.isArray(targetArray) ||
        sourceArray.length !== 2 ||
        targetArray.length !== 2 ||
        sourceArray[0] === undefined ||
        sourceArray[1] === undefined ||
        targetArray[0] === undefined ||
        targetArray[1] === undefined ||
        sourceArray[0] !== targetArray[0] ||
        sourceArray[1] !== targetArray[1]) {
        return -1;
    }
    const sourceParent = sourceRow[plan.topKey];
    const targetParent = targetRow[plan.topKey];
    const parentScalarKey = plan.parentScalarKeys[0];
    const group = plan.parentObjectGroups[0];
    if (!hasExactOwnKeys3(sourceParent, plan.childKey, parentScalarKey, group.key) ||
        !hasExactOwnKeys3(targetParent, plan.childKey, parentScalarKey, group.key)) {
        return -1;
    }
    if (sourceParent[parentScalarKey] !== targetParent[parentScalarKey]) {
        return -1;
    }
    const sourceObject = sourceParent[group.key];
    const targetObject = targetParent[group.key];
    const groupKey0 = group.keys[0];
    const groupKey1 = group.keys[1];
    if (!hasExactOwnKeys2(sourceObject, groupKey0, groupKey1) ||
        !hasExactOwnKeys2(targetObject, groupKey0, groupKey1)) {
        return -1;
    }
    if (sourceObject[groupKey0] !== targetObject[groupKey0] ||
        sourceObject[groupKey1] !== targetObject[groupKey1]) {
        return -1;
    }
    const sourceValue = sourceParent[plan.childKey];
    const targetValue = targetParent[plan.childKey];
    if (sourceValue === targetValue)
        return 0;
    return isJsonScalarForReplaceRun(sourceValue) && isJsonScalarForReplaceRun(targetValue) ? 1 : -1;
}
function hasExactOwnKeys3(object, key0, key1, key2) {
    if (object === null || typeof object !== 'object' || Array.isArray(object))
        return false;
    let count = 0;
    for (const key in object) {
        if (!hasOwn.call(object, key))
            continue;
        if (key !== key0 && key !== key1 && key !== key2)
            return false;
        count++;
    }
    return count === 3;
}
function hasExactOwnKeys2(object, key0, key1) {
    if (object === null || typeof object !== 'object' || Array.isArray(object))
        return false;
    let count = 0;
    for (const key in object) {
        if (!hasOwn.call(object, key))
            continue;
        if (key !== key0 && key !== key1)
            return false;
        count++;
    }
    return count === 2;
}
function sameScalarArrayField(sourceArray, targetArray, length) {
    if (!Array.isArray(sourceArray) || !Array.isArray(targetArray) || sourceArray.length !== length || targetArray.length !== length) {
        return false;
    }
    for (let i = 0; i < length; i++) {
        if (!hasOwn.call(sourceArray, i) ||
            !hasOwn.call(targetArray, i) ||
            !sameJsonScalarOrRef(sourceArray[i], targetArray[i])) {
            return false;
        }
    }
    return true;
}
function sameScalarObjectGroup(sourceParent, targetParent, group) {
    const sourceObject = sourceParent[group.key];
    const targetObject = targetParent[group.key];
    if (!isPlainStructuralObject(sourceObject) ||
        !isPlainStructuralObject(targetObject) ||
        countOwnKeysUntil(sourceObject, group.count + 1) !== group.count ||
        countOwnKeysUntil(targetObject, group.count + 1) !== group.count) {
        return false;
    }
    const keys = group.keys;
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        if (!hasOwn.call(sourceObject, key) ||
            !hasOwn.call(targetObject, key) ||
            !sameJsonScalarOrRef(sourceObject[key], targetObject[key])) {
            return false;
        }
    }
    return true;
}
function collectChangedDirectOrNestedScalarFields(sourceRow, targetRow, fields) {
    fields.length = 0;
    for (const key in sourceRow) {
        if (!hasOwn.call(sourceRow, key))
            continue;
        if (!hasOwn.call(targetRow, key))
            return -1;
        const sourceValue = sourceRow[key];
        const targetValue = targetRow[key];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        if (isJsonScalarForReplaceRun(sourceValue) && isJsonScalarForReplaceRun(targetValue)) {
            fields[fields.length] = [key];
            continue;
        }
        if (isPlainStructuralObject(sourceValue) && isPlainStructuralObject(targetValue)) {
            const nestedCount = collectChangedNestedScalarFields(key, sourceValue, targetValue, fields);
            if (nestedCount < 0)
                return -1;
            continue;
        }
        if (!boundedJsonEquals(sourceValue, targetValue))
            return -1;
    }
    for (const key in targetRow) {
        if (hasOwn.call(targetRow, key) && !hasOwn.call(sourceRow, key))
            return -1;
    }
    return fields.length;
}
function collectChangedNestedScalarFields(topKey, sourceObject, targetObject, fields) {
    const startLength = fields.length;
    for (const key in sourceObject) {
        if (!hasOwn.call(sourceObject, key))
            continue;
        if (!hasOwn.call(targetObject, key))
            return -1;
        const sourceValue = sourceObject[key];
        const targetValue = targetObject[key];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        if (isJsonScalarForReplaceRun(sourceValue) && isJsonScalarForReplaceRun(targetValue)) {
            fields[fields.length] = [topKey, key];
            continue;
        }
        if (!boundedJsonEquals(sourceValue, targetValue))
            return -1;
    }
    for (const key in targetObject) {
        if (hasOwn.call(targetObject, key) && !hasOwn.call(sourceObject, key))
            return -1;
    }
    return fields.length - startLength;
}
function collectChangedDirectScalarKeys(sourceRow, targetRow, keys) {
    keys.length = 0;
    for (const key in sourceRow) {
        if (!hasOwn.call(sourceRow, key))
            continue;
        if (!hasOwn.call(targetRow, key))
            return -1;
        const sourceValue = sourceRow[key];
        const targetValue = targetRow[key];
        if (!sameJsonScalarOrRef(sourceValue, targetValue)) {
            if (!isJsonScalarForReplaceRun(sourceValue) || !isJsonScalarForReplaceRun(targetValue)) {
                if (boundedJsonEquals(sourceValue, targetValue))
                    continue;
                return -1;
            }
            keys[keys.length] = key;
        }
    }
    for (const key in targetRow) {
        if (!hasOwn.call(targetRow, key))
            continue;
        if (!hasOwn.call(sourceRow, key))
            return -1;
    }
    return keys.length;
}
function hasSampledRecordRowScalarChange(source, target, length) {
    const last = length - 1;
    for (let sample = 0; sample < 9; sample++) {
        const index = sample === 0 ? 0 : Math.floor(last * sample / 8);
        const sourceRow = source[index];
        const targetRow = target[index];
        if (sourceRow === targetRow)
            continue;
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow))
            continue;
        for (const key in sourceRow) {
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key))
                continue;
            const sourceValue = sourceRow[key];
            const targetValue = targetRow[key];
            if (!sameJsonScalarOrRef(sourceValue, targetValue) &&
                isJsonScalarForReplaceRun(sourceValue) &&
                isJsonScalarForReplaceRun(targetValue)) {
                return true;
            }
        }
    }
    return false;
}
function readSampledRecordRowNestedScalarField(source, target, length) {
    const last = length - 1;
    const sampleCount = length <= 64 ? length : 9;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === length ? sample : sample === 0 ? 0 : Math.floor(last * sample / 8);
        const sourceRow = source[index];
        const targetRow = target[index];
        if (sourceRow === targetRow)
            continue;
        if (!isPlainStructuralObject(sourceRow) || !isPlainStructuralObject(targetRow))
            continue;
        for (const key in sourceRow) {
            if (!hasOwn.call(sourceRow, key) || !hasOwn.call(targetRow, key))
                continue;
            const sourceValue = sourceRow[key];
            const targetValue = targetRow[key];
            if (!isPlainStructuralObject(sourceValue) || !isPlainStructuralObject(targetValue))
                continue;
            for (const childKey in sourceValue) {
                if (!hasOwn.call(sourceValue, childKey) || !hasOwn.call(targetValue, childKey))
                    continue;
                const sourceChild = sourceValue[childKey];
                const targetChild = targetValue[childKey];
                if (!sameJsonScalarOrRef(sourceChild, targetChild) &&
                    isJsonScalarForReplaceRun(sourceChild) &&
                    isJsonScalarForReplaceRun(targetChild)) {
                    return [key, childKey];
                }
            }
        }
    }
    return null;
}
function readTupleArrayWidth(source, target, length) {
    const sampleCount = length < 8 ? length : 8;
    const last = length - 1;
    let width = 0;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceWidth = readScalarTupleRowWidth(source[index]);
        if (sourceWidth === 0)
            return 0;
        if (width === 0)
            width = sourceWidth;
        else if (sourceWidth !== width)
            return 0;
        if (!isFixedScalarTupleRow(target[index], width))
            return 0;
    }
    return width;
}
function readScalarTupleRowWidth(row) {
    if (!Array.isArray(row))
        return 0;
    const length = row.length;
    if (length < 2 || length > ARRAY_TUPLE_ASSIGN_MAX_WIDTH)
        return 0;
    for (let i = 0; i < length; i++) {
        if (!hasOwn.call(row, i) || !isJsonScalarForReplaceRun(row[i]))
            return 0;
    }
    return length;
}
function readKeyframeScalarRowWidth(row) {
    if (!Array.isArray(row))
        return 0;
    const length = row.length;
    if (length < 2 || length > DIRTY_ARRAY_KEYFRAME_ROW_MAX_WIDTH)
        return 0;
    for (let i = 0; i < length; i++) {
        if (!hasOwn.call(row, i) || !isJsonScalarForReplaceRun(row[i]))
            return 0;
    }
    return length;
}
function isFixedScalarTupleRow(row, width) {
    if (!Array.isArray(row) || row.length !== width)
        return false;
    for (let i = 0; i < width; i++) {
        if (!hasOwn.call(row, i) || !isJsonScalarForReplaceRun(row[i]))
            return false;
    }
    return true;
}
function sameFixedScalarTupleRow(sourceRow, targetRow, width) {
    if (!Array.isArray(sourceRow) || !Array.isArray(targetRow) || sourceRow.length !== width || targetRow.length !== width) {
        return false;
    }
    for (let i = 0; i < width; i++) {
        const value = sourceRow[i];
        if (!isJsonScalarForReplaceRun(value) || !sameJsonScalarOrRef(value, targetRow[i]))
            return false;
    }
    return true;
}
function isJsonScalarForReplaceRun(value) {
    const type = typeof value;
    return value === null || type === 'string' || type === 'number' || type === 'boolean';
}
function tryTwoKeyRecordArrayDiff(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const shape = findTwoKeyRecordShape(source, target);
    if (shape === null)
        return false;
    const key0 = shape[0];
    const key1 = shape[1];
    const depth = path.length;
    let assignIndexes = null;
    let assignValues = null;
    for (let i = 0, length = source.length; i < length; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
        }
        else if (sourceValue !== null &&
            targetValue !== null &&
            typeof sourceValue === 'object' &&
            typeof targetValue === 'object' &&
            !Array.isArray(sourceValue) &&
            !Array.isArray(targetValue)) {
            const sourceValue0 = sourceValue[key0];
            const targetValue0 = targetValue[key0];
            if (sameJsonScalarOrRef(sourceValue0, targetValue0) &&
                isJsonScalarForReplaceRun(sourceValue0)) {
                const sourceValue1 = sourceValue[key1];
                const targetValue1 = targetValue[key1];
                if (sameJsonScalarOrRef(sourceValue1, targetValue1) &&
                    isJsonScalarForReplaceRun(sourceValue1) &&
                    hasExactlyTwoOwnKeys(sourceValue, key0, key1) &&
                    hasExactlyTwoOwnKeys(targetValue, key0, key1)) {
                    continue;
                }
            }
        }
        const assign = makeFlatObjectAssign(sourceValue, targetValue);
        if (assign !== null) {
            if (assignIndexes === null) {
                assignIndexes = [];
                assignValues = [];
            }
            assignIndexes[assignIndexes.length] = i;
            assignValues[assignValues.length] = assign;
            continue;
        }
        path[depth] = i;
        walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        path.length = depth;
    }
    if (assignIndexes !== null) {
        emitArrayObjectAssignFromTarget(patch, path, assignIndexes, assignValues, target);
    }
    return true;
}
function emitArrayObjectAssign(patch, path, indexes, values) {
    if (indexes.length === 1) {
        const assign = values[0];
        const keys = Object.keys(assign);
        const depth = path.length;
        path[depth] = indexes[0];
        if (keys.length === 1) {
            const key = keys[0];
            path[depth + 1] = key;
            emitSet(patch, path, assign[key]);
        }
        else {
            patch[patch.length] = [OP_ASSIGN, path.slice(), assign];
        }
        path.length = depth;
        return;
    }
    patch[patch.length] = [OP_ARRAY_OBJECT_ASSIGN, path.slice(), indexes, values];
}
function emitArrayObjectAssignFromTarget(patch, path, indexes, assigns, targetRows) {
    if (tryEmitArrayObjectAssignAsFieldAssign(patch, path, indexes, assigns, targetRows))
        return;
    emitArrayObjectAssign(patch, path, indexes, assigns);
}
function emitArrayObjectAssignsIndividually(patch, path, indexes, assigns) {
    const depth = path.length;
    for (let i = 0, length = indexes.length; i < length; i++) {
        const assign = assigns[i];
        const keys = Object.keys(assign);
        path[depth] = indexes[i];
        if (keys.length === 1) {
            const key = keys[0];
            path[depth + 1] = key;
            emitSet(patch, path, assign[key]);
        }
        else {
            patch[patch.length] = [OP_ASSIGN, path.slice(), assign];
        }
        path.length = depth;
    }
}
function tryEmitArrayObjectAssignAsFieldAssign(patch, path, indexes, assigns, targetRows) {
    if (indexes.length < DIRTY_ARRAY_ROW_GROUP_MIN)
        return false;
    const fieldSeen = Object.create(null);
    const fieldNames = [];
    for (let rowOffset = 0, rowCount = assigns.length; rowOffset < rowCount; rowOffset++) {
        const assign = assigns[rowOffset];
        const keys = Object.keys(assign);
        if (keys.length === 0)
            return false;
        for (let i = 0, length = keys.length; i < length; i++) {
            const key = keys[i];
            if (!isJsonScalarForReplaceRun(assign[key]))
                return false;
            if (fieldSeen[key] !== true) {
                fieldSeen[key] = true;
                fieldNames[fieldNames.length] = key;
                if (fieldNames.length > 16)
                    return false;
            }
        }
    }
    const fields = new Array(fieldNames.length);
    for (let i = 0, length = fieldNames.length; i < length; i++) {
        fields[i] = [fieldNames[i]];
    }
    const values = [];
    for (let rowOffset = 0, rowCount = indexes.length; rowOffset < rowCount; rowOffset++) {
        const row = targetRows[indexes[rowOffset]];
        for (let fieldIndex = 0, fieldCount = fieldNames.length; fieldIndex < fieldCount; fieldIndex++) {
            const key = fieldNames[fieldIndex];
            const value = row[key];
            if (!hasOwn.call(row, key) || !isJsonScalarForReplaceRun(value))
                return false;
            values[values.length] = value;
        }
    }
    patch[patch.length] = [OP_ARRAY_OBJECT_FIELD_ASSIGN, path.slice(), indexes, fields, values];
    return true;
}
function makeFlatObjectAssign(source, target) {
    if (!isRecordObject(source) || !isRecordObject(target))
        return null;
    let assign = null;
    let count = 0;
    for (const key in source) {
        if (!hasOwn.call(source, key))
            continue;
        if (!hasOwn.call(target, key))
            return null;
        const sourceValue = source[key];
        const targetValue = target[key];
        if (sameJsonScalarOrRef(sourceValue, targetValue))
            continue;
        if (!isJsonScalarForReplaceRun(targetValue))
            return null;
        if (assign === null)
            assign = {};
        setOwnValue(assign, key, targetValue);
        count++;
    }
    for (const key in target) {
        if (!hasOwn.call(target, key) || hasOwn.call(source, key))
            continue;
        if (!isJsonScalarForReplaceRun(target[key]))
            return null;
        if (assign === null)
            assign = {};
        setOwnValue(assign, key, target[key]);
        count++;
    }
    return count === 0 ? null : assign;
}
function findTwoKeyRecordShape(source, target) {
    const limit = source.length < 64 ? source.length : 64;
    for (let i = 0; i < limit; i++) {
        const shape = readTwoKeyRecordShape(source[i], target[i]);
        if (shape !== null && countTwoKeyRecordShape(source, target, shape[0], shape[1], i + 1, limit) >= 8) {
            return shape;
        }
    }
    return null;
}
function countTwoKeyRecordShape(source, target, key0, key1, start, end) {
    let count = 1;
    for (let i = start; i < end; i++) {
        if (matchesTwoKeyRecordShape(source[i], target[i], key0, key1)) {
            count++;
            if (count >= 8)
                return count;
        }
    }
    return count;
}
function readTwoKeyRecordShape(sourceValue, targetValue) {
    if (!isRecordObject(sourceValue) || !isRecordObject(targetValue))
        return null;
    const sourceKeys = Object.keys(sourceValue);
    if (sourceKeys.length !== 2)
        return null;
    const key0 = sourceKeys[0];
    const key1 = sourceKeys[1];
    return matchesTwoKeyRecordShape(sourceValue, targetValue, key0, key1)
        ? [key0, key1]
        : null;
}
function matchesTwoKeyRecordShape(sourceValue, targetValue, key0, key1) {
    if (!isRecordObject(sourceValue) || !isRecordObject(targetValue))
        return false;
    const sourceValue0 = sourceValue[key0];
    const targetValue0 = targetValue[key0];
    const sourceValue1 = sourceValue[key1];
    const targetValue1 = targetValue[key1];
    return (sameJsonScalarOrRef(sourceValue0, targetValue0) &&
        sameJsonScalarOrRef(sourceValue1, targetValue1) &&
        isJsonScalarForReplaceRun(sourceValue0) &&
        isJsonScalarForReplaceRun(sourceValue1) &&
        hasExactlyTwoOwnKeys(sourceValue, key0, key1) &&
        hasExactlyTwoOwnKeys(targetValue, key0, key1));
}
function isRecordObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function sameShiftProbe(source, target) {
    if (sameJsonScalarOrRef(source, target))
        return true;
    if (source !== null &&
        target !== null &&
        typeof source === 'object' &&
        typeof target === 'object') {
        if (Array.isArray(source) || Array.isArray(target)) {
            return flatPrimitiveArrayEquals(source, target);
        }
        return flatPrimitiveObjectEquals(source, target);
    }
    return false;
}
function shouldReplaceArray(source, target, commonLength, getVersion) {
    if (commonLength < 64)
        return false;
    if (getVersion !== null &&
        arrayHasVersionedCompositeHints(source, target, commonLength, getVersion)) {
        return false;
    }
    const lengthDelta = target.length - source.length;
    if (lengthDelta !== 0 &&
        lengthDelta >= -SMALL_ARRAY_SHIFT_LIMIT &&
        lengthDelta <= SMALL_ARRAY_SHIFT_LIMIT) {
        return false;
    }
    let matches = 0;
    const last = commonLength - 1;
    for (let i = 0; i < 16; i++) {
        const index = Math.floor(last * i / 15);
        const sourceValue = source[index];
        const targetValue = target[index];
        if (sameShiftProbe(sourceValue, targetValue) ||
            boundedJsonEquals(sourceValue, targetValue)) {
            matches++;
        }
    }
    return matches <= 2;
}
function arrayHasVersionedCompositeHints(source, target, commonLength, getVersion) {
    const sampleCount = commonLength < 16 ? commonLength : 16;
    const last = commonLength - 1;
    let matches = 0;
    for (let sample = 0; sample < sampleCount; sample++) {
        const index = sampleCount === 1 ? 0 : Math.floor(last * sample / (sampleCount - 1));
        const sourceValue = source[index];
        const targetValue = target[index];
        if (sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion) &&
            ++matches >= 4) {
            return true;
        }
    }
    return false;
}
function shouldUseSparseArrayDiff(source, target, commonLength) {
    if (commonLength < 65536)
        return false;
    if (commonLength === 0)
        return false;
    const last = commonLength - 1;
    for (let i = 0; i < 8; i++) {
        const index = Math.floor(last * i / 7);
        if (!hasOwn.call(source, index) || !hasOwn.call(target, index))
            return true;
    }
    return false;
}
function diffSparseArrays(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const sourceLength = source.length;
    const targetLength = target.length;
    const sourceKeys = Object.keys(source);
    const targetKeys = Object.keys(target);
    const depth = path.length;
    for (let i = 0, length = sourceKeys.length; i < length; i++) {
        const key = sourceKeys[i];
        const index = Number(key);
        if (index >= targetLength)
            continue;
        if (!hasOwn.call(target, key)) {
            path[depth] = index;
            patch[patch.length] = [OP_REMOVE, path.slice()];
            path.length = depth;
        }
    }
    for (let i = 0, length = targetKeys.length; i < length; i++) {
        const key = targetKeys[i];
        const index = Number(key);
        if (hasOwn.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (sourceValue === targetValue) {
                if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                    continue;
            }
            path[depth] = index;
            walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        }
        else {
            path[depth] = index;
            emitSet(patch, path, target[key]);
        }
        path.length = depth;
    }
    if (targetLength < sourceLength) {
        patch[patch.length] = [OP_TRUNCATE, path.slice(), targetLength];
    }
}
function diffObjects(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    if (shouldReplaceObjectWithCollapsedArray(source, target)) {
        emitSet(patch, path, target);
        return;
    }
    if (keyCompare === null &&
        countOwnKeysUntil(source, SMALL_OBJECT_KEY_LIMIT + 1) <= SMALL_OBJECT_KEY_LIMIT &&
        countOwnKeysUntil(target, SMALL_OBJECT_KEY_LIMIT + 1) <= SMALL_OBJECT_KEY_LIMIT) {
        diffSmallObjects(source, target, path, patch, keyCompare, getVersion, arrayKey);
        return;
    }
    const sourceKeys = Object.keys(source);
    const targetKeys = Object.keys(target);
    const depth = path.length;
    const sourceLength = sourceKeys.length;
    const targetLength = targetKeys.length;
    if (keyCompare !== null) {
        sortKeys(sourceKeys, keyCompare);
        sortKeys(targetKeys, keyCompare);
    }
    if (shouldReplaceObjectBySize(sourceLength, targetLength)) {
        emitSet(patch, path, target);
        return;
    }
    if (keyCompare === null &&
        sourceLength === targetLength &&
        sourceLength >= 32 &&
        sourceKeys[0] === targetKeys[0] &&
        diffMostlyAlignedObjects(source, target, sourceKeys, targetKeys, path, patch, keyCompare, getVersion, arrayKey)) {
        return;
    }
    if (sourceLength === targetLength &&
        sourceLength !== 0 &&
        sourceKeys[0] === targetKeys[0] &&
        sourceKeys[sourceLength - 1] === targetKeys[targetLength - 1] &&
        sameKeys(sourceKeys, targetKeys)) {
        diffSameKeyObjects(source, target, targetKeys, path, patch, keyCompare, getVersion, arrayKey);
        return;
    }
    for (let i = 0, length = sourceLength; i < length; i++) {
        const key = sourceKeys[i];
        if (!hasOwn.call(target, key)) {
            path[depth] = key;
            patch[patch.length] = [OP_REMOVE, path.slice()];
            path.length = depth;
        }
    }
    let assign = null;
    for (let i = 0, length = targetLength; i < length; i++) {
        const key = targetKeys[i];
        if (hasOwn.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (sourceValue === targetValue) {
                if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                    continue;
            }
            if (shouldSetDirect(sourceValue, targetValue)) {
                if (assign === null)
                    assign = createAssignBuilder();
                addAssign(assign, key, targetValue);
            }
            else if (shouldSetCollapsedChild(sourceValue, targetValue)) {
                path[depth] = key;
                emitSet(patch, path, targetValue);
            }
            else if (getVersion !== null &&
                sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
                continue;
            }
            else if (sameEqualObjectSubtree(sourceValue, targetValue)) {
                continue;
            }
            else {
                path[depth] = key;
                walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
            }
        }
        else {
            if (assign === null)
                assign = createAssignBuilder();
            addAssign(assign, key, target[key]);
        }
        path.length = depth;
    }
    if (assign !== null)
        flushAssign(patch, path, depth, assign);
}
function diffMostlyAlignedObjects(source, target, sourceKeys, targetKeys, path, patch, keyCompare, getVersion, arrayKey) {
    const patchStart = patch.length;
    const depth = path.length;
    const length = sourceKeys.length;
    let sourceIndex = 0;
    let targetIndex = 0;
    let assign = null;
    while (sourceIndex < length || targetIndex < length) {
        if (sourceIndex >= length) {
            const key = targetKeys[targetIndex++];
            if (assign === null)
                assign = createAssignBuilder();
            addAssign(assign, key, target[key]);
            continue;
        }
        if (targetIndex >= length) {
            path[depth] = sourceKeys[sourceIndex++];
            patch[patch.length] = [OP_REMOVE, path.slice()];
            path.length = depth;
            continue;
        }
        const sourceKey = sourceKeys[sourceIndex];
        const targetKey = targetKeys[targetIndex];
        if (sourceKey === targetKey) {
            const sourceValue = source[sourceKey];
            const targetValue = target[sourceKey];
            if (sourceValue === targetValue) {
                if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue) {
                    sourceIndex++;
                    targetIndex++;
                    continue;
                }
            }
            if (shouldSetDirect(sourceValue, targetValue)) {
                if (assign === null)
                    assign = createAssignBuilder();
                addAssign(assign, sourceKey, targetValue);
            }
            else if (shouldSetCollapsedChild(sourceValue, targetValue)) {
                path[depth] = sourceKey;
                emitSet(patch, path, targetValue);
            }
            else if (getVersion !== null &&
                sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
                sourceIndex++;
                targetIndex++;
                continue;
            }
            else if (sameEqualObjectSubtree(sourceValue, targetValue)) {
                sourceIndex++;
                targetIndex++;
                continue;
            }
            else {
                path[depth] = sourceKey;
                walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
            }
            path.length = depth;
            sourceIndex++;
            targetIndex++;
            continue;
        }
        const targetHasSourceKey = hasOwn.call(target, sourceKey);
        const sourceHasTargetKey = hasOwn.call(source, targetKey);
        if (!targetHasSourceKey) {
            path[depth] = sourceKey;
            patch[patch.length] = [OP_REMOVE, path.slice()];
            path.length = depth;
            sourceIndex++;
        }
        else if (!sourceHasTargetKey) {
            if (assign === null)
                assign = createAssignBuilder();
            addAssign(assign, targetKey, target[targetKey]);
            targetIndex++;
        }
        else {
            patch.length = patchStart;
            path.length = depth;
            return false;
        }
    }
    if (assign !== null)
        flushAssign(patch, path, depth, assign);
    return true;
}
function diffSmallObjects(source, target, path, patch, keyCompare, getVersion, arrayKey) {
    const depth = path.length;
    for (const key in source) {
        if (!hasOwn.call(source, key))
            continue;
        if (!hasOwn.call(target, key)) {
            path[depth] = key;
            patch[patch.length] = [OP_REMOVE, path.slice()];
            path.length = depth;
        }
    }
    let assign = null;
    for (const key in target) {
        if (!hasOwn.call(target, key))
            continue;
        if (hasOwn.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (sourceValue === targetValue) {
                if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                    continue;
            }
            if (shouldSetDirect(sourceValue, targetValue)) {
                if (assign === null)
                    assign = createAssignBuilder();
                addAssign(assign, key, targetValue);
            }
            else if (shouldSetCollapsedChild(sourceValue, targetValue)) {
                path[depth] = key;
                emitSet(patch, path, targetValue);
            }
            else if (getVersion !== null &&
                sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
                continue;
            }
            else if (sameEqualObjectSubtree(sourceValue, targetValue)) {
                continue;
            }
            else {
                path[depth] = key;
                walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
            }
        }
        else {
            if (assign === null)
                assign = createAssignBuilder();
            addAssign(assign, key, target[key]);
        }
        path.length = depth;
    }
    if (assign !== null)
        flushAssign(patch, path, depth, assign);
}
function countOwnKeysUntil(object, limit) {
    let count = 0;
    for (const key in object) {
        if (hasOwn.call(object, key)) {
            count++;
            if (count >= limit)
                return count;
        }
    }
    return count;
}
function sameEqualObjectSubtree(source, target) {
    if (!isPlainStructuralObject(source) || !isPlainStructuralObject(target))
        return false;
    const sourceCount = countOwnKeysUntil(source, SMALL_OBJECT_KEY_LIMIT + 1);
    if (sourceCount < EQUAL_OBJECT_SUBTREE_MIN_KEYS || sourceCount > SMALL_OBJECT_KEY_LIMIT)
        return false;
    const targetCount = countOwnKeysUntil(target, sourceCount + 1);
    return targetCount === sourceCount && equalsJson(source, target);
}
function shouldSetCollapsedChild(source, target) {
    if (source === null || target === null || typeof source !== 'object' || typeof target !== 'object') {
        return false;
    }
    const sourceIsArray = Array.isArray(source);
    if (sourceIsArray !== Array.isArray(target))
        return false;
    if (sourceIsArray) {
        return source.length >= 64 &&
            target.length <= 8 &&
            source.length > target.length * 8;
    }
    const sourceCount = countOwnKeysUntil(source, 33);
    if (sourceCount >= 32) {
        const targetCount = countOwnKeysUntil(target, 9);
        if (targetCount <= 8 && sourceCount > targetCount * 4)
            return true;
    }
    return shouldReplaceObjectWithCollapsedArray(source, target);
}
function shouldReplaceObjectWithCollapsedArray(source, target) {
    if (countOwnKeysUntil(source, 9) > 8 ||
        countOwnKeysUntil(target, 9) > 8) {
        return false;
    }
    for (const key in target) {
        if (!hasOwn.call(target, key) || !hasOwn.call(source, key))
            continue;
        const sourceValue = source[key];
        const targetValue = target[key];
        if (Array.isArray(sourceValue) &&
            Array.isArray(targetValue) &&
            sourceValue.length >= 64 &&
            targetValue.length <= 8 &&
            sourceValue.length > targetValue.length * 8) {
            return true;
        }
    }
    return false;
}
function shouldReplaceObjectBySize(sourceLength, targetLength) {
    return sourceLength >= 32 && targetLength <= 8 && sourceLength > targetLength * 4;
}
function sameKeys(sourceKeys, targetKeys) {
    for (let i = 1, length = sourceKeys.length - 1; i < length; i++) {
        if (sourceKeys[i] !== targetKeys[i])
            return false;
    }
    return true;
}
function diffSameKeyObjects(source, target, keys, path, patch, keyCompare, getVersion, arrayKey) {
    const depth = path.length;
    let assign = null;
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        const sourceValue = source[key];
        const targetValue = target[key];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
        }
        if (shouldSetDirect(sourceValue, targetValue)) {
            if (assign === null)
                assign = createAssignBuilder();
            addAssign(assign, key, targetValue);
        }
        else if (shouldSetCollapsedChild(sourceValue, targetValue)) {
            path[depth] = key;
            emitSet(patch, path, targetValue);
        }
        else if (getVersion !== null &&
            sameVersionedCompositeSubtree(sourceValue, targetValue, getVersion)) {
            continue;
        }
        else if (sameEqualObjectSubtree(sourceValue, targetValue)) {
            continue;
        }
        else {
            path[depth] = key;
            walk(sourceValue, targetValue, path, patch, keyCompare, getVersion, arrayKey);
        }
        path.length = depth;
    }
    if (assign !== null)
        flushAssign(patch, path, depth, assign);
}
function emitSet(patch, path, value) {
    patch[patch.length] = [OP_SET, path.slice(), value];
}
function shouldSetDirect(source, target) {
    const sourceType = jsonType(source);
    const targetType = jsonType(target);
    if (sourceType === TYPE_STRING &&
        targetType === TYPE_STRING &&
        shouldUseStringSplice(source, target)) {
        return false;
    }
    return (sourceType !== targetType ||
        targetType <= TYPE_STRING ||
        sourceType === TYPE_OTHER);
}
function createAssignBuilder() {
    return {
        count: 0,
        key: null,
        value: undefined,
        values: null
    };
}
function addAssign(assign, key, value) {
    if (assign.count === 0) {
        assign.key = key;
        assign.value = value;
        assign.count = 1;
        return;
    }
    if (assign.count === 1) {
        assign.values = {};
        setOwnValue(assign.values, assign.key, assign.value);
    }
    setOwnValue(assign.values, key, value);
    assign.count++;
}
function flushAssign(patch, path, depth, assign) {
    if (assign.count === 0)
        return;
    if (assign.count === 1) {
        path[depth] = assign.key;
        emitSet(patch, path, assign.value);
        path.length = depth;
        return;
    }
    patch[patch.length] = [OP_ASSIGN, path.slice(), assign.values];
}
function shouldUseStringSplice(source, target) {
    return source.length >= 32 || target.length >= 32;
}
function emitStringSplice(patch, path, source, target) {
    const sourceLength = source.length;
    const targetLength = target.length;
    if (targetLength > sourceLength && target.slice(0, sourceLength) === source) {
        emitStringInsert(patch, path, source, sourceLength, target.slice(sourceLength));
        return;
    }
    if (sourceLength > targetLength && source.slice(0, targetLength) === target) {
        patch[patch.length] = [
            OP_STRING_SPLICE,
            path.slice(),
            targetLength,
            sourceLength - targetLength,
            ''
        ];
        return;
    }
    const commonLength = sourceLength < targetLength ? sourceLength : targetLength;
    const chunk = commonLength >= 16 * 1024 ? LONG_STRING_COMPARE_CHUNK : STRING_COMPARE_CHUNK;
    let start = 0;
    if (commonLength >= chunk * 2 && source.charCodeAt(0) === target.charCodeAt(0)) {
        while (start + chunk <= commonLength &&
            source.slice(start, start + chunk) === target.slice(start, start + chunk)) {
            start += chunk;
        }
    }
    while (start < commonLength &&
        source.charCodeAt(start) === target.charCodeAt(start)) {
        start++;
    }
    let sourceEnd = sourceLength;
    let targetEnd = targetLength;
    if (sourceEnd - start >= chunk * 2 &&
        targetEnd - start >= chunk * 2 &&
        source.charCodeAt(sourceEnd - 1) === target.charCodeAt(targetEnd - 1)) {
        while (sourceEnd - chunk >= start &&
            targetEnd - chunk >= start &&
            source.slice(sourceEnd - chunk, sourceEnd) === target.slice(targetEnd - chunk, targetEnd)) {
            sourceEnd -= chunk;
            targetEnd -= chunk;
        }
    }
    while (sourceEnd > start &&
        targetEnd > start &&
        source.charCodeAt(sourceEnd - 1) === target.charCodeAt(targetEnd - 1)) {
        sourceEnd--;
        targetEnd--;
    }
    if ((start > 0 || sourceEnd < sourceLength || targetEnd < targetLength) &&
        sourceEnd - start === targetEnd - start &&
        tryEmitStringRotationSplice(patch, path, source, target, start, sourceEnd)) {
        return;
    }
    if (sourceLength === targetLength &&
        sourceEnd - start > STRING_MULTI_REPLACE_MAX_CHANGED &&
        tryEmitEqualLengthStringSubstitutions(patch, path, source, target, start, sourceEnd)) {
        return;
    }
    if (sourceEnd === start && targetEnd > start) {
        emitStringInsert(patch, path, source, start, target.slice(start, targetEnd));
        return;
    }
    const insert = target.slice(start, targetEnd);
    if (tryEmitStringCopyPrefix(patch, path, source, start, sourceEnd - start, insert, 1))
        return;
    if (tryEmitStringCopySuffix(patch, path, source, start, sourceEnd - start, insert, 0))
        return;
    patch[patch.length] = [OP_STRING_SPLICE, path.slice(), start, sourceEnd - start, insert];
}
function tryEmitEqualLengthStringSubstitutions(patch, path, source, target, start, end) {
    const patchStart = patch.length;
    let index = start;
    let opCount = 0;
    let changed = 0;
    while (index < end) {
        while (index < end && source.charCodeAt(index) === target.charCodeAt(index))
            index++;
        if (index >= end)
            break;
        const runStart = index;
        do {
            index++;
            changed++;
            if (changed > STRING_MULTI_REPLACE_MAX_CHANGED || index - runStart > STRING_MULTI_REPLACE_MAX_RUN) {
                patch.length = patchStart;
                return false;
            }
        } while (index < end && source.charCodeAt(index) !== target.charCodeAt(index));
        opCount++;
        if (opCount > STRING_MULTI_REPLACE_MAX_OPS) {
            patch.length = patchStart;
            return false;
        }
        patch[patch.length] = [
            OP_STRING_SPLICE,
            path.slice(),
            runStart,
            index - runStart,
            target.slice(runStart, index)
        ];
    }
    if (opCount < 2) {
        patch.length = patchStart;
        return false;
    }
    return true;
}
function emitStringInsert(patch, path, source, start, insert) {
    if (insert.length >= STRING_COPY_MIN) {
        const sourceStart = source.indexOf(insert);
        if (sourceStart >= 0) {
            patch[patch.length] = [OP_STRING_COPY, path.slice(), start, sourceStart, insert.length];
            return;
        }
    }
    if (tryEmitStringCopyPrefix(patch, path, source, start, 0, insert, 1))
        return;
    if (tryEmitStringCopySuffix(patch, path, source, start, 0, insert, 1))
        return;
    patch[patch.length] = [OP_STRING_SPLICE, path.slice(), start, 0, insert];
}
function tryEmitStringCopyPrefix(patch, path, source, start, deleteCount, insert, minSuffix) {
    if (insert.length < STRING_COPY_MIN + minSuffix)
        return false;
    const probe = insert.slice(0, STRING_COPY_MIN);
    let sourceStart = source.indexOf(probe);
    while (sourceStart >= 0) {
        let copyLength = STRING_COPY_MIN;
        while (copyLength < insert.length &&
            sourceStart + copyLength < source.length &&
            source.charCodeAt(sourceStart + copyLength) === insert.charCodeAt(copyLength)) {
            copyLength++;
        }
        const suffixLength = insert.length - copyLength;
        if (suffixLength >= minSuffix && suffixLength <= STRING_COPY_SPLIT_SUFFIX_MAX) {
            const opPath = path.slice();
            patch[patch.length] = [OP_STRING_COPY, opPath, start, sourceStart, copyLength];
            patch[patch.length] = [
                OP_STRING_SPLICE,
                path.slice(),
                start + copyLength,
                deleteCount,
                insert.slice(copyLength)
            ];
            return true;
        }
        sourceStart = source.indexOf(probe, sourceStart + 1);
    }
    return false;
}
function tryEmitStringCopySuffix(patch, path, source, start, deleteCount, insert, minPrefix) {
    if (insert.length < STRING_COPY_MIN + minPrefix)
        return false;
    if (start < STRING_COPY_MIN && deleteCount !== 0)
        return false;
    const maxPrefix = Math.min(STRING_COPY_SPLIT_PREFIX_MAX, insert.length - STRING_COPY_MIN);
    for (let prefixLength = minPrefix; prefixLength <= maxPrefix; prefixLength++) {
        const probe = insert.slice(prefixLength, prefixLength + STRING_COPY_MIN);
        let sourceStart = source.indexOf(probe);
        while (sourceStart >= 0 && sourceStart + STRING_COPY_MIN <= start) {
            let copyLength = STRING_COPY_MIN;
            while (prefixLength + copyLength < insert.length &&
                sourceStart + copyLength < source.length &&
                source.charCodeAt(sourceStart + copyLength) === insert.charCodeAt(prefixLength + copyLength)) {
                copyLength++;
            }
            if (prefixLength + copyLength === insert.length) {
                return emitStringCopySuffixPatch(patch, path, start, deleteCount, insert, prefixLength, sourceStart, copyLength);
            }
            sourceStart = source.indexOf(probe, sourceStart + 1);
        }
        if (deleteCount === 0 && prefixLength !== 0) {
            while (sourceStart >= 0) {
                let copyLength = STRING_COPY_MIN;
                while (prefixLength + copyLength < insert.length &&
                    sourceStart + copyLength < source.length &&
                    source.charCodeAt(sourceStart + copyLength) === insert.charCodeAt(prefixLength + copyLength)) {
                    copyLength++;
                }
                if (prefixLength + copyLength === insert.length) {
                    patch[patch.length] = [
                        OP_STRING_COPY,
                        path.slice(),
                        start,
                        sourceStart,
                        copyLength
                    ];
                    patch[patch.length] = [
                        OP_STRING_SPLICE,
                        path.slice(),
                        start,
                        0,
                        insert.slice(0, prefixLength)
                    ];
                    return true;
                }
                sourceStart = source.indexOf(probe, sourceStart + 1);
            }
        }
    }
    return false;
}
function emitStringCopySuffixPatch(patch, path, start, deleteCount, insert, prefixLength, sourceStart, copyLength) {
    if (deleteCount === 0 && sourceStart + STRING_COPY_MIN > start) {
        patch[patch.length] = [
            OP_STRING_COPY,
            path.slice(),
            start,
            sourceStart,
            copyLength
        ];
        if (prefixLength !== 0) {
            patch[patch.length] = [
                OP_STRING_SPLICE,
                path.slice(),
                start,
                0,
                insert.slice(0, prefixLength)
            ];
        }
        return true;
    }
    if (sourceStart + STRING_COPY_MIN > start)
        return false;
    const opPath = path.slice();
    if (deleteCount !== 0 || prefixLength !== 0) {
        patch[patch.length] = [
            OP_STRING_SPLICE,
            opPath,
            start,
            deleteCount,
            prefixLength === 0 ? '' : insert.slice(0, prefixLength)
        ];
    }
    patch[patch.length] = [
        OP_STRING_COPY,
        prefixLength === 0 ? opPath : path.slice(),
        start + prefixLength,
        sourceStart,
        copyLength
    ];
    return true;
}
function tryEmitStringRotationSplice(patch, path, source, target, start, end) {
    const length = end - start;
    if (length < STRING_ROTATION_MIN || length > STRING_ROTATION_MAX)
        return false;
    const firstCandidate = source.indexOf(target.charAt(start), start + 1);
    if (firstCandidate < 0 || firstCandidate >= end)
        return false;
    const sourcePart = source.slice(start, end);
    const targetPart = target.slice(start, end);
    const shift = (sourcePart + sourcePart).indexOf(targetPart, 1);
    if (shift <= 0 || shift >= length)
        return false;
    if (shift <= length - shift) {
        patch[patch.length] = [OP_STRING_COPY, path.slice(), end, start, shift];
        patch[patch.length] = [OP_STRING_SPLICE, path.slice(), start, shift, ''];
    }
    else {
        const suffixLength = length - shift;
        patch[patch.length] = [OP_STRING_COPY, path.slice(), start, start + shift, suffixLength];
        patch[patch.length] = [OP_STRING_SPLICE, path.slice(), end, suffixLength, ''];
    }
    return true;
}
function flatPrimitiveObjectEquals(source, target) {
    if (Array.isArray(source) || Array.isArray(target))
        return false;
    const sourceKeys = Object.keys(source);
    const targetKeys = Object.keys(target);
    const length = sourceKeys.length;
    if (length !== targetKeys.length)
        return false;
    for (let i = 0; i < length; i++) {
        const key = sourceKeys[i];
        if (key !== targetKeys[i])
            return false;
        const sourceValue = source[key];
        const targetValue = target[key];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
            return false;
        }
        if (sourceValue !== null &&
            targetValue !== null &&
            (typeof sourceValue === 'object' || typeof targetValue === 'object')) {
            return false;
        }
        return false;
    }
    return true;
}
function flatPrimitiveArrayEquals(source, target) {
    if (!Array.isArray(source) || !Array.isArray(target))
        return false;
    const length = source.length;
    if (length !== target.length || length > FLAT_ARRAY_SHIFT_PROBE_MAX)
        return false;
    for (let i = 0; i < length; i++) {
        const sourceValue = source[i];
        const targetValue = target[i];
        if (sourceValue === targetValue) {
            if (sourceValue !== 0 || 1 / sourceValue === 1 / targetValue)
                continue;
            return false;
        }
        if (sourceValue !== null &&
            targetValue !== null &&
            (typeof sourceValue === 'object' || typeof targetValue === 'object')) {
            return false;
        }
        return false;
    }
    return true;
}
function flatTwoKeyObjectEquals(source, target, key0, key1) {
    if (Array.isArray(source) || Array.isArray(target))
        return false;
    const sourceValue0 = source[key0];
    const targetValue0 = target[key0];
    if (sourceValue0 !== targetValue0 || (sourceValue0 === 0 && 1 / sourceValue0 !== 1 / targetValue0)) {
        return false;
    }
    const sourceValue1 = source[key1];
    const targetValue1 = target[key1];
    if (sourceValue1 !== targetValue1 || (sourceValue1 === 0 && 1 / sourceValue1 !== 1 / targetValue1)) {
        return false;
    }
    if (sourceValue0 !== null &&
        typeof sourceValue0 === 'object') {
        return false;
    }
    if (sourceValue1 !== null &&
        typeof sourceValue1 === 'object') {
        return false;
    }
    return (hasExactlyTwoOwnKeys(source, key0, key1) &&
        hasExactlyTwoOwnKeys(target, key0, key1));
}
function hasExactlyTwoOwnKeys(object, key0, key1) {
    let mask = 0;
    for (const key in object) {
        if (!hasOwn.call(object, key))
            continue;
        if (key === key0) {
            mask |= 1;
        }
        else if (key === key1) {
            mask |= 2;
        }
        else {
            return false;
        }
    }
    return mask === 3;
}
function readDirtyPaths(options) {
    if (!options || options.dirtyPaths === undefined)
        return undefined;
    if (!Array.isArray(options.dirtyPaths)) {
        throw new TypeError('dirtyPaths option must be an array of path arrays');
    }
    return normalizeDirtyPaths(options.dirtyPaths, true);
}
function readDirtyRows(options) {
    if (!options || options.dirtyRows === undefined)
        return undefined;
    if (options.dirtyRows === null)
        return null;
    if (!Array.isArray(options.dirtyRows)) {
        throw new TypeError('dirtyRows option must be an array of row frontier objects');
    }
    for (let i = 0, length = options.dirtyRows.length; i < length; i++) {
        const frontier = options.dirtyRows[i];
        if (frontier === null || typeof frontier !== 'object') {
            throw new TypeError('dirtyRows entries must be row frontier objects');
        }
        validateDirtyPath(frontier.path);
        const rows = frontier.rows;
        if (rows === null ||
            typeof rows !== 'object' ||
            typeof rows.length !== 'number' ||
            !Number.isSafeInteger(rows.length) ||
            rows.length < 0) {
            throw new TypeError('dirtyRows rows must be an array-like list of row indexes');
        }
        for (let rowIndex = 0, rowCount = rows.length; rowIndex < rowCount; rowIndex++) {
            const row = rows[rowIndex];
            if (!Number.isSafeInteger(row) || row < 0 || Object.is(row, -0)) {
                throw new TypeError('dirtyRows row indexes must be non-negative safe integers');
            }
        }
        const fields = frontier.fields;
        if (fields !== undefined) {
            if (!Array.isArray(fields)) {
                throw new TypeError('dirtyRows fields must be an array of relative path arrays');
            }
            for (let fieldIndex = 0, fieldCount = fields.length; fieldIndex < fieldCount; fieldIndex++) {
                const field = fields[fieldIndex];
                validateDirtyPath(field);
                if (field.length === 0) {
                    throw new TypeError('dirtyRows field paths must not be empty');
                }
            }
        }
    }
    return options.dirtyRows;
}
function normalizeDirtyPaths(paths, validate) {
    if (paths.length === 0)
        return [];
    if (paths.length === 1) {
        const path = paths[0];
        if (validate)
            validateDirtyPath(path);
        if (path.length === 0)
            return null;
        return [path];
    }
    let isPreordered = true;
    let isReversePreordered = true;
    let hasFrontierPrefix = false;
    let previousPath = null;
    for (let i = 0, length = paths.length; i < length; i++) {
        const path = paths[i];
        if (validate)
            validateDirtyPath(path);
        if (path.length === 0)
            return null;
        if (previousPath !== null) {
            const order = compareDirtyPathsPreorder(previousPath, path);
            if (order > 0) {
                isPreordered = false;
            }
            else if (order < 0) {
                isReversePreordered = false;
            }
            if (order === 0 ||
                (order < 0 && previousPath.length < path.length && isPathPrefix(previousPath, path))) {
                hasFrontierPrefix = true;
            }
        }
        previousPath = path;
    }
    if (isPreordered && !hasFrontierPrefix) {
        return paths;
    }
    if (isPreordered) {
        const frontier = [];
        for (let i = 0, length = paths.length; i < length; i++) {
            const path = paths[i];
            const previous = frontier[frontier.length - 1];
            if (previous === undefined || !isPathPrefix(previous, path)) {
                frontier[frontier.length] = path;
            }
        }
        return frontier;
    }
    if (isReversePreordered) {
        const sorted = paths.slice();
        sorted.reverse();
        const frontier = [];
        for (let i = 0, length = sorted.length; i < length; i++) {
            const path = sorted[i];
            const previous = frontier[frontier.length - 1];
            if (previous === undefined || !isPathPrefix(previous, path)) {
                frontier[frontier.length] = path;
            }
        }
        return frontier;
    }
    const sorted = paths.slice();
    sorted.sort(compareDirtyPathsPreorder);
    const frontier = [];
    for (let i = 0, length = sorted.length; i < length; i++) {
        const path = sorted[i];
        const previous = frontier[frontier.length - 1];
        if (previous === undefined || !isPathPrefix(previous, path)) {
            frontier[frontier.length] = path;
        }
    }
    return frontier;
}
function validateDirtyPath(path) {
    if (!Array.isArray(path)) {
        throw new TypeError('dirtyPaths option must be an array of path arrays');
    }
    for (let i = 0, length = path.length; i < length; i++) {
        const segment = path[i];
        if (typeof segment !== 'string' &&
            (typeof segment !== 'number' ||
                !Number.isSafeInteger(segment) ||
                segment < 0 ||
                Object.is(segment, -0))) {
            throw new TypeError('dirtyPaths path segments must be strings or non-negative safe integers');
        }
    }
}
function compareDirtyPathsPreorder(left, right) {
    const length = left.length < right.length ? left.length : right.length;
    for (let i = 0; i < length; i++) {
        const leftSegment = left[i];
        const rightSegment = right[i];
        if (leftSegment === rightSegment)
            continue;
        const leftType = typeof leftSegment;
        const rightType = typeof rightSegment;
        if (leftType !== rightType)
            return leftType < rightType ? -1 : 1;
        return leftSegment < rightSegment ? -1 : 1;
    }
    return left.length - right.length;
}
function isPathPrefix(prefix, path) {
    for (let i = 0, length = prefix.length; i < length; i++) {
        if (prefix[i] !== path[i])
            return false;
    }
    return true;
}
function readKeyCompare(options) {
    if (!options)
        return null;
    if (typeof options.keyCompare === 'function')
        return options.keyCompare;
    if (typeof options.stable === 'function')
        return options.stable;
    return options.stable || options.sortKeys ? compareKeysLexical : null;
}
function readVersionGetter(options) {
    if (!options)
        return null;
    if (options.getVersion !== undefined) {
        if (typeof options.getVersion !== 'function') {
            throw new TypeError('getVersion option must be a function');
        }
        return options.getVersion;
    }
    if (options.getFingerprint !== undefined) {
        if (typeof options.getFingerprint !== 'function') {
            throw new TypeError('getFingerprint option must be a function');
        }
        return options.getFingerprint;
    }
    if (options.versionKey !== undefined) {
        const key = options.versionKey;
        return (value) => value !== null && typeof value === 'object'
            ? value[key]
            : undefined;
    }
    if (options.fingerprintKey !== undefined) {
        const key = options.fingerprintKey;
        return (value) => value !== null && typeof value === 'object'
            ? value[key]
            : undefined;
    }
    return null;
}
function readArrayKey(options) {
    if (!options)
        return null;
    if (options.arrayKey === false || options.autoArrayKey === false)
        return false;
    if (options.getArrayKey !== undefined) {
        if (typeof options.getArrayKey !== 'function') {
            throw new TypeError('getArrayKey option must be a function');
        }
        return options.getArrayKey;
    }
    if (options.arrayKey !== undefined && options.arrayKey !== null && options.arrayKey !== true) {
        if (typeof options.arrayKey === 'function')
            return options.arrayKey;
        if (typeof options.arrayKey === 'string' || typeof options.arrayKey === 'number') {
            return makeObjectKeyReader(options.arrayKey);
        }
        throw new TypeError('arrayKey option must be a string, number, function, true, false, or null');
    }
    if (options.recordKeyCandidates !== undefined) {
        return readRecordKeyCandidatePolicy(options.recordKeyCandidates);
    }
    return null;
}
function readRecordKeyCandidatePolicy(candidates) {
    if (candidates === false || candidates === null) {
        return { keyKind: 'policy', recordKeyCandidates: null };
    }
    if (!Array.isArray(candidates)) {
        throw new TypeError('recordKeyCandidates option must be an array of strings/numbers or false');
    }
    const out = new Array(candidates.length);
    for (let i = 0, length = candidates.length; i < length; i++) {
        const key = candidates[i];
        if (typeof key !== 'string' && typeof key !== 'number') {
            throw new TypeError('recordKeyCandidates entries must be strings or numbers');
        }
        out[i] = key;
    }
    return { keyKind: 'policy', recordKeyCandidates: out };
}
function sameVersionedSubtree(source, target, getVersion) {
    const sourceVersion = getVersion(source);
    return sourceVersion !== undefined &&
        sourceVersion !== null &&
        sourceVersion === getVersion(target);
}
function sameVersionedCompositeSubtree(source, target, getVersion) {
    return source !== null &&
        target !== null &&
        typeof source === 'object' &&
        typeof target === 'object' &&
        Array.isArray(source) === Array.isArray(target) &&
        sameVersionedSubtree(source, target, getVersion);
}
function compareKeysLexical(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function sortKeys(keys, compare) {
    if (keys.length <= 8) {
        for (let i = 1, length = keys.length; i < length; i++) {
            const value = keys[i];
            let j = i - 1;
            while (j >= 0 && compare(keys[j], value) > 0) {
                keys[j + 1] = keys[j];
                j--;
            }
            keys[j + 1] = value;
        }
        return keys;
    }
    return keys.sort(compare);
}
function jsonType(value) {
    if (value === null)
        return TYPE_NULL;
    switch (typeof value) {
        case 'boolean':
            return TYPE_BOOLEAN;
        case 'number':
            return TYPE_NUMBER;
        case 'string':
            return TYPE_STRING;
        case 'object':
            return Array.isArray(value) ? TYPE_ARRAY : TYPE_OBJECT;
        default:
            return TYPE_OTHER;
    }
}