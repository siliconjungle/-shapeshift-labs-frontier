import { OP_SET, OP_REMOVE, OP_TRUNCATE, OP_APPEND, OP_ASSIGN, OP_STRING_SPLICE, OP_ARRAY_SPLICE, OP_ARRAY_MOVE, OP_STRING_COPY, OP_ARRAY_ASSIGN, OP_ARRAY_OBJECT_ASSIGN, OP_ARRAY_TUPLE_ASSIGN, OP_ARRAY_OBJECT_FIELD_ASSIGN, OP_SCALAR_ARRAY_REPLACE, OP_ARRAY_TWO_FIELD_INSERT } from './constants.js';
import { assertPatch } from './patch-validate.js';
import { setOwnValue } from './object.js';
const ARRAY_OBJECT_ASSIGN_FIELD_MIN_ROWS = 4;
const ARRAY_OBJECT_ASSIGN_FIELD_MAX_FIELDS = 16;
const DENSE_INDEX_COMPACTION_MAX_SPAN = 1 << 20;
const DENSE_INDEX_COMPACTION_FACTOR = 4;
export function normalizePatch(patch, options) {
    if (!options || options.validate !== false) {
        assertPatch(patch);
    }
    const out = [];
    for (let i = 0, length = patch.length; i < length; i++) {
        const siblingSetRun = extractSiblingSetRun(patch, i);
        if (siblingSetRun !== null) {
            appendCopiedNormalized(out, siblingSetRun.op);
            i = siblingSetRun.end - 1;
            continue;
        }
        const assignmentRun = extractAssignmentRun(patch, i);
        if (assignmentRun !== null) {
            const op = copyOperation(assignmentRun.op);
            if (!isNoOp(op))
                appendCopiedNormalized(out, op);
            i = assignmentRun.end - 1;
            continue;
        }
        appendNormalized(out, patch[i]);
    }
    return extractCheapestEquivalentPatch(out);
}
function extractAssignmentRun(patch, start) {
    const code = patch[start][0];
    if (code === OP_ARRAY_ASSIGN)
        return extractArrayAssignRun(patch, start);
    if (code === OP_ARRAY_OBJECT_ASSIGN)
        return extractArrayObjectAssignRun(patch, start);
    if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN)
        return extractArrayObjectFieldAssignRun(patch, start);
    return null;
}
function appendNormalized(out, op) {
    if (isNoOp(op))
        return;
    appendCopiedNormalized(out, copyOperation(op));
}
function appendCopiedNormalized(out, next) {
    const last = out[out.length - 1];
    if (last !== undefined && samePath(last[1], next[1])) {
        if (next[0] === OP_SET) {
            out[out.length - 1] = next;
            return;
        }
        if (next[0] === OP_REMOVE) {
            out[out.length - 1] = next;
            return;
        }
        if (last[0] === OP_ASSIGN && next[0] === OP_ASSIGN) {
            mergeAssign(last[2], next[2]);
            return;
        }
        if (last[0] === OP_APPEND && next[0] === OP_APPEND) {
            appendValues(last[2], next[2]);
            return;
        }
        if (last[0] === OP_ARRAY_SPLICE && next[0] === OP_ARRAY_SPLICE && mergeArraySplice(out, last, next)) {
            return;
        }
        if (last[0] === OP_STRING_SPLICE && next[0] === OP_STRING_SPLICE && mergeStringSplice(out, last, next)) {
            return;
        }
        if (last[0] === OP_STRING_COPY && next[0] === OP_STRING_COPY && mergeStringCopy(last, next)) {
            return;
        }
    }
    if (last !== undefined && last[0] === OP_ASSIGN && next[0] === OP_SET && mergeSetIntoAssign(last, next)) {
        return;
    }
    if (last !== undefined && last[0] === OP_SET && next[0] === OP_SET && mergeSiblingSets(out, last, next)) {
        return;
    }
    if (last !== undefined && last[0] === OP_SET && next[0] === OP_ASSIGN && mergeSetIntoNextAssign(out, last, next)) {
        return;
    }
    out[out.length] = next;
}
function extractSiblingSetRun(patch, start) {
    const first = patch[start];
    if (first[0] !== OP_SET)
        return null;
    const firstPath = first[1];
    const depth = firstPath.length - 1;
    if (depth < 0 || typeof firstPath[depth] !== 'string')
        return null;
    let end = start + 1;
    let values = null;
    while (end < patch.length) {
        const next = patch[end];
        if (next[0] !== OP_SET)
            break;
        const nextPath = next[1];
        if (nextPath.length !== firstPath.length ||
            typeof nextPath[depth] !== 'string' ||
            !samePath(firstPath, nextPath, depth)) {
            break;
        }
        if (values === null) {
            values = {};
            setOwnValue(values, firstPath[depth], first[2]);
        }
        setOwnValue(values, nextPath[depth], next[2]);
        end++;
    }
    if (values === null)
        return null;
    return {
        end,
        op: [OP_ASSIGN, firstPath.slice(0, depth), values]
    };
}
function isNoOp(op) {
    const code = op[0];
    if (code === OP_ASSIGN)
        return Object.keys(op[2]).length === 0;
    if (code === OP_APPEND)
        return op[2].length === 0;
    if (code === OP_ARRAY_SPLICE)
        return op[3] === 0 && op[4].length === 0;
    if (code === OP_STRING_SPLICE)
        return op[3] === 0 && op[4] === '';
    if (code === OP_ARRAY_MOVE)
        return op[2] === op[3];
    if (code === OP_STRING_COPY)
        return op[4] === 0;
    if (code === OP_ARRAY_ASSIGN)
        return op[2].length === 0;
    if (code === OP_ARRAY_OBJECT_ASSIGN)
        return op[2].length === 0;
    if (code === OP_ARRAY_TUPLE_ASSIGN)
        return op[2].length === 0;
    if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN)
        return op[2].length === 0 || op[3].length === 0;
    if (code === OP_SCALAR_ARRAY_REPLACE)
        return false;
    if (code === OP_ARRAY_TWO_FIELD_INSERT)
        return op[5].length === 0;
    return false;
}
function copyOperation(op) {
    const code = op[0];
    const path = op[1].slice();
    if (code === OP_SET)
        return [code, path, op[2]];
    if (code === OP_REMOVE)
        return [code, path];
    if (code === OP_TRUNCATE)
        return [code, path, op[2]];
    if (code === OP_APPEND)
        return [code, path, op[2].slice()];
    if (code === OP_ASSIGN)
        return [code, path, copyAssignValues(op[2])];
    if (code === OP_STRING_SPLICE)
        return [code, path, op[2], op[3], op[4]];
    if (code === OP_ARRAY_SPLICE)
        return [code, path, op[2], op[3], op[4].slice()];
    if (code === OP_ARRAY_MOVE)
        return [code, path, op[2], op[3]];
    if (code === OP_STRING_COPY)
        return [code, path, op[2], op[3], op[4]];
    if (code === OP_ARRAY_ASSIGN)
        return [code, path, op[2].slice(), op[3].slice()];
    if (code === OP_ARRAY_OBJECT_ASSIGN)
        return [code, path, op[2].slice(), copyAssignList(op[3])];
    if (code === OP_ARRAY_TUPLE_ASSIGN)
        return [code, path, op[2].slice(), op[3].slice(), op[4].slice()];
    if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN)
        return [code, path, op[2].slice(), copyFieldPaths(op[3]), op[4].slice()];
    if (code === OP_SCALAR_ARRAY_REPLACE)
        return [code, path, op[2].slice()];
    if (code === OP_ARRAY_TWO_FIELD_INSERT) {
        return [code, path, op[2], op[3], op[4], op[5].slice(), op[6].slice()];
    }
    return op.slice();
}
function copyFieldPaths(fields) {
    const out = new Array(fields.length);
    for (let i = 0, length = fields.length; i < length; i++)
        out[i] = fields[i].slice();
    return out;
}
function copyAssignList(values) {
    const out = new Array(values.length);
    for (let i = 0, length = values.length; i < length; i++) {
        out[i] = copyAssignValues(values[i]);
    }
    return out;
}
function copyAssignValues(values) {
    const out = {};
    const keys = Object.keys(values);
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        setOwnValue(out, key, values[key]);
    }
    return out;
}
function mergeAssign(target, source) {
    const keys = Object.keys(source);
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        setOwnValue(target, key, source[key]);
    }
}
function mergeSetIntoAssign(assign, set) {
    const path = set[1];
    if (path.length === 0 || typeof path[path.length - 1] !== 'string')
        return false;
    if (!samePath(assign[1], path, path.length - 1))
        return false;
    setOwnValue(assign[2], path[path.length - 1], set[2]);
    return true;
}
function mergeSiblingSets(out, last, next) {
    const lastPath = last[1];
    const nextPath = next[1];
    const depth = lastPath.length - 1;
    if (depth < 0 ||
        nextPath.length !== lastPath.length ||
        typeof lastPath[depth] !== 'string' ||
        typeof nextPath[depth] !== 'string' ||
        !samePath(lastPath, nextPath, depth)) {
        return false;
    }
    const values = {};
    setOwnValue(values, lastPath[depth], last[2]);
    setOwnValue(values, nextPath[depth], next[2]);
    out[out.length - 1] = [OP_ASSIGN, lastPath.slice(0, depth), values];
    return true;
}
function mergeSetIntoNextAssign(out, last, next) {
    const lastPath = last[1];
    const depth = lastPath.length - 1;
    if (depth < 0 || typeof lastPath[depth] !== 'string' || !samePath(lastPath, next[1], depth)) {
        return false;
    }
    const values = {};
    setOwnValue(values, lastPath[depth], last[2]);
    mergeAssign(values, next[2]);
    out[out.length - 1] = [OP_ASSIGN, next[1], values];
    return true;
}
function appendValues(target, source) {
    const offset = target.length;
    for (let i = 0, length = source.length; i < length; i++) {
        target[offset + i] = source[i];
    }
}
function mergeArraySplice(out, last, next) {
    const lastStart = last[2];
    const lastDeleteCount = last[3];
    const lastValues = last[4];
    const nextStart = next[2];
    const nextDeleteCount = next[3];
    const nextValues = next[4];
    if (lastDeleteCount === 0 && nextDeleteCount === 0 && nextStart === lastStart + lastValues.length) {
        appendValues(lastValues, nextValues);
        return true;
    }
    if (lastDeleteCount > 0 && lastValues.length === 0 && nextDeleteCount > 0 && nextValues.length === 0 && nextStart === lastStart) {
        last[3] = lastDeleteCount + nextDeleteCount;
        return true;
    }
    if (lastDeleteCount === 0 &&
        lastValues.length > 0 &&
        nextDeleteCount > 0 &&
        nextValues.length === 0 &&
        nextStart >= lastStart &&
        nextStart + nextDeleteCount <= lastStart + lastValues.length) {
        lastValues.splice(nextStart - lastStart, nextDeleteCount);
        if (lastValues.length === 0)
            out.pop();
        return true;
    }
    return false;
}
function mergeStringSplice(out, last, next) {
    const lastStart = last[2];
    const lastDeleteCount = last[3];
    const lastInsert = last[4];
    const nextStart = next[2];
    const nextDeleteCount = next[3];
    const nextInsert = next[4];
    if (lastDeleteCount === 0 && nextDeleteCount === 0 && nextStart === lastStart + lastInsert.length) {
        last[4] = lastInsert + nextInsert;
        return true;
    }
    if (lastDeleteCount > 0 && lastInsert === '' && nextDeleteCount > 0 && nextInsert === '' && nextStart === lastStart) {
        last[3] = lastDeleteCount + nextDeleteCount;
        return true;
    }
    if (lastDeleteCount === 0 &&
        lastInsert.length > 0 &&
        nextDeleteCount > 0 &&
        nextInsert === '' &&
        nextStart >= lastStart &&
        nextStart + nextDeleteCount <= lastStart + lastInsert.length) {
        const deleteOffset = nextStart - lastStart;
        last[4] = lastInsert.slice(0, deleteOffset) + lastInsert.slice(deleteOffset + nextDeleteCount);
        if (last[4] === '')
            out.pop();
        return true;
    }
    return false;
}
function mergeStringCopy(last, next) {
    const lastTargetStart = last[2];
    const lastSourceStart = last[3];
    const lastLength = last[4];
    const nextTargetStart = next[2];
    const nextSourceStart = next[3];
    const nextLength = next[4];
    if (nextTargetStart === lastTargetStart + lastLength &&
        nextSourceStart === lastSourceStart + lastLength &&
        lastSourceStart + lastLength <= lastTargetStart &&
        nextSourceStart + nextLength <= lastTargetStart) {
        last[4] = lastLength + nextLength;
        return true;
    }
    return false;
}
function extractCheapestEquivalentPatch(patch) {
    if (patch.length < 2)
        return patch;
    let changed = false;
    const out = [];
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op[0] === OP_ARRAY_ASSIGN) {
            const extracted = extractArrayAssignRun(patch, i);
            if (extracted !== null) {
                out[out.length] = extracted.op;
                i = extracted.end - 1;
                changed = true;
                continue;
            }
        }
        else if (op[0] === OP_ARRAY_OBJECT_ASSIGN) {
            const extracted = extractArrayObjectAssignRun(patch, i);
            if (extracted !== null) {
                out[out.length] = extracted.op;
                i = extracted.end - 1;
                changed = true;
                continue;
            }
        }
        else if (op[0] === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
            const extracted = extractArrayObjectFieldAssignRun(patch, i);
            if (extracted !== null) {
                out[out.length] = extracted.op;
                i = extracted.end - 1;
                changed = true;
                continue;
            }
        }
        out[out.length] = op;
    }
    return changed ? out : patch;
}
function extractArrayAssignRun(patch, start) {
    const first = patch[start];
    const path = first[1];
    const firstIndexes = first[2];
    const firstValues = first[3];
    if (firstIndexes.length !== firstValues.length)
        return null;
    let end = start + 1;
    let indexes = firstIndexes;
    let values = firstValues;
    let total = firstIndexes.length;
    let lastIndex = total === 0 ? -1 : firstIndexes[total - 1];
    let needsCompaction = firstIndexes.length > 1 && !isStrictlyIncreasingIndexes(firstIndexes);
    while (end < patch.length) {
        const next = patch[end];
        if (next[0] !== OP_ARRAY_ASSIGN || !samePath(path, next[1]))
            break;
        const nextIndexes = next[2];
        const nextValues = next[3];
        if (nextIndexes.length !== nextValues.length)
            break;
        if ((nextIndexes.length > 1 && !isStrictlyIncreasingIndexes(nextIndexes)) ||
            (total !== 0 && nextIndexes.length !== 0 && nextIndexes[0] <= lastIndex)) {
            needsCompaction = true;
        }
        if (indexes === firstIndexes) {
            indexes = firstIndexes.slice();
            values = firstValues.slice();
        }
        appendValues(indexes, nextIndexes);
        appendValues(values, nextValues);
        total += nextIndexes.length;
        if (nextIndexes.length !== 0)
            lastIndex = nextIndexes[nextIndexes.length - 1];
        end++;
    }
    if (needsCompaction) {
        const compacted = makeLastWriteArrayAssign(path, indexes, values);
        if (compacted !== null)
            return { end, op: compacted };
    }
    if (end > start + 1)
        return { end, op: [OP_ARRAY_ASSIGN, path, indexes, values] };
    return null;
}
function extractArrayObjectAssignRun(patch, start) {
    const first = patch[start];
    const path = first[1];
    const firstIndexes = first[2];
    const firstAssigns = first[3];
    if (!isStrictlyIncreasingIndexes(firstIndexes) || firstIndexes.length !== firstAssigns.length)
        return null;
    let end = start + 1;
    let indexes = firstIndexes;
    let assigns = firstAssigns;
    let lastIndex = firstIndexes.length === 0 ? -1 : firstIndexes[firstIndexes.length - 1];
    while (end < patch.length) {
        const next = patch[end];
        if (next[0] !== OP_ARRAY_OBJECT_ASSIGN || !samePath(path, next[1]))
            break;
        const nextIndexes = next[2];
        const nextAssigns = next[3];
        if (nextIndexes.length !== nextAssigns.length ||
            nextIndexes.length === 0 ||
            nextIndexes[0] <= lastIndex ||
            !isStrictlyIncreasingIndexes(nextIndexes)) {
            break;
        }
        if (indexes === firstIndexes) {
            indexes = firstIndexes.slice();
            assigns = firstAssigns.slice();
        }
        appendValues(indexes, nextIndexes);
        appendValues(assigns, nextAssigns);
        lastIndex = nextIndexes[nextIndexes.length - 1];
        end++;
    }
    if (indexes.length >= ARRAY_OBJECT_ASSIGN_FIELD_MIN_ROWS) {
        const fieldOp = makeArrayObjectFieldAssign(path, indexes, assigns);
        if (fieldOp !== null)
            return { end, op: fieldOp };
    }
    if (end > start + 1)
        return { end, op: [OP_ARRAY_OBJECT_ASSIGN, path, indexes, assigns] };
    return null;
}
function extractArrayObjectFieldAssignRun(patch, start) {
    const first = patch[start];
    const path = first[1];
    const fields = first[3];
    const firstIndexes = first[2];
    if (first[4].length !== firstIndexes.length * fields.length)
        return null;
    let end = start + 1;
    let indexes = firstIndexes;
    let values = first[4];
    let total = firstIndexes.length;
    let lastIndex = total === 0 ? -1 : firstIndexes[total - 1];
    let needsCompaction = firstIndexes.length > 1 && !isStrictlyIncreasingIndexes(firstIndexes);
    while (end < patch.length) {
        const next = patch[end];
        if (next[0] !== OP_ARRAY_OBJECT_FIELD_ASSIGN ||
            !samePath(path, next[1]) ||
            !sameFieldPaths(fields, next[3])) {
            break;
        }
        const nextIndexes = next[2];
        if (next[4].length !== nextIndexes.length * fields.length) {
            break;
        }
        if ((nextIndexes.length > 1 && !isStrictlyIncreasingIndexes(nextIndexes)) ||
            (total !== 0 && nextIndexes.length !== 0 && nextIndexes[0] <= lastIndex)) {
            needsCompaction = true;
        }
        if (indexes === firstIndexes) {
            indexes = firstIndexes.slice();
            values = first[4].slice();
        }
        appendValues(indexes, nextIndexes);
        appendValues(values, next[4]);
        total += nextIndexes.length;
        if (nextIndexes.length !== 0)
            lastIndex = nextIndexes[nextIndexes.length - 1];
        end++;
    }
    if (needsCompaction) {
        const compacted = makeLastWriteArrayObjectFieldAssign(path, indexes, fields, values);
        if (compacted !== null)
            return { end, op: compacted };
    }
    if (end > start + 1)
        return { end, op: [OP_ARRAY_OBJECT_FIELD_ASSIGN, path, indexes, fields, values] };
    return null;
}
function makeLastWriteArrayAssign(path, indexes, values) {
    if (indexes.length === 0)
        return null;
    const dense = makeDenseLastWriteArrayAssign(path, indexes, values);
    if (dense !== null)
        return dense;
    const latest = new Map();
    for (let i = 0, length = indexes.length; i < length; i++) {
        latest.set(indexes[i], values[i]);
    }
    const sortedIndexes = Array.from(latest.keys()).sort(compareNumbers);
    const sortedValues = new Array(sortedIndexes.length);
    for (let i = 0, length = sortedIndexes.length; i < length; i++) {
        sortedValues[i] = latest.get(sortedIndexes[i]);
    }
    return [OP_ARRAY_ASSIGN, path, sortedIndexes, sortedValues];
}
function makeLastWriteArrayObjectFieldAssign(path, indexes, fields, values) {
    if (indexes.length === 0 || fields.length === 0)
        return null;
    const fieldCount = fields.length;
    const dense = makeDenseLastWriteArrayObjectFieldAssign(path, indexes, fields, values, fieldCount);
    if (dense !== null)
        return dense;
    const latestOffset = new Map();
    for (let i = 0, length = indexes.length; i < length; i++) {
        latestOffset.set(indexes[i], i * fieldCount);
    }
    const sortedIndexes = Array.from(latestOffset.keys()).sort(compareNumbers);
    const sortedValues = new Array(sortedIndexes.length * fieldCount);
    let write = 0;
    for (let row = 0, rowCount = sortedIndexes.length; row < rowCount; row++) {
        const offset = latestOffset.get(sortedIndexes[row]);
        for (let field = 0; field < fieldCount; field++) {
            sortedValues[write++] = values[offset + field];
        }
    }
    return [OP_ARRAY_OBJECT_FIELD_ASSIGN, path, sortedIndexes, fields, sortedValues];
}
function makeDenseLastWriteArrayAssign(path, indexes, values) {
    const range = readCompactIndexRange(indexes);
    if (range === null)
        return null;
    const span = range.max - range.min + 1;
    const seen = new Uint8Array(span);
    const latestValues = new Array(span);
    let unique = 0;
    for (let i = 0, length = indexes.length; i < length; i++) {
        const offset = indexes[i] - range.min;
        if (seen[offset] === 0) {
            seen[offset] = 1;
            unique++;
        }
        latestValues[offset] = values[i];
    }
    const sortedIndexes = new Array(unique);
    const sortedValues = new Array(unique);
    let write = 0;
    for (let offset = 0; offset < span; offset++) {
        if (seen[offset] !== 0) {
            sortedIndexes[write] = range.min + offset;
            sortedValues[write] = latestValues[offset];
            write++;
        }
    }
    return [OP_ARRAY_ASSIGN, path, sortedIndexes, sortedValues];
}
function makeDenseLastWriteArrayObjectFieldAssign(path, indexes, fields, values, fieldCount) {
    const range = readCompactIndexRange(indexes);
    if (range === null)
        return null;
    const span = range.max - range.min + 1;
    const seen = new Uint8Array(span);
    const latestOffsets = new Array(span);
    let unique = 0;
    for (let i = 0, length = indexes.length; i < length; i++) {
        const offset = indexes[i] - range.min;
        if (seen[offset] === 0) {
            seen[offset] = 1;
            unique++;
        }
        latestOffsets[offset] = i * fieldCount;
    }
    const sortedIndexes = new Array(unique);
    const sortedValues = new Array(unique * fieldCount);
    let rowWrite = 0;
    let valueWrite = 0;
    for (let offset = 0; offset < span; offset++) {
        if (seen[offset] !== 0) {
            sortedIndexes[rowWrite++] = range.min + offset;
            const valueOffset = latestOffsets[offset];
            for (let field = 0; field < fieldCount; field++) {
                sortedValues[valueWrite++] = values[valueOffset + field];
            }
        }
    }
    return [OP_ARRAY_OBJECT_FIELD_ASSIGN, path, sortedIndexes, fields, sortedValues];
}
function readCompactIndexRange(indexes) {
    let min = indexes[0];
    let max = indexes[0];
    for (let i = 1, length = indexes.length; i < length; i++) {
        const index = indexes[i];
        if (index < min)
            min = index;
        else if (index > max)
            max = index;
    }
    const span = max - min + 1;
    return span <= DENSE_INDEX_COMPACTION_MAX_SPAN && span <= indexes.length * DENSE_INDEX_COMPACTION_FACTOR
        ? { min, max }
        : null;
}
function makeArrayObjectFieldAssign(path, indexes, assigns) {
    const firstAssign = assigns[0];
    if (!isPlainRecord(firstAssign))
        return null;
    const keys = Object.keys(firstAssign);
    const fieldCount = keys.length;
    if (fieldCount === 0 || fieldCount > ARRAY_OBJECT_ASSIGN_FIELD_MAX_FIELDS)
        return null;
    const values = [];
    for (let row = 0, rowCount = assigns.length; row < rowCount; row++) {
        const assign = assigns[row];
        if (!isPlainRecord(assign) || !hasExactOwnKeys(assign, keys, fieldCount))
            return null;
        for (let field = 0; field < fieldCount; field++) {
            values[values.length] = assign[keys[field]];
        }
    }
    const fields = new Array(fieldCount);
    for (let field = 0; field < fieldCount; field++)
        fields[field] = [keys[field]];
    return [OP_ARRAY_OBJECT_FIELD_ASSIGN, path, indexes, fields, values];
}
function isPlainRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hasExactOwnKeys(value, keys, length) {
    let count = 0;
    for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key))
            continue;
        count++;
        let matched = false;
        for (let i = 0; i < length; i++) {
            if (keys[i] === key) {
                matched = true;
                break;
            }
        }
        if (!matched)
            return false;
    }
    return count === length;
}
function isStrictlyIncreasingIndexes(indexes) {
    for (let i = 1, length = indexes.length; i < length; i++) {
        if (indexes[i] <= indexes[i - 1])
            return false;
    }
    return true;
}
function compareNumbers(left, right) {
    return left - right;
}
function sameFieldPaths(left, right) {
    if (left.length !== right.length)
        return false;
    for (let i = 0, length = left.length; i < length; i++) {
        if (!samePath(left[i], right[i]))
            return false;
    }
    return true;
}
function samePath(left, right, length) {
    if (length === undefined) {
        if (left.length !== right.length)
            return false;
        length = left.length;
    }
    else if (left.length < length || right.length < length) {
        return false;
    }
    for (let i = 0; i < length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}
//# sourceMappingURL=normalize.js.map