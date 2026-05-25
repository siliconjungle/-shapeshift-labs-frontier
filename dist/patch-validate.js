import { OP_SET, OP_REMOVE, OP_TRUNCATE, OP_APPEND, OP_ASSIGN, OP_STRING_SPLICE, OP_ARRAY_SPLICE, OP_ARRAY_MOVE, OP_STRING_COPY, OP_ARRAY_ASSIGN, OP_ARRAY_OBJECT_ASSIGN, OP_ARRAY_TUPLE_ASSIGN, OP_ARRAY_OBJECT_FIELD_ASSIGN, OP_SCALAR_ARRAY_REPLACE, OP_ARRAY_TWO_FIELD_INSERT } from './constants.js';
import { assertJsonValue } from './validate.js';
export function assertPatch(patch) {
    if (!Array.isArray(patch)) {
        throw new TypeError('patch must be an array');
    }
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (!Array.isArray(op)) {
            throw new TypeError('patch[' + i + '] must be an operation array');
        }
        const code = op[0];
        const path = op[1];
        assertPath(path, 'patch[' + i + '][1]');
        if (code === OP_SET) {
            if (op.length !== 3)
                throw new TypeError('set operation must have 3 fields');
            assertJsonValue(op[2], 'patch[' + i + '][2]');
        }
        else if (code === OP_REMOVE) {
            if (op.length !== 2)
                throw new TypeError('remove operation must have 2 fields');
            if (path.length === 0)
                throw new TypeError('remove operation cannot target root');
        }
        else if (code === OP_TRUNCATE) {
            if (op.length !== 3)
                throw new TypeError('truncate operation must have 3 fields');
            if (!isSafeIndex(op[2])) {
                throw new TypeError('truncate length must be a non-negative safe integer');
            }
        }
        else if (code === OP_APPEND) {
            if (op.length !== 3)
                throw new TypeError('append operation must have 3 fields');
            if (!Array.isArray(op[2]))
                throw new TypeError('append values must be an array');
            assertJsonValue(op[2], 'patch[' + i + '][2]');
        }
        else if (code === OP_SCALAR_ARRAY_REPLACE) {
            if (op.length !== 3)
                throw new TypeError('scalar array replace operation must have 3 fields');
            if (!Array.isArray(op[2]))
                throw new TypeError('scalar array replace values must be an array');
            for (let j = 0, valueCount = op[2].length; j < valueCount; j++) {
                if (!isPrimitiveJsonScalar(op[2][j])) {
                    throw new TypeError('scalar array replace values must be JSON scalars');
                }
            }
        }
        else if (code === OP_ARRAY_SPLICE) {
            if (op.length !== 5)
                throw new TypeError('array splice operation must have 5 fields');
            if (!isSafeIndex(op[2]))
                throw new TypeError('array splice start must be a non-negative safe integer');
            if (!isSafeIndex(op[3]))
                throw new TypeError('array splice delete count must be a non-negative safe integer');
            if (!Array.isArray(op[4]))
                throw new TypeError('array splice values must be an array');
            assertJsonValue(op[4], 'patch[' + i + '][4]');
        }
        else if (code === OP_ARRAY_TWO_FIELD_INSERT) {
            if (op.length !== 7)
                throw new TypeError('array two-field insert operation must have 7 fields');
            if (!isSafeIndex(op[2]))
                throw new TypeError('array two-field insert start must be a non-negative safe integer');
            if (typeof op[3] !== 'string' || typeof op[4] !== 'string') {
                throw new TypeError('array two-field insert keys must be strings');
            }
            if (!Array.isArray(op[5]) || !Array.isArray(op[6])) {
                throw new TypeError('array two-field insert values must be arrays');
            }
            if (op[5].length !== op[6].length) {
                throw new TypeError('array two-field insert value arrays must have the same length');
            }
            for (let j = 0, valueCount = op[5].length; j < valueCount; j++) {
                if (!isPrimitiveJsonScalar(op[5][j]) || !isPrimitiveJsonScalar(op[6][j])) {
                    throw new TypeError('array two-field insert values must be JSON scalars');
                }
            }
        }
        else if (code === OP_ARRAY_MOVE) {
            if (op.length !== 4)
                throw new TypeError('array move operation must have 4 fields');
            if (!isSafeIndex(op[2]))
                throw new TypeError('array move from index must be a non-negative safe integer');
            if (!isSafeIndex(op[3]))
                throw new TypeError('array move to index must be a non-negative safe integer');
        }
        else if (code === OP_ARRAY_ASSIGN) {
            if (op.length !== 4)
                throw new TypeError('array assign operation must have 4 fields');
            if (!Array.isArray(op[2]))
                throw new TypeError('array assign indexes must be an array');
            if (!Array.isArray(op[3]))
                throw new TypeError('array assign values must be an array');
            if (op[2].length !== op[3].length) {
                throw new TypeError('array assign indexes and values must have the same length');
            }
            for (let j = 0, valueCount = op[2].length; j < valueCount; j++) {
                if (!isSafeIndex(op[2][j])) {
                    throw new TypeError('array assign indexes must be non-negative safe integers');
                }
            }
            assertJsonValue(op[3], 'patch[' + i + '][3]');
        }
        else if (code === OP_ARRAY_OBJECT_ASSIGN) {
            if (op.length !== 4)
                throw new TypeError('array object assign operation must have 4 fields');
            if (!Array.isArray(op[2]))
                throw new TypeError('array object assign indexes must be an array');
            if (!Array.isArray(op[3]))
                throw new TypeError('array object assign values must be an array');
            if (op[2].length !== op[3].length) {
                throw new TypeError('array object assign indexes and values must have the same length');
            }
            for (let j = 0, valueCount = op[2].length; j < valueCount; j++) {
                if (!isSafeIndex(op[2][j])) {
                    throw new TypeError('array object assign indexes must be non-negative safe integers');
                }
                const values = op[3][j];
                if (values === null || typeof values !== 'object' || Array.isArray(values)) {
                    throw new TypeError('array object assign values must be objects');
                }
            }
            assertJsonValue(op[3], 'patch[' + i + '][3]');
        }
        else if (code === OP_ARRAY_TUPLE_ASSIGN) {
            if (op.length !== 5)
                throw new TypeError('array tuple assign operation must have 5 fields');
            if (!Array.isArray(op[2]))
                throw new TypeError('array tuple assign row indexes must be an array');
            if (!Array.isArray(op[3]))
                throw new TypeError('array tuple assign field indexes must be an array');
            if (!Array.isArray(op[4]))
                throw new TypeError('array tuple assign values must be an array');
            if (op[2].length !== op[3].length || op[2].length !== op[4].length) {
                throw new TypeError('array tuple assign indexes and values must have the same length');
            }
            for (let j = 0, valueCount = op[2].length; j < valueCount; j++) {
                if (!isSafeIndex(op[2][j])) {
                    throw new TypeError('array tuple assign row indexes must be non-negative safe integers');
                }
                if (!isSafeIndex(op[3][j])) {
                    throw new TypeError('array tuple assign field indexes must be non-negative safe integers');
                }
            }
            assertJsonValue(op[4], 'patch[' + i + '][4]');
        }
        else if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
            if (op.length !== 5)
                throw new TypeError('array object field assign operation must have 5 fields');
            if (!Array.isArray(op[2]))
                throw new TypeError('array object field assign row indexes must be an array');
            if (!Array.isArray(op[3]))
                throw new TypeError('array object field assign fields must be an array');
            if (!Array.isArray(op[4]))
                throw new TypeError('array object field assign values must be an array');
            if (op[2].length * op[3].length !== op[4].length) {
                throw new TypeError('array object field assign values must match rows times fields');
            }
            for (let j = 0, rowCount = op[2].length; j < rowCount; j++) {
                if (!isSafeIndex(op[2][j])) {
                    throw new TypeError('array object field assign row indexes must be non-negative safe integers');
                }
            }
            for (let j = 0, fieldCount = op[3].length; j < fieldCount; j++) {
                const field = op[3][j];
                if (!Array.isArray(field) || field.length === 0) {
                    throw new TypeError('array object field assign fields must be non-empty path arrays');
                }
                for (let k = 0, segmentCount = field.length; k < segmentCount; k++) {
                    const segment = field[k];
                    if (typeof segment !== 'string' && !isSafeIndex(segment)) {
                        throw new TypeError('array object field assign field segments must be strings or non-negative safe integers');
                    }
                }
            }
            assertJsonValue(op[3], 'patch[' + i + '][3]');
            assertJsonValue(op[4], 'patch[' + i + '][4]');
        }
        else if (code === OP_ASSIGN) {
            if (op.length !== 3)
                throw new TypeError('assign operation must have 3 fields');
            if (op[2] === null || typeof op[2] !== 'object' || Array.isArray(op[2])) {
                throw new TypeError('assign values must be an object');
            }
            assertJsonValue(op[2], 'patch[' + i + '][2]');
        }
        else if (code === OP_STRING_SPLICE) {
            if (op.length !== 5)
                throw new TypeError('string splice operation must have 5 fields');
            if (!isSafeIndex(op[2]))
                throw new TypeError('string splice start must be a non-negative safe integer');
            if (!isSafeIndex(op[3]))
                throw new TypeError('string splice delete count must be a non-negative safe integer');
            if (typeof op[4] !== 'string')
                throw new TypeError('string splice insert must be a string');
        }
        else if (code === OP_STRING_COPY) {
            if (op.length !== 5)
                throw new TypeError('string copy operation must have 5 fields');
            if (!isSafeIndex(op[2]))
                throw new TypeError('string copy target start must be a non-negative safe integer');
            if (!isSafeIndex(op[3]))
                throw new TypeError('string copy source start must be a non-negative safe integer');
            if (!isSafeIndex(op[4]))
                throw new TypeError('string copy length must be a non-negative safe integer');
        }
        else {
            throw new TypeError('unknown patch opcode: ' + code);
        }
    }
    return patch;
}
function assertPath(path, label) {
    if (!Array.isArray(path)) {
        throw new TypeError(label + ' must be a path array');
    }
    for (let i = 0, length = path.length; i < length; i++) {
        const segment = path[i];
        if (typeof segment === 'string')
            continue;
        if (isSafeIndex(segment))
            continue;
        throw new TypeError(label + '[' + i + '] must be a string key or non-negative safe integer');
    }
}
function isSafeIndex(value) {
    return (typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        !Object.is(value, -0));
}
function isPrimitiveJsonScalar(value) {
    const type = typeof value;
    return value === null || type === 'string' || type === 'number' || type === 'boolean';
}
//# sourceMappingURL=patch-validate.js.map