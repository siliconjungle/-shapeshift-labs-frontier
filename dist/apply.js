import { OP_SET, OP_REMOVE, OP_TRUNCATE, OP_APPEND, OP_ASSIGN, OP_STRING_SPLICE, OP_ARRAY_SPLICE, OP_ARRAY_MOVE, OP_STRING_COPY, OP_ARRAY_ASSIGN, OP_ARRAY_OBJECT_ASSIGN, OP_ARRAY_TUPLE_ASSIGN, OP_ARRAY_OBJECT_FIELD_ASSIGN, OP_SCALAR_ARRAY_REPLACE, OP_ARRAY_TWO_FIELD_INSERT } from './constants.js';
import { setOwnValue } from './object.js';
const NO_IMMUTABLE_FAST_PATH = Symbol('noImmutableFastPath');
const NO_MUTABLE_FAST_PATH = Symbol('noMutableFastPath');
const NO_OBJECT_FIELD_APPLY_PLAN = Symbol('noObjectFieldApplyPlan');
const LONG_EQUAL_ARRAY_SPLICE_VALUE_COUNT = 256;
const ROOT_ARRAY_FAST_PATCH_MAX = 256;
const SAME_PARENT_SET_FAST_PATH_MIN_LENGTH = 8;
const hasOwn = Object.prototype.hasOwnProperty;
const objectFieldApplyPlanCache = new WeakMap();
export function applyPatch(value, patch, options) {
    const cloneValues = !!(options && options.cloneValues);
    if (typeof value === 'string') {
        const fastString = applyRootStringPatchFast(value, patch);
        if (fastString !== NO_MUTABLE_FAST_PATH)
            return fastString;
    }
    if (!cloneValues && patch.length === 1) {
        const fast = applySingleMutableFastPath(value, patch[0]);
        if (fast !== NO_MUTABLE_FAST_PATH)
            return fast;
    }
    if (!cloneValues && patch.length >= SAME_PARENT_SET_FAST_PATH_MIN_LENGTH) {
        const fast = applySameParentSetMutableFastPath(value, patch);
        if (fast !== NO_MUTABLE_FAST_PATH)
            return fast;
    }
    let root = value;
    const usePrefixCache = patch.length >= 8;
    let cachedPath = null;
    let cachedDepth = -1;
    let cachedValue = null;
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const code = op[0];
        const path = op[1];
        if (code === OP_SET) {
            const value = op[2];
            const nextValue = cloneValues ? clonePatchValue(value) : value;
            if (path.length === 0) {
                root = nextValue;
                invalidatePrefixCache();
            }
            else {
                const parent = parentAtFast(path);
                assignOwnValue(parent, path[path.length - 1], nextValue);
            }
        }
        else if (code === OP_SCALAR_ARRAY_REPLACE) {
            const nextValue = op[2].slice();
            if (path.length === 0) {
                root = nextValue;
                invalidatePrefixCache();
            }
            else {
                const parent = parentAtFast(path);
                assignOwnValue(parent, path[path.length - 1], nextValue);
            }
        }
        else if (code === OP_REMOVE) {
            if (path.length === 0) {
                throw new TypeError('cannot remove the root value');
            }
            const parent = parentAtFast(path);
            delete parent[path[path.length - 1]];
        }
        else if (code === OP_TRUNCATE) {
            const array = targetAtFast(path);
            array.length = op[2];
        }
        else if (code === OP_APPEND) {
            const array = targetAtFast(path);
            const values = op[2];
            const offset = array.length;
            if (cloneValues) {
                for (let j = 0, valueCount = values.length; j < valueCount; j++) {
                    array[offset + j] = clonePatchValue(values[j]);
                }
            }
            else {
                for (let j = 0, valueCount = values.length; j < valueCount; j++) {
                    array[offset + j] = values[j];
                }
            }
        }
        else if (code === OP_ARRAY_SPLICE) {
            const array = targetAtFast(path);
            applyArraySplice(array, op[2], op[3], op[4], cloneValues);
        }
        else if (code === OP_ARRAY_TWO_FIELD_INSERT) {
            const array = targetAtFast(path);
            applyArrayTwoFieldInsert(array, op[2], op[3], op[4], op[5], op[6]);
        }
        else if (code === OP_ARRAY_MOVE) {
            const array = targetAtFast(path);
            applyArrayMove(array, op[2], op[3]);
        }
        else if (code === OP_ARRAY_ASSIGN) {
            const array = targetAtFast(path);
            assignArrayValues(array, op[2], op[3], cloneValues);
        }
        else if (code === OP_ARRAY_OBJECT_ASSIGN) {
            const array = targetAtFast(path);
            assignArrayObjectValues(array, op[2], op[3], cloneValues);
        }
        else if (code === OP_ARRAY_TUPLE_ASSIGN) {
            const array = targetAtFast(path);
            assignArrayTupleValues(array, op[2], op[3], op[4], cloneValues);
        }
        else if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
            const array = targetAtFast(path);
            assignArrayObjectFieldValues(array, op[2], op[3], op[4], cloneValues);
        }
        else if (code === OP_ASSIGN) {
            const object = targetAtFast(path);
            assignValues(object, op[2], cloneValues);
        }
        else if (code === OP_STRING_SPLICE) {
            if (op[3] === 0 &&
                i + 1 < length &&
                patch[i + 1][0] === OP_STRING_SPLICE &&
                patch[i + 1][3] === 0 &&
                samePath(path, patch[i + 1][1])) {
                const runEnd = stringInsertionRunEnd(patch, i, path);
                if (path.length === 0) {
                    const nextValue = applyStringInsertionRun(root, patch, i, runEnd);
                    if (nextValue !== null) {
                        root = nextValue;
                        invalidatePrefixCache();
                        i = runEnd - 1;
                        continue;
                    }
                }
                else {
                    const parent = parentAtFast(path);
                    const key = path[path.length - 1];
                    const nextValue = applyStringInsertionRun(parent[key], patch, i, runEnd);
                    if (nextValue !== null) {
                        assignOwnValue(parent, key, nextValue);
                        i = runEnd - 1;
                        continue;
                    }
                }
            }
            if (path.length === 0) {
                root = spliceString(root, op);
                invalidatePrefixCache();
            }
            else {
                const parent = parentAtFast(path);
                assignOwnValue(parent, path[path.length - 1], spliceString(parent[path[path.length - 1]], op));
            }
        }
        else if (code === OP_STRING_COPY) {
            if (path.length === 0) {
                root = copyString(root, op);
                invalidatePrefixCache();
            }
            else {
                const parent = parentAtFast(path);
                assignOwnValue(parent, path[path.length - 1], copyString(parent[path[path.length - 1]], op));
            }
        }
        else {
            throw new TypeError('unknown patch opcode: ' + code);
        }
    }
    return root;
    function parentAtFast(path) {
        return usePrefixCache ? valueAtDepthCached(path, path.length - 1) : parentAt(root, path);
    }
    function targetAtFast(path) {
        return path.length === 0
            ? root
            : usePrefixCache
                ? valueAtDepthCached(path, path.length)
                : parentAt(root, path)[path[path.length - 1]];
    }
    function valueAtDepthCached(path, depth) {
        if (cachedPath !== null &&
            cachedDepth === depth &&
            samePathPrefix(cachedPath, path, depth)) {
            return cachedValue;
        }
        const nextValue = valueAtDepth(root, path, depth);
        cachedPath = path;
        cachedDepth = depth;
        cachedValue = nextValue;
        return nextValue;
    }
    function invalidatePrefixCache() {
        cachedPath = null;
        cachedDepth = -1;
        cachedValue = null;
    }
}
function applySingleMutableFastPath(root, op) {
    const path = op[1];
    const code = op[0];
    if (code === OP_SET) {
        if (path.length === 0)
            return op[2];
        const parent = parentAt(root, path);
        assignOwnValue(parent, path[path.length - 1], op[2]);
        return root;
    }
    if (code === OP_SCALAR_ARRAY_REPLACE) {
        const nextValue = op[2].slice();
        if (path.length === 0)
            return nextValue;
        const parent = parentAt(root, path);
        assignOwnValue(parent, path[path.length - 1], nextValue);
        return root;
    }
    if (code === OP_ASSIGN) {
        assignValues(targetAt(root, path), op[2], false);
        return root;
    }
    if (code === OP_ARRAY_ASSIGN) {
        assignArrayValues(targetAt(root, path), op[2], op[3], false);
        return root;
    }
    if (code === OP_ARRAY_TWO_FIELD_INSERT) {
        applyArrayTwoFieldInsert(targetAt(root, path), op[2], op[3], op[4], op[5], op[6]);
        return root;
    }
    if (code === OP_ARRAY_OBJECT_ASSIGN) {
        assignArrayObjectValues(targetAt(root, path), op[2], op[3], false);
        return root;
    }
    if (code === OP_ARRAY_TUPLE_ASSIGN) {
        assignArrayTupleValues(targetAt(root, path), op[2], op[3], op[4], false);
        return root;
    }
    if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
        assignArrayObjectFieldValues(targetAt(root, path), op[2], op[3], op[4], false);
        return root;
    }
    return NO_MUTABLE_FAST_PATH;
}
function applySameParentSetMutableFastPath(root, patch) {
    const first = patch[0];
    if (first[0] !== OP_SET)
        return NO_MUTABLE_FAST_PATH;
    const firstPath = first[1];
    const pathLength = firstPath.length;
    if (pathLength === 0 || pathLength > 128)
        return NO_MUTABLE_FAST_PATH;
    const parentDepth = pathLength - 1;
    const last = patch[patch.length - 1];
    const lastPath = last[1];
    if (last[0] !== OP_SET ||
        lastPath.length !== pathLength ||
        !samePathPrefix(firstPath, lastPath, parentDepth)) {
        return NO_MUTABLE_FAST_PATH;
    }
    for (let i = 1, length = patch.length - 1; i < length; i++) {
        const op = patch[i];
        const path = op[1];
        if (op[0] !== OP_SET ||
            path.length !== pathLength ||
            !samePathPrefix(firstPath, path, parentDepth)) {
            return NO_MUTABLE_FAST_PATH;
        }
    }
    const parent = valueAtDepth(root, firstPath, parentDepth);
    if (parent === null || typeof parent !== 'object')
        return NO_MUTABLE_FAST_PATH;
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        assignOwnValue(parent, op[1][parentDepth], op[2]);
    }
    return root;
}
export function applyPatchImmutable(value, patch) {
    const length = patch.length;
    if (length === 0)
        return value;
    if (length === 1 &&
        patch[0][0] === OP_SET &&
        patch[0][1].length === 0) {
        const value = patch[0][2];
        return value === null || typeof value !== 'object' ? value : clonePatchValue(value);
    }
    if (length === 1 && patch[0][0] === OP_SCALAR_ARRAY_REPLACE) {
        const op = patch[0];
        if (op[1].length === 0)
            return op[2].slice();
        if (value !== null && typeof value === 'object') {
            const replaced = applySingleScalarArrayReplacePathCopy(value, op[1], op[2]);
            if (replaced !== NO_IMMUTABLE_FAST_PATH)
                return replaced;
        }
    }
    if (typeof value === 'string') {
        const fastString = applyRootStringPatchFast(value, patch);
        if (fastString !== NO_MUTABLE_FAST_PATH)
            return fastString;
    }
    if (length === 1 &&
        patch[0][0] === OP_ARRAY_MOVE &&
        patch[0][1].length === 0 &&
        Array.isArray(value)) {
        const root = value.slice();
        const from = patch[0][2];
        const to = patch[0][3];
        if (from !== to) {
            const moved = root[from];
            root.splice(from, 1);
            root.splice(to, 0, moved);
        }
        return root;
    }
    if (length === 1 && Array.isArray(value) && patch[0][1].length === 0) {
        const fastRootArray = applySingleRootArrayOpImmutable(value, patch[0]);
        if (fastRootArray !== NO_IMMUTABLE_FAST_PATH)
            return fastRootArray;
    }
    if (length > 1 && length <= 16 && Array.isArray(value)) {
        const removeMoveInsertSet = applyRootArrayRemoveMoveInsertSetPatchImmutable(value, patch);
        if (removeMoveInsertSet !== NO_IMMUTABLE_FAST_PATH)
            return removeMoveInsertSet;
        const removeInsertSet = applyRootArrayRemoveTwoFieldInsertSetPatchImmutable(value, patch);
        if (removeInsertSet !== NO_IMMUTABLE_FAST_PATH)
            return removeInsertSet;
        const twoSplicesSet = applyRootArrayTwoSplicesSetPatchImmutable(value, patch);
        if (twoSplicesSet !== NO_IMMUTABLE_FAST_PATH)
            return twoSplicesSet;
        const smallInsert = applyRootArraySmallInsertPatchImmutable(value, patch);
        if (smallInsert !== NO_IMMUTABLE_FAST_PATH)
            return smallInsert;
        const fast = applyRootArrayPatchImmutableFast(value, patch);
        if (fast !== NO_IMMUTABLE_FAST_PATH)
            return fast;
    }
    if (length > 16 &&
        length <= ROOT_ARRAY_FAST_PATCH_MAX &&
        Array.isArray(value) &&
        canApplyRootArrayPatchImmutableFast(patch)) {
        const fast = applyRootArrayPatchImmutableFast(value, patch);
        if (fast !== NO_IMMUTABLE_FAST_PATH)
            return fast;
    }
    if (length === 1 &&
        patch[0][0] === OP_SET &&
        patch[0][1].length <= 128 &&
        value !== null &&
        typeof value === 'object') {
        return applySingleSetPathCopy(value, patch[0][1], patch[0][2]);
    }
    if (length === 1 && value !== null && typeof value === 'object') {
        const fast = applySingleCompactPathCopy(value, patch[0]);
        if (fast !== NO_IMMUTABLE_FAST_PATH)
            return fast;
    }
    if (length > 1 && value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const rootObjectFast = applyRootObjectRemoveAssignPatchImmutable(value, patch);
        if (rootObjectFast !== NO_IMMUTABLE_FAST_PATH)
            return rootObjectFast;
    }
    if (length >= 8 && value !== null && typeof value === 'object') {
        const sameParentSetRemove = applySameParentSetRemovePatchImmutable(value, patch);
        if (sameParentSetRemove !== NO_IMMUTABLE_FAST_PATH)
            return sameParentSetRemove;
        const sameParentAssign = applySameParentAssignPatchImmutable(value, patch);
        if (sameParentAssign !== NO_IMMUTABLE_FAST_PATH)
            return sameParentAssign;
    }
    if (length > 1 && value !== null && typeof value === 'object') {
        const sameArraySplicePath = applySameArraySplicePathImmutable(value, patch);
        if (sameArraySplicePath !== NO_IMMUTABLE_FAST_PATH)
            return sameArraySplicePath;
    }
    if (!shouldUsePathCopy(value, patch)) {
        return applyPatch(clonePatchValue(value), patch, { cloneValues: true });
    }
    return applyPatchPathCopy(value, patch);
}
function applyRootStringPatchFast(value, patch) {
    if (patch.length === 2) {
        const rotated = applyRootStringRotationPatchFast(value, patch);
        if (rotated !== NO_MUTABLE_FAST_PATH)
            return rotated;
    }
    if (patch.length > 1) {
        const equalWidthReplacements = applyRootStringEqualWidthReplacementRun(value, patch);
        if (equalWidthReplacements !== NO_MUTABLE_FAST_PATH)
            return equalWidthReplacements;
    }
    if (patch.length > 1 &&
        patch[0][0] === OP_STRING_SPLICE &&
        patch[0][1].length === 0 &&
        patch[0][3] === 0) {
        const runEnd = stringInsertionRunEnd(patch, 0, []);
        if (runEnd === patch.length) {
            const inserted = applyStringInsertionRun(value, patch, 0, runEnd);
            if (inserted !== null)
                return inserted;
        }
    }
    let root = value;
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op[1].length !== 0)
            return NO_MUTABLE_FAST_PATH;
        const code = op[0];
        if (code === OP_STRING_SPLICE) {
            root = spliceString(root, op);
        }
        else if (code === OP_STRING_COPY) {
            root = copyString(root, op);
        }
        else if (code === OP_SET && i === 0 && length === 1) {
            return op[2];
        }
        else {
            return NO_MUTABLE_FAST_PATH;
        }
    }
    return root;
}
function applyRootStringEqualWidthReplacementRun(value, patch) {
    let cursor = 0;
    let out = '';
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op[0] !== OP_STRING_SPLICE || op[1].length !== 0 || op[3] !== op[4].length) {
            return NO_MUTABLE_FAST_PATH;
        }
        const start = op[2];
        const deleteCount = op[3];
        if (start < cursor)
            return NO_MUTABLE_FAST_PATH;
        out += value.slice(cursor, start) + op[4];
        cursor = start + deleteCount;
    }
    return out + value.slice(cursor);
}
function applySingleScalarArrayReplacePathCopy(originalRoot, path, values) {
    if (path.length === 0)
        return values.slice();
    if (path.length > 128)
        return NO_IMMUTABLE_FAST_PATH;
    const parentPath = path.slice(0, path.length - 1);
    const cloned = cloneContainerPathForSingle(originalRoot, parentPath);
    if (cloned === null)
        return NO_IMMUTABLE_FAST_PATH;
    assignChild(cloned[1], path[path.length - 1], values.slice());
    return cloned[0];
}
function applyRootStringRotationPatchFast(value, patch) {
    const copy = patch[0];
    const splice = patch[1];
    if (copy[0] !== OP_STRING_COPY ||
        splice[0] !== OP_STRING_SPLICE ||
        copy[1].length !== 0 ||
        splice[1].length !== 0 ||
        splice[4] !== '') {
        return NO_MUTABLE_FAST_PATH;
    }
    const copyTarget = copy[2];
    const copySource = copy[3];
    const copyLength = copy[4];
    const spliceStart = splice[2];
    const deleteCount = splice[3];
    if (copySource === spliceStart &&
        copyLength === deleteCount &&
        copyTarget >= spliceStart + deleteCount) {
        return value.slice(0, spliceStart) +
            value.slice(spliceStart + deleteCount, copyTarget) +
            value.slice(spliceStart, spliceStart + deleteCount) +
            value.slice(copyTarget);
    }
    if (copyTarget < copySource &&
        spliceStart === copySource + copyLength &&
        deleteCount === copyLength) {
        return value.slice(0, copyTarget) +
            value.slice(copySource, copySource + copyLength) +
            value.slice(copyTarget, copySource) +
            value.slice(spliceStart);
    }
    return NO_MUTABLE_FAST_PATH;
}
function applyRootObjectRemoveAssignPatchImmutable(originalRoot, patch) {
    const length = patch.length;
    const last = patch[length - 1];
    if (last[0] !== OP_ASSIGN || last[1].length !== 0)
        return NO_IMMUTABLE_FAST_PATH;
    for (let i = 0; i < length - 1; i++) {
        const op = patch[i];
        const path = op[1];
        if (op[0] !== OP_REMOVE || path.length !== 1)
            return NO_IMMUTABLE_FAST_PATH;
    }
    const root = shallowCloneContainer(originalRoot);
    for (let i = 0; i < length - 1; i++) {
        delete root[patch[i][1][0]];
    }
    assignValues(root, last[2], true);
    return root;
}
function shouldUsePathCopy(root, patch) {
    if (root === null || typeof root !== 'object')
        return false;
    for (let i = 0, length = patch.length; i < length; i++) {
        const path = patch[i][1];
        if (path.length === 0 && patch[i][0] === OP_SET)
            return false;
        if (path.length > 128)
            return false;
    }
    return true;
}
function applyPatchPathCopy(originalRoot, patch) {
    let root = originalRoot;
    const cloned = [null, null];
    let clonedContainers = null;
    let structuralArrays = null;
    function enableStructuralTracking() {
        if (clonedContainers !== null)
            return;
        clonedContainers = new WeakSet();
        structuralArrays = new WeakSet();
        if (root !== null && typeof root === 'object')
            clonedContainers.add(root);
    }
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const code = op[0];
        const path = op[1];
        if (code === OP_SET) {
            const nextValue = clonePatchValue(op[2]);
            if (path.length === 0) {
                root = nextValue;
            }
            else {
                clonePath(root, originalRoot, path, path.length - 1, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                assignChild(cloned[1], path[path.length - 1], nextValue);
            }
        }
        else if (code === OP_SCALAR_ARRAY_REPLACE) {
            const nextValue = op[2].slice();
            if (path.length === 0) {
                root = nextValue;
            }
            else {
                clonePath(root, originalRoot, path, path.length - 1, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                assignChild(cloned[1], path[path.length - 1], nextValue);
            }
        }
        else if (code === OP_REMOVE) {
            if (path.length === 0) {
                throw new TypeError('cannot remove the root value');
            }
            clonePath(root, originalRoot, path, path.length - 1, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            delete cloned[1][path[path.length - 1]];
        }
        else if (code === OP_TRUNCATE) {
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            cloned[1].length = op[2];
        }
        else if (code === OP_APPEND) {
            if (path.length === 0 && Array.isArray(root)) {
                if (root === originalRoot) {
                    root = root.concat(clonePatchValues(op[2]));
                }
                else {
                    appendImmutableValues(root, op[2]);
                }
            }
            else {
                clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                appendImmutableValues(cloned[1], op[2]);
            }
        }
        else if (code === OP_ARRAY_SPLICE) {
            if (op[3] !== op[4].length)
                enableStructuralTracking();
            if (path.length === 0 && Array.isArray(root)) {
                if (root === originalRoot) {
                    root = applyRootArraySpliceImmutable(root, op[2], op[3], op[4]);
                    if (clonedContainers !== null)
                        clonedContainers.add(root);
                }
                else {
                    applyArraySplice(root, op[2], op[3], op[4], true);
                }
                if (op[3] !== op[4].length)
                    structuralArrays.add(root);
            }
            else {
                clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                applyArraySplice(cloned[1], op[2], op[3], op[4], true);
                if (op[3] !== op[4].length)
                    structuralArrays.add(cloned[1]);
            }
        }
        else if (code === OP_ARRAY_TWO_FIELD_INSERT) {
            enableStructuralTracking();
            if (path.length === 0 && Array.isArray(root)) {
                if (root === originalRoot) {
                    root = applyRootArrayTwoFieldInsertImmutable(root, op[2], op[3], op[4], op[5], op[6]);
                    if (clonedContainers !== null)
                        clonedContainers.add(root);
                }
                else {
                    applyArrayTwoFieldInsert(root, op[2], op[3], op[4], op[5], op[6]);
                }
                structuralArrays.add(root);
            }
            else {
                clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                applyArrayTwoFieldInsert(cloned[1], op[2], op[3], op[4], op[5], op[6]);
                structuralArrays.add(cloned[1]);
            }
        }
        else if (code === OP_ARRAY_MOVE) {
            enableStructuralTracking();
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            applyArrayMove(cloned[1], op[2], op[3]);
            structuralArrays.add(cloned[1]);
        }
        else if (code === OP_ARRAY_ASSIGN) {
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            assignArrayValues(cloned[1], op[2], op[3], true);
        }
        else if (code === OP_ARRAY_OBJECT_ASSIGN) {
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            assignArrayObjectValuesImmutable(cloned[1], op[2], op[3]);
        }
        else if (code === OP_ARRAY_TUPLE_ASSIGN) {
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            assignArrayTupleValuesImmutable(cloned[1], op[2], op[3], op[4]);
        }
        else if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            assignArrayObjectFieldValuesImmutable(cloned[1], op[2], op[3], op[4]);
        }
        else if (code === OP_ASSIGN) {
            clonePath(root, originalRoot, path, path.length, cloned, clonedContainers, structuralArrays);
            root = cloned[0];
            assignValues(cloned[1], op[2], true);
        }
        else if (code === OP_STRING_SPLICE) {
            if (op[3] === 0 &&
                i + 1 < length &&
                patch[i + 1][0] === OP_STRING_SPLICE &&
                patch[i + 1][3] === 0 &&
                samePath(path, patch[i + 1][1])) {
                const runEnd = stringInsertionRunEnd(patch, i, path);
                if (path.length === 0) {
                    const nextValue = applyStringInsertionRun(root, patch, i, runEnd);
                    if (nextValue !== null) {
                        root = nextValue;
                        i = runEnd - 1;
                        continue;
                    }
                }
                else {
                    const key = path[path.length - 1];
                    const currentParent = parentAt(root, path);
                    const nextValue = applyStringInsertionRun(currentParent[key], patch, i, runEnd);
                    if (nextValue !== null) {
                        clonePath(root, originalRoot, path, path.length - 1, cloned, clonedContainers, structuralArrays);
                        root = cloned[0];
                        assignChild(cloned[1], key, nextValue);
                        i = runEnd - 1;
                        continue;
                    }
                }
            }
            if (path.length === 0) {
                root = spliceString(root, op);
            }
            else {
                clonePath(root, originalRoot, path, path.length - 1, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                assignChild(cloned[1], path[path.length - 1], spliceString(cloned[1][path[path.length - 1]], op));
            }
        }
        else if (code === OP_STRING_COPY) {
            if (path.length === 0) {
                root = copyString(root, op);
            }
            else {
                clonePath(root, originalRoot, path, path.length - 1, cloned, clonedContainers, structuralArrays);
                root = cloned[0];
                assignChild(cloned[1], path[path.length - 1], copyString(cloned[1][path[path.length - 1]], op));
            }
        }
        else {
            throw new TypeError('unknown patch opcode: ' + code);
        }
    }
    return root;
}
function clonePath(root, originalRoot, path, depth, out, clonedContainers, structuralArrays) {
    if (root === originalRoot) {
        root = shallowCloneContainer(originalRoot);
        if (clonedContainers !== null)
            clonedContainers.add(root);
    }
    let originalNode = originalRoot;
    let clonedNode = root;
    for (let i = 0; i < depth; i++) {
        const key = path[i];
        const originalChild = originalNode !== null && typeof originalNode === 'object'
            ? originalNode[key]
            : undefined;
        let clonedChild = clonedNode[key];
        if (clonedChild !== null &&
            typeof clonedChild === 'object' &&
            (clonedChild === originalChild ||
                (clonedContainers !== null &&
                    !clonedContainers.has(clonedChild) &&
                    ((Array.isArray(clonedNode) && structuralArrays.has(clonedNode)) ||
                        clonedContainers.has(clonedNode))))) {
            clonedChild = shallowCloneContainer(clonedChild);
            if (clonedContainers !== null)
                clonedContainers.add(clonedChild);
            assignChild(clonedNode, key, clonedChild);
        }
        originalNode = originalChild;
        clonedNode = clonedChild;
    }
    out[0] = root;
    out[1] = clonedNode;
}
function applySameArraySplicePathImmutable(originalRoot, patch) {
    const first = patch[0];
    if (first[0] !== OP_ARRAY_SPLICE)
        return NO_IMMUTABLE_FAST_PATH;
    const path = first[1];
    if (path.length > 128)
        return NO_IMMUTABLE_FAST_PATH;
    for (let i = 1, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op[0] !== OP_ARRAY_SPLICE || !samePath(path, op[1])) {
            return NO_IMMUTABLE_FAST_PATH;
        }
    }
    const cloned = cloneContainerPathForSingle(originalRoot, path);
    if (cloned === null || !Array.isArray(cloned[1]))
        return NO_IMMUTABLE_FAST_PATH;
    const array = cloned[1];
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        applyArraySplice(array, op[2], op[3], op[4], true);
    }
    return cloned[0];
}
function applySingleSetPathCopy(originalRoot, path, value) {
    const root = shallowCloneContainer(originalRoot);
    let originalNode = originalRoot;
    let clonedNode = root;
    const leafIndex = path.length - 1;
    for (let i = 0; i < leafIndex; i++) {
        const key = path[i];
        const originalChild = originalNode[key];
        const clonedChild = shallowCloneContainer(originalChild);
        assignChild(clonedNode, key, clonedChild);
        originalNode = originalChild;
        clonedNode = clonedChild;
    }
    assignChild(clonedNode, path[leafIndex], clonePatchValue(value));
    return root;
}
function applySingleCompactPathCopy(originalRoot, op) {
    const code = op[0];
    if (code !== OP_ASSIGN &&
        code !== OP_ARRAY_ASSIGN &&
        code !== OP_ARRAY_OBJECT_ASSIGN &&
        code !== OP_ARRAY_TUPLE_ASSIGN &&
        code !== OP_ARRAY_OBJECT_FIELD_ASSIGN &&
        code !== OP_ARRAY_TWO_FIELD_INSERT) {
        return NO_IMMUTABLE_FAST_PATH;
    }
    const path = op[1];
    if (path.length > 128)
        return NO_IMMUTABLE_FAST_PATH;
    const cloned = cloneContainerPathForSingle(originalRoot, path);
    if (cloned === null)
        return NO_IMMUTABLE_FAST_PATH;
    const target = cloned[1];
    if (code === OP_ASSIGN) {
        assignValues(target, op[2], true);
        return cloned[0];
    }
    if (!Array.isArray(target))
        return NO_IMMUTABLE_FAST_PATH;
    if (code === OP_ARRAY_ASSIGN) {
        assignArrayValuesImmutable(target, op[2], op[3]);
    }
    else if (code === OP_ARRAY_TWO_FIELD_INSERT) {
        applyArrayTwoFieldInsert(target, op[2], op[3], op[4], op[5], op[6]);
    }
    else if (code === OP_ARRAY_TUPLE_ASSIGN) {
        assignArrayTupleValuesImmutable(target, op[2], op[3], op[4]);
    }
    else if (code === OP_ARRAY_OBJECT_ASSIGN) {
        assignArrayObjectValuesImmutable(target, op[2], op[3]);
    }
    else {
        assignArrayObjectFieldValuesImmutable(target, op[2], op[3], op[4]);
    }
    return cloned[0];
}
function applySameParentSetRemovePatchImmutable(originalRoot, patch) {
    const first = patch[0];
    const firstCode = first[0];
    if (firstCode !== OP_SET && firstCode !== OP_REMOVE)
        return NO_IMMUTABLE_FAST_PATH;
    const firstPath = first[1];
    if (firstPath.length === 0 || firstPath.length > 128)
        return NO_IMMUTABLE_FAST_PATH;
    const depth = firstPath.length - 1;
    for (let i = 1, length = patch.length; i < length; i++) {
        const op = patch[i];
        const code = op[0];
        if (code !== OP_SET && code !== OP_REMOVE)
            return NO_IMMUTABLE_FAST_PATH;
        const path = op[1];
        if (path.length !== firstPath.length || !samePathPrefix(firstPath, path, depth)) {
            return NO_IMMUTABLE_FAST_PATH;
        }
    }
    const parentPath = depth === 0 ? [] : firstPath.slice(0, depth);
    const cloned = cloneContainerPathForSingle(originalRoot, parentPath);
    if (cloned === null)
        return NO_IMMUTABLE_FAST_PATH;
    const parent = cloned[1];
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const key = op[1][depth];
        if (op[0] === OP_SET) {
            assignChild(parent, key, clonePatchValue(op[2]));
        }
        else {
            delete parent[key];
        }
    }
    return cloned[0];
}
function applySameParentAssignPatchImmutable(originalRoot, patch) {
    const first = patch[0];
    if (first[0] !== OP_ASSIGN)
        return NO_IMMUTABLE_FAST_PATH;
    const firstPath = first[1];
    if (firstPath.length === 0 || firstPath.length > 128)
        return NO_IMMUTABLE_FAST_PATH;
    const depth = firstPath.length - 1;
    for (let i = 1, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op[0] !== OP_ASSIGN)
            return NO_IMMUTABLE_FAST_PATH;
        const path = op[1];
        if (path.length !== firstPath.length || !samePathPrefix(firstPath, path, depth)) {
            return NO_IMMUTABLE_FAST_PATH;
        }
    }
    const parentPath = depth === 0 ? [] : firstPath.slice(0, depth);
    const cloned = cloneContainerPathForSingle(originalRoot, parentPath);
    if (cloned === null)
        return NO_IMMUTABLE_FAST_PATH;
    const parent = cloned[1];
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const key = op[1][depth];
        const child = parent[key];
        if (child === null || typeof child !== 'object')
            return NO_IMMUTABLE_FAST_PATH;
        const nextChild = shallowCloneContainer(child);
        assignValues(nextChild, op[2], true);
        assignChild(parent, key, nextChild);
    }
    return cloned[0];
}
function applyRootArrayPatchImmutableFast(originalRoot, patch) {
    const root = originalRoot.slice();
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const code = op[0];
        const path = op[1];
        if (path.length === 0) {
            if (code === OP_ARRAY_SPLICE) {
                applyArraySplice(root, op[2], op[3], op[4], true);
            }
            else if (code === OP_ARRAY_TWO_FIELD_INSERT) {
                applyArrayTwoFieldInsert(root, op[2], op[3], op[4], op[5], op[6]);
            }
            else if (code === OP_ARRAY_MOVE) {
                const from = op[2];
                const to = op[3];
                if (from !== to) {
                    const moved = root[from];
                    root.splice(from, 1);
                    root.splice(to, 0, moved);
                }
            }
            else if (code === OP_APPEND) {
                appendImmutableValues(root, op[2]);
            }
            else if (code === OP_TRUNCATE) {
                root.length = op[2];
            }
            else if (code === OP_ARRAY_ASSIGN) {
                assignArrayValuesImmutable(root, op[2], op[3]);
            }
            else if (code === OP_ARRAY_OBJECT_ASSIGN) {
                assignArrayObjectValuesImmutable(root, op[2], op[3]);
            }
            else if (code === OP_ARRAY_TUPLE_ASSIGN) {
                assignArrayTupleValuesImmutable(root, op[2], op[3], op[4]);
            }
            else if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
                assignArrayObjectFieldValuesImmutable(root, op[2], op[3], op[4]);
            }
            else {
                return NO_IMMUTABLE_FAST_PATH;
            }
        }
        else if (path.length === 1) {
            const index = path[0];
            if (typeof index !== 'number')
                return NO_IMMUTABLE_FAST_PATH;
            if (code === OP_SET) {
                root[index] = clonePatchValue(op[2]);
            }
            else if (code === OP_ASSIGN) {
                const row = cloneRootArrayObject(root, index);
                if (row === null)
                    return NO_IMMUTABLE_FAST_PATH;
                assignValues(row, op[2], true);
            }
            else if (code === OP_REMOVE) {
                delete root[index];
            }
            else {
                return NO_IMMUTABLE_FAST_PATH;
            }
        }
        else if (path.length === 2) {
            const index = path[0];
            if (typeof index !== 'number')
                return NO_IMMUTABLE_FAST_PATH;
            const row = cloneRootArrayObject(root, index);
            if (row === null)
                return NO_IMMUTABLE_FAST_PATH;
            if (code === OP_SET) {
                assignChild(row, path[1], clonePatchValue(op[2]));
            }
            else if (code === OP_REMOVE) {
                delete row[path[1]];
            }
            else {
                return NO_IMMUTABLE_FAST_PATH;
            }
        }
        else {
            return NO_IMMUTABLE_FAST_PATH;
        }
    }
    return root;
}
function canApplyRootArrayPatchImmutableFast(patch) {
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const code = op[0];
        const path = op[1];
        if (path.length === 0) {
            if (code !== OP_ARRAY_SPLICE &&
                code !== OP_ARRAY_TWO_FIELD_INSERT &&
                code !== OP_ARRAY_MOVE &&
                code !== OP_APPEND &&
                code !== OP_TRUNCATE &&
                code !== OP_ARRAY_ASSIGN &&
                code !== OP_ARRAY_OBJECT_ASSIGN &&
                code !== OP_ARRAY_TUPLE_ASSIGN &&
                code !== OP_ARRAY_OBJECT_FIELD_ASSIGN) {
                return false;
            }
        }
        else if (path.length === 1) {
            if (typeof path[0] !== 'number' || (code !== OP_SET && code !== OP_ASSIGN && code !== OP_REMOVE))
                return false;
        }
        else if (path.length === 2) {
            if (typeof path[0] !== 'number' || (code !== OP_SET && code !== OP_REMOVE))
                return false;
        }
        else {
            return false;
        }
    }
    return true;
}
function applySingleRootArrayOpImmutable(originalRoot, op) {
    const code = op[0];
    if (code === OP_ARRAY_SPLICE) {
        return applyRootArraySpliceImmutable(originalRoot, op[2], op[3], op[4]);
    }
    if (code === OP_ARRAY_TWO_FIELD_INSERT) {
        return applyRootArrayTwoFieldInsertImmutable(originalRoot, op[2], op[3], op[4], op[5], op[6]);
    }
    if (code === OP_APPEND) {
        return originalRoot.concat(clonePatchValues(op[2]));
    }
    if (code === OP_TRUNCATE) {
        return originalRoot.slice(0, op[2]);
    }
    if (code === OP_ARRAY_ASSIGN) {
        const root = originalRoot.slice();
        assignArrayValuesImmutable(root, op[2], op[3]);
        return root;
    }
    if (code === OP_ARRAY_OBJECT_ASSIGN) {
        const root = originalRoot.slice();
        assignArrayObjectValuesImmutable(root, op[2], op[3]);
        return root;
    }
    if (code === OP_ARRAY_TUPLE_ASSIGN) {
        const root = originalRoot.slice();
        assignArrayTupleValuesImmutable(root, op[2], op[3], op[4]);
        return root;
    }
    if (code === OP_ARRAY_OBJECT_FIELD_ASSIGN) {
        const root = originalRoot.slice();
        assignArrayObjectFieldValuesImmutable(root, op[2], op[3], op[4]);
        return root;
    }
    return NO_IMMUTABLE_FAST_PATH;
}
function applyRootArrayTwoSplicesSetPatchImmutable(originalRoot, patch) {
    if (patch.length !== 3)
        return NO_IMMUTABLE_FAST_PATH;
    const first = patch[0];
    const second = patch[1];
    const third = patch[2];
    if (first[0] !== OP_ARRAY_SPLICE ||
        second[0] !== OP_ARRAY_SPLICE ||
        third[0] !== OP_SET ||
        first[1].length !== 0 ||
        second[1].length !== 0 ||
        third[1].length !== 2 ||
        typeof third[1][0] !== 'number') {
        return NO_IMMUTABLE_FAST_PATH;
    }
    const direct = applyRootArrayTwoSplicesSetDirect(originalRoot, first, second, third);
    if (direct !== NO_IMMUTABLE_FAST_PATH)
        return direct;
    const root = originalRoot.slice();
    applyArraySplice(root, first[2], first[3], first[4], true);
    applyArraySplice(root, second[2], second[3], second[4], true);
    const row = cloneRootArrayObject(root, third[1][0]);
    if (row === null)
        return NO_IMMUTABLE_FAST_PATH;
    assignChild(row, third[1][1], clonePatchValue(third[2]));
    return root;
}
function applyRootArrayTwoSplicesSetDirect(originalRoot, first, second, third) {
    const firstValues = first[4];
    const secondValues = second[4];
    if (first[3] !== 1 ||
        second[3] !== 0 ||
        firstValues.length !== 0 ||
        secondValues.length !== 1) {
        return NO_IMMUTABLE_FAST_PATH;
    }
    const inserted = cloneTwoFieldPatchObject(secondValues[0], 'id', 'value');
    if (inserted === null)
        return NO_IMMUTABLE_FAST_PATH;
    const root = originalRoot.slice();
    root.splice(first[2], 1);
    root.splice(second[2], 0, inserted);
    const row = root[third[1][0]];
    const cloned = cloneRootArrayRowWithFastScalarSet(row, third[1][1], third[2]);
    if (cloned === null)
        return NO_IMMUTABLE_FAST_PATH;
    root[third[1][0]] = cloned;
    return root;
}
function applyRootArrayRemoveMoveInsertSetPatchImmutable(originalRoot, patch) {
    if (patch.length !== 4)
        return NO_IMMUTABLE_FAST_PATH;
    const remove = patch[0];
    const move = patch[1];
    const insert = patch[2];
    const set = patch[3];
    if (remove[0] !== OP_ARRAY_SPLICE ||
        move[0] !== OP_ARRAY_MOVE ||
        insert[0] !== OP_ARRAY_SPLICE ||
        set[0] !== OP_SET ||
        remove[1].length !== 0 ||
        move[1].length !== 0 ||
        insert[1].length !== 0 ||
        set[1].length !== 2 ||
        typeof set[1][0] !== 'number' ||
        remove[3] !== 1 ||
        remove[4].length !== 0 ||
        insert[3] !== 0 ||
        insert[4].length !== 1) {
        return NO_IMMUTABLE_FAST_PATH;
    }
    const root = originalRoot.slice();
    root.splice(remove[2], 1);
    const from = move[2];
    const to = move[3];
    if (from !== to) {
        const moved = root[from];
        root.splice(from, 1);
        root.splice(to, 0, moved);
    }
    root.splice(insert[2], 0, clonePatchValue(insert[4][0]));
    const row = cloneRootArrayObject(root, set[1][0]);
    if (row === null)
        return NO_IMMUTABLE_FAST_PATH;
    assignChild(row, set[1][1], clonePatchValue(set[2]));
    return root;
}
function applyRootArrayRemoveTwoFieldInsertSetPatchImmutable(originalRoot, patch) {
    if (patch.length !== 3)
        return NO_IMMUTABLE_FAST_PATH;
    const first = patch[0];
    const second = patch[1];
    const third = patch[2];
    if (first[0] !== OP_ARRAY_SPLICE ||
        second[0] !== OP_ARRAY_TWO_FIELD_INSERT ||
        third[0] !== OP_SET ||
        first[1].length !== 0 ||
        second[1].length !== 0 ||
        third[1].length !== 2 ||
        typeof third[1][0] !== 'number' ||
        first[3] !== 1 ||
        first[4].length !== 0 ||
        second[5].length !== 1 ||
        second[6].length !== 1) {
        return NO_IMMUTABLE_FAST_PATH;
    }
    const root = originalRoot.slice();
    root.splice(first[2], 1);
    root.splice(second[2], 0, makeTwoFieldRow(second[3], second[4], second[5][0], second[6][0]));
    const row = root[third[1][0]];
    const cloned = cloneRootArrayRowWithFastScalarSet(row, third[1][1], third[2]);
    if (cloned === null)
        return NO_IMMUTABLE_FAST_PATH;
    root[third[1][0]] = cloned;
    return root;
}
function applyRootArraySmallInsertPatchImmutable(originalRoot, patch) {
    let insertOp = null;
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const code = op[0];
        const path = op[1];
        if (code === OP_ARRAY_SPLICE) {
            if (insertOp !== null ||
                path.length !== 0 ||
                op[3] !== 0 ||
                !Array.isArray(op[4]) ||
                op[4].length === 0 ||
                op[4].length > 4 ||
                !arePatchScalars(op[4])) {
                return NO_IMMUTABLE_FAST_PATH;
            }
            insertOp = op;
        }
        else if (code === OP_SET) {
            if (path.length !== 1 || typeof path[0] !== 'number' || !isPatchScalar(op[2])) {
                return NO_IMMUTABLE_FAST_PATH;
            }
        }
        else {
            return NO_IMMUTABLE_FAST_PATH;
        }
    }
    if (insertOp === null)
        return NO_IMMUTABLE_FAST_PATH;
    const start = insertOp[2];
    const values = insertOp[4];
    const root = typeof originalRoot.toSpliced === 'function'
        ? originalRoot.toSpliced(start, 0, ...values)
        : originalRoot.slice(0, start).concat(values, originalRoot.slice(start));
    for (let j = 0, patchLength = patch.length; j < patchLength; j++) {
        const op = patch[j];
        if (op !== insertOp)
            root[op[1][0]] = op[2];
    }
    return root;
}
function arePatchScalars(values) {
    for (let i = 0, length = values.length; i < length; i++) {
        if (!isPatchScalar(values[i]))
            return false;
    }
    return true;
}
function cloneRootArrayObject(root, index) {
    const row = root[index];
    if (row === null || typeof row !== 'object')
        return null;
    const clone = shallowCloneContainer(row);
    root[index] = clone;
    return clone;
}
function cloneContainerPathForSingle(originalRoot, path) {
    const root = shallowCloneContainer(originalRoot);
    if (path.length === 0)
        return [root, root];
    let originalNode = originalRoot;
    let clonedNode = root;
    for (let i = 0, length = path.length; i < length; i++) {
        const key = path[i];
        if (originalNode === null || typeof originalNode !== 'object')
            return null;
        const originalChild = originalNode[key];
        if (originalChild === null || typeof originalChild !== 'object')
            return null;
        const clonedChild = shallowCloneContainer(originalChild);
        assignChild(clonedNode, key, clonedChild);
        originalNode = originalChild;
        clonedNode = clonedChild;
    }
    return [root, clonedNode];
}
function shallowCloneContainer(value) {
    if (Array.isArray(value))
        return value.slice();
    return shallowCloneObjectByKeys(value);
}
function shallowCloneObjectByKeys(value) {
    const keys = Object.keys(value);
    if (!hasOwn.call(value, '__proto__')) {
        const idValue = cloneIdValueScalarObjectWithKeys(value, keys);
        if (idValue !== null)
            return idValue;
        if (keys.length <= 8)
            return { ...value };
        const out = {};
        for (let i = 0, length = keys.length; i < length; i++) {
            const key = keys[i];
            out[key] = value[key];
        }
        return out;
    }
    const out = {};
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        defineCloneValue(out, key, value[key]);
    }
    return out;
}
function shallowCloneObjectByEnumeration(value) {
    const out = {};
    for (const key in value) {
        if (!hasOwn.call(value, key))
            continue;
        defineCloneValue(out, key, value[key]);
    }
    return out;
}
function defineCloneValue(out, key, value) {
    if (key === '__proto__') {
        Object.defineProperty(out, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    }
    else {
        out[key] = value;
    }
}
function shallowCloneRowForAssign(value) {
    if (Array.isArray(value))
        return value.slice();
    return { ...value };
}
function assignChild(parent, key, value) {
    if (Array.isArray(parent)) {
        parent[key] = value;
    }
    else {
        assignOwnValue(parent, key, value);
    }
}
function assignOwnValue(object, key, value) {
    if (key === '__proto__') {
        setOwnValue(object, key, value);
    }
    else {
        object[key] = value;
    }
}
function clonePatchValue(value) {
    if (value === null || typeof value !== 'object')
        return value;
    return Array.isArray(value) ? clonePatchArray(value) : clonePatchObject(value);
}
function clonePatchArray(value) {
    const length = value.length;
    if (length === 2) {
        const first = value[0];
        const second = value[1];
        if ((first === null || typeof first !== 'object') && (second === null || typeof second !== 'object')) {
            return [first, second];
        }
    }
    for (let i = 0; i < length; i++) {
        const item = value[i];
        if (item !== null && typeof item === 'object') {
            const out = new Array(length);
            for (let j = 0; j < i; j++) {
                out[j] = value[j];
            }
            out[i] = clonePatchValue(item);
            for (let j = i + 1; j < length; j++) {
                out[j] = clonePatchValue(value[j]);
            }
            return out;
        }
    }
    return value.slice();
}
function clonePatchObject(value) {
    const idValue = cloneIdValueScalarObject(value);
    if (idValue !== null)
        return idValue;
    const queryRow = cloneQueryPatchObject(value);
    if (queryRow !== null)
        return queryRow;
    const scalarObject = cloneSmallScalarPatchObject(value);
    if (scalarObject !== null)
        return scalarObject;
    const out = {};
    for (const key in value) {
        if (!hasOwn.call(value, key))
            continue;
        defineCloneValue(out, key, clonePatchValue(value[key]));
    }
    return out;
}
function cloneQueryPatchObject(value) {
    if (hasOwn.call(value, '__proto__') ||
        !hasOwn.call(value, 'op') ||
        !hasOwn.call(value, 'hash') ||
        !hasOwn.call(value, 'ttl') ||
        !hasOwn.call(value, 'name') ||
        !hasOwn.call(value, 'args') ||
        !hasOwn.call(value, 'ast')) {
        return null;
    }
    const keys = Object.keys(value);
    if (keys.length !== 6)
        return null;
    const op = value.op;
    const hash = value.hash;
    const ttl = value.ttl;
    const name = value.name;
    const args = value.args;
    const ast = value.ast;
    if (!isPatchScalar(op) ||
        !isPatchScalar(hash) ||
        !isPatchScalar(ttl) ||
        !isPatchScalar(name) ||
        !Array.isArray(args) ||
        ast === null ||
        typeof ast !== 'object' ||
        Array.isArray(ast) ||
        hasOwn.call(ast, '__proto__')) {
        return null;
    }
    const table = ast.table;
    const where = ast.where;
    const orderBy = ast.orderBy;
    if (Object.keys(ast).length !== 3 ||
        !isPatchScalar(table) ||
        !Array.isArray(where) ||
        !Array.isArray(orderBy)) {
        return null;
    }
    return {
        op,
        hash,
        ttl,
        name,
        args: args.slice(),
        ast: {
            table,
            where: where.slice(),
            orderBy: cloneArrayOfScalarPairs(orderBy)
        }
    };
}
function cloneArrayOfScalarPairs(value) {
    const length = value.length;
    const out = new Array(length);
    for (let i = 0; i < length; i++) {
        const item = value[i];
        if (!Array.isArray(item) || item.length !== 2 || !isPatchScalar(item[0]) || !isPatchScalar(item[1])) {
            return clonePatchArray(value);
        }
        out[i] = [item[0], item[1]];
    }
    return out;
}
function cloneSmallScalarPatchObject(value) {
    const keys = Object.keys(value);
    const length = keys.length;
    if (length === 0 || length > 8)
        return null;
    const out = {};
    for (let i = 0; i < length; i++) {
        const key = keys[i];
        const item = value[key];
        if (!isPatchScalar(item))
            return null;
        if (key === '__proto__') {
            Object.defineProperty(out, key, {
                value: item,
                enumerable: true,
                configurable: true,
                writable: true
            });
        }
        else {
            out[key] = item;
        }
    }
    return out;
}
function cloneIdValueScalarObject(value) {
    if (hasOwn.call(value, '__proto__'))
        return null;
    if (!hasOwn.call(value, 'id') || !hasOwn.call(value, 'value'))
        return null;
    const keys = Object.keys(value);
    return cloneIdValueScalarObjectWithKeys(value, keys);
}
function cloneIdValueScalarObjectWithKeys(value, keys) {
    if (keys.length !== 2 || !hasOwn.call(value, 'id') || !hasOwn.call(value, 'value'))
        return null;
    const id = value.id;
    const nextValue = value.value;
    if (!isPatchScalar(id) || !isPatchScalar(nextValue))
        return null;
    return { id, value: nextValue };
}
function cloneTwoFieldPatchObject(value, key0, key1) {
    if (value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        hasOwn.call(value, '__proto__')) {
        return null;
    }
    return cloneTwoFieldScalarObjectWithKeys(value, key0, key1);
}
function cloneRootArrayRowWithFastScalarSet(row, key, value) {
    if (row === null ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        hasOwn.call(row, '__proto__')) {
        return null;
    }
    if (key === 'value') {
        const directSet = cloneExactIdValueRowWithValue(row, value);
        if (directSet !== null)
            return directSet;
        const direct = cloneTwoFieldScalarObjectWithKeys(row, 'id', 'value');
        if (direct !== null) {
            direct.value = clonePatchValue(value);
            return direct;
        }
    }
    const clone = shallowCloneObjectByKeys(row);
    assignChild(clone, key, clonePatchValue(value));
    return clone;
}
function cloneExactIdValueRowWithValue(row, value) {
    let count = 0;
    let hasId = false;
    let hasValue = false;
    for (const key in row) {
        if (!hasOwn.call(row, key))
            continue;
        count++;
        if (key === 'id') {
            hasId = true;
        }
        else if (key === 'value') {
            hasValue = true;
        }
        else {
            return null;
        }
        if (count > 2)
            return null;
    }
    if (count !== 2 || !hasId || !hasValue)
        return null;
    return { id: row.id, value: clonePatchValue(value) };
}
function isPatchScalar(value) {
    return value === null || typeof value !== 'object';
}
function appendImmutableValues(array, values) {
    const offset = array.length;
    for (let i = 0, length = values.length; i < length; i++) {
        array[offset + i] = clonePatchValue(values[i]);
    }
}
function applyArrayTwoFieldInsert(array, start, key0, key1, values0, values1) {
    if (values0.length === 1) {
        array.splice(start, 0, makeTwoFieldRow(key0, key1, values0[0], values1[0]));
        return;
    }
    const inserted = makeTwoFieldRows(key0, key1, values0, values1);
    array.splice(start, 0, ...inserted);
}
function applyRootArrayTwoFieldInsertImmutable(array, start, key0, key1, values0, values1) {
    if (values0.length === 1) {
        const row = makeTwoFieldRow(key0, key1, values0[0], values1[0]);
        if (typeof array.toSpliced === 'function')
            return array.toSpliced(start, 0, row);
        return array.slice(0, start).concat([row], array.slice(start));
    }
    const inserted = makeTwoFieldRows(key0, key1, values0, values1);
    if (typeof array.toSpliced === 'function') {
        return array.toSpliced(start, 0, ...inserted);
    }
    return array.slice(0, start).concat(inserted, array.slice(start));
}
function makeTwoFieldRows(key0, key1, values0, values1) {
    const length = values0.length;
    const out = new Array(length);
    if (key0 === 'position' && key1 === 'char') {
        for (let i = 0; i < length; i++)
            out[i] = { position: values0[i], char: values1[i] };
        return out;
    }
    if (key0 === 'id' && key1 === 'value') {
        for (let i = 0; i < length; i++)
            out[i] = { id: values0[i], value: values1[i] };
        return out;
    }
    for (let i = 0; i < length; i++) {
        const row = {};
        assignOwnValue(row, key0, values0[i]);
        assignOwnValue(row, key1, values1[i]);
        out[i] = row;
    }
    return out;
}
function makeTwoFieldRow(key0, key1, value0, value1) {
    if (key0 === 'position' && key1 === 'char')
        return { position: value0, char: value1 };
    if (key0 === 'id' && key1 === 'value')
        return { id: value0, value: value1 };
    const row = {};
    assignOwnValue(row, key0, value0);
    assignOwnValue(row, key1, value1);
    return row;
}
function applyRootArraySpliceImmutable(array, start, deleteCount, values) {
    const insertCount = values.length;
    if (deleteCount === 0) {
        if (insertCount <= 4 &&
            typeof array.toSpliced === 'function' &&
            arePatchScalars(values)) {
            return array.toSpliced(start, 0, ...values);
        }
        if (insertCount >= 16) {
            const smallObjectInsert = applyRootSmallObjectRowsInsert(array, start, values, insertCount);
            if (smallObjectInsert !== null)
                return smallObjectInsert;
        }
        if (insertCount <= 4) {
            const length = array.length;
            const out = new Array(length + insertCount);
            let i = 0;
            for (; i < start; i++)
                out[i] = array[i];
            for (let j = 0; j < insertCount; j++)
                out[i + j] = clonePatchValue(values[j]);
            for (; i < length; i++)
                out[i + insertCount] = array[i];
            return out;
        }
        return array.slice(0, start).concat(clonePatchValues(values), array.slice(start));
    }
    const out = array.slice();
    if (insertCount === deleteCount) {
        if (insertCount >= LONG_EQUAL_ARRAY_SPLICE_VALUE_COUNT) {
            for (let i = 0; i < insertCount; i++) {
                const value = values[i];
                out[start + i] = value !== null && typeof value === 'object' ? clonePatchValue(value) : value;
            }
        }
        else if (arePatchScalars(values)) {
            for (let i = 0; i < insertCount; i++)
                out[start + i] = values[i];
        }
        else {
            for (let i = 0; i < insertCount; i++) {
                out[start + i] = clonePatchValue(values[i]);
            }
        }
        return out;
    }
    applyArraySplice(out, start, deleteCount, values, true);
    return out;
}
function applyRootSmallObjectRowsInsert(array, start, values, insertCount) {
    const first = values[0];
    const keys = readSmallScalarObjectKeys(first);
    if (keys === null)
        return null;
    const twoFieldRows = applyRootTwoFieldScalarRowsInsert(array, start, values, insertCount, keys);
    if (twoFieldRows !== null)
        return twoFieldRows;
    if (typeof array.toSpliced === 'function') {
        const inserted = new Array(insertCount);
        inserted[0] = cloneSmallScalarObjectWithKeys(first, keys);
        for (let i = 1; i < insertCount; i++) {
            const value = values[i];
            const cloned = cloneSmallScalarObjectWithKeys(value, keys);
            if (cloned === null)
                return null;
            inserted[i] = cloned;
        }
        return array.toSpliced(start, 0, ...inserted);
    }
    const length = array.length;
    const out = new Array(length + insertCount);
    let offset = 0;
    for (; offset < start; offset++)
        out[offset] = array[offset];
    out[offset++] = cloneSmallScalarObjectWithKeys(first, keys);
    for (let i = 1; i < insertCount; i++) {
        const value = values[i];
        const cloned = cloneSmallScalarObjectWithKeys(value, keys);
        if (cloned === null)
            return null;
        out[offset++] = cloned;
    }
    for (let i = start; i < length; i++)
        out[offset++] = array[i];
    return out;
}
function applyRootTwoFieldScalarRowsInsert(array, start, values, insertCount, keys) {
    if (keys.length !== 2)
        return null;
    const key0 = keys[0];
    const key1 = keys[1];
    if (key0 === 'position' && key1 === 'char') {
        const inserted = new Array(insertCount);
        for (let i = 0; i < insertCount; i++) {
            const value = values[i];
            if (value === null ||
                typeof value !== 'object' ||
                Array.isArray(value) ||
                !hasExactTwoPatchKeys(value, 'position', 'char')) {
                return null;
            }
            const position = value.position;
            const char = value.char;
            if (!isPatchScalar(position) || !isPatchScalar(char))
                return null;
            inserted[i] = { position, char };
        }
        return applyRootArrayInsertValues(array, start, inserted, insertCount);
    }
    if (key0 === 'id' && key1 === 'value') {
        const inserted = new Array(insertCount);
        for (let i = 0; i < insertCount; i++) {
            const value = values[i];
            if (value === null ||
                typeof value !== 'object' ||
                Array.isArray(value) ||
                !hasExactTwoPatchKeys(value, 'id', 'value')) {
                return null;
            }
            const id = value.id;
            const nextValue = value.value;
            if (!isPatchScalar(id) || !isPatchScalar(nextValue))
                return null;
            inserted[i] = { id, value: nextValue };
        }
        return applyRootArrayInsertValues(array, start, inserted, insertCount);
    }
    return null;
}
function applyRootArrayInsertValues(array, start, inserted, insertCount) {
    if (typeof array.toSpliced === 'function') {
        return array.toSpliced(start, 0, ...inserted);
    }
    const length = array.length;
    const out = new Array(length + insertCount);
    let offset = 0;
    for (; offset < start; offset++)
        out[offset] = array[offset];
    for (let i = 0; i < insertCount; i++)
        out[offset++] = inserted[i];
    for (let i = start; i < length; i++)
        out[offset++] = array[i];
    return out;
}
function clonePatchValues(values) {
    const length = values.length;
    if (length >= 16) {
        const smallObjectRows = cloneSmallScalarObjectRows(values, length);
        if (smallObjectRows !== null)
            return smallObjectRows;
    }
    for (let i = 0; i < length; i++) {
        const value = values[i];
        if (value !== null && typeof value === 'object') {
            const out = new Array(length);
            for (let j = 0; j < i; j++) {
                out[j] = values[j];
            }
            for (let j = i; j < length; j++) {
                out[j] = clonePatchValue(values[j]);
            }
            return out;
        }
    }
    return values;
}
function cloneSmallScalarObjectRows(values, length) {
    const first = values[0];
    const keys = readSmallScalarObjectKeys(first);
    if (keys === null)
        return null;
    const out = new Array(length);
    out[0] = cloneSmallScalarObjectWithKeys(first, keys);
    for (let i = 1; i < length; i++) {
        const value = values[i];
        const cloned = cloneSmallScalarObjectWithKeys(value, keys);
        if (cloned === null)
            return null;
        out[i] = cloned;
    }
    return out;
}
function readSmallScalarObjectKeys(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    const keys = Object.keys(value);
    if (keys.length === 0 || keys.length > 8)
        return null;
    for (let i = 0, length = keys.length; i < length; i++) {
        if (!isPatchScalar(value[keys[i]]))
            return null;
    }
    return keys;
}
function cloneSmallScalarObjectWithKeys(value, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    if (keys.length === 2 && !hasOwn.call(value, '__proto__')) {
        const direct = cloneTwoFieldScalarObjectWithKeys(value, keys[0], keys[1]);
        if (direct !== null)
            return direct;
    }
    if (!hasExactPatchKeys(value, keys))
        return null;
    const out = {};
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        const item = value[key];
        if (!isPatchScalar(item))
            return null;
        if (key === '__proto__') {
            Object.defineProperty(out, key, {
                value: item,
                enumerable: true,
                configurable: true,
                writable: true
            });
        }
        else {
            out[key] = item;
        }
    }
    return out;
}
function cloneTwoFieldScalarObjectWithKeys(value, key0, key1) {
    if (key0 === 'id' &&
        key1 === 'value' &&
        hasOwn.call(value, 'id') &&
        hasOwn.call(value, 'value') &&
        hasExactTwoPatchKeys(value, 'id', 'value')) {
        const id = value.id;
        const nextValue = value.value;
        return isPatchScalar(id) && isPatchScalar(nextValue) ? { id, value: nextValue } : null;
    }
    if (key0 === 'position' &&
        key1 === 'char' &&
        hasOwn.call(value, 'position') &&
        hasOwn.call(value, 'char') &&
        hasExactTwoPatchKeys(value, 'position', 'char')) {
        const position = value.position;
        const char = value.char;
        return isPatchScalar(position) && isPatchScalar(char) ? { position, char } : null;
    }
    return null;
}
function hasExactTwoPatchKeys(value, key0, key1) {
    let count = 0;
    for (const key in value) {
        if (!hasOwn.call(value, key))
            continue;
        if (key !== key0 && key !== key1)
            return false;
        count++;
    }
    return count === 2;
}
function hasExactPatchKeys(value, keys) {
    let count = 0;
    for (const key in value) {
        if (!hasOwn.call(value, key))
            continue;
        if (keys.indexOf(key) === -1)
            return false;
        count++;
    }
    return count === keys.length;
}
function applyArraySplice(array, start, deleteCount, values, cloneValues) {
    const insertCount = values.length;
    if (insertCount === 0) {
        array.splice(start, deleteCount);
        return;
    }
    if (insertCount === 1) {
        const value = values[0];
        array.splice(start, deleteCount, cloneValues ? clonePatchValueIfObject(value) : value);
        return;
    }
    if (insertCount === deleteCount) {
        if (cloneValues) {
            for (let i = 0; i < insertCount; i++) {
                const value = values[i];
                if (value !== null && typeof value === 'object') {
                    array[start + i] = clonePatchValue(value);
                    for (let j = i + 1; j < insertCount; j++) {
                        array[start + j] = clonePatchValue(values[j]);
                    }
                    return;
                }
                array[start + i] = value;
            }
        }
        else {
            for (let i = 0; i < insertCount; i++) {
                array[start + i] = values[i];
            }
        }
        return;
    }
    const insert = cloneValues ? new Array(insertCount) : values;
    if (cloneValues) {
        for (let i = 0; i < insertCount; i++) {
            insert[i] = clonePatchValue(values[i]);
        }
    }
    array.splice(start, deleteCount, ...insert);
}
function applyArrayMove(array, from, to) {
    if (from === to)
        return;
    const value = array[from];
    array.splice(from, 1);
    array.splice(to, 0, value);
}
function assignArrayValues(array, indexes, values, cloneValues) {
    for (let i = 0, length = indexes.length; i < length; i++) {
        const value = values[i];
        array[indexes[i]] = cloneValues ? clonePatchValueIfObject(value) : value;
    }
}
function assignArrayValuesImmutable(array, indexes, values) {
    for (let i = 0, length = indexes.length; i < length; i++) {
        array[indexes[i]] = clonePatchValueIfObject(values[i]);
    }
}
function assignArrayObjectValues(array, indexes, values, cloneValues) {
    for (let i = 0, length = indexes.length; i < length; i++) {
        assignValues(array[indexes[i]], values[i], cloneValues);
    }
}
function assignArrayObjectValuesImmutable(array, indexes, values) {
    for (let i = 0, length = indexes.length; i < length; i++) {
        const index = indexes[i];
        const row = shallowCloneRowForAssign(array[index]);
        array[index] = row;
        assignValues(row, values[i], true);
    }
}
function assignArrayTupleValues(array, rowIndexes, fieldIndexes, values, cloneValues) {
    for (let i = 0, length = rowIndexes.length; i < length; i++) {
        const row = array[rowIndexes[i]];
        const value = values[i];
        row[fieldIndexes[i]] = cloneValues ? clonePatchValueIfObject(value) : value;
    }
}
function assignArrayTupleValuesImmutable(array, rowIndexes, fieldIndexes, values) {
    let previousIndex = -1;
    let row = null;
    for (let i = 0, length = rowIndexes.length; i < length; i++) {
        const index = rowIndexes[i];
        if (index !== previousIndex) {
            row = shallowCloneRowForAssign(array[index]);
            array[index] = row;
            previousIndex = index;
        }
        const value = values[i];
        row[fieldIndexes[i]] = value !== null && typeof value === 'object' ? clonePatchValue(value) : value;
    }
}
function assignArrayObjectFieldValues(array, rowIndexes, fields, values, cloneValues) {
    const plan = readObjectFieldApplyPlan(fields);
    if (plan !== null) {
        assignArrayObjectFieldValuesPlanned(array, rowIndexes, values, cloneValues, plan);
        return;
    }
    let cursor = 0;
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const row = array[rowIndexes[rowOffset]];
        for (let fieldIndex = 0, fieldCount = fields.length; fieldIndex < fieldCount; fieldIndex++) {
            assignRelativeField(row, fields[fieldIndex], cloneValues ? clonePatchValue(values[cursor]) : values[cursor]);
            cursor++;
        }
    }
}
function assignArrayObjectFieldValuesImmutable(array, rowIndexes, fields, values) {
    const plan = readObjectFieldApplyPlan(fields);
    if (plan !== null) {
        assignArrayObjectFieldValuesImmutablePlanned(array, rowIndexes, values, plan);
        return;
    }
    let cursor = 0;
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const row = shallowCloneRowForAssign(array[rowIndexes[rowOffset]]);
        array[rowIndexes[rowOffset]] = row;
        let previousTopKey = null;
        let previousParent = null;
        for (let fieldIndex = 0, fieldCount = fields.length; fieldIndex < fieldCount; fieldIndex++) {
            const field = fields[fieldIndex];
            if (field.length === 1) {
                row[field[0]] = clonePatchValueIfObject(values[cursor]);
            }
            else if (field.length === 2) {
                const topKey = field[0];
                let parent;
                if (topKey === previousTopKey) {
                    parent = previousParent;
                }
                else {
                    parent = shallowCloneContainer(row[topKey]);
                    row[topKey] = parent;
                    previousTopKey = topKey;
                    previousParent = parent;
                }
                parent[field[1]] = clonePatchValueIfObject(values[cursor]);
            }
            else {
                assignRelativeFieldImmutable(row, field, clonePatchValueIfObject(values[cursor]));
                previousTopKey = null;
                previousParent = null;
            }
            cursor++;
        }
    }
}
function assignArrayObjectFieldValuesPlanned(array, rowIndexes, values, cloneValues, plan) {
    const directKeys = plan[0];
    const directValueIndexes = plan[1];
    const nestedKeys = plan[2];
    const nestedChildKeys = plan[3];
    const nestedValueIndexes = plan[4];
    const fieldCount = plan[5];
    if (nestedKeys.length === 0) {
        if (directKeys.length === 1) {
            assignArrayObjectFieldValuesDirect1(array, rowIndexes, values, directKeys[0], directValueIndexes[0], fieldCount, cloneValues);
            return;
        }
        if (directKeys.length === 2) {
            assignArrayObjectFieldValuesDirect2(array, rowIndexes, values, directKeys[0], directValueIndexes[0], directKeys[1], directValueIndexes[1], fieldCount, cloneValues);
            return;
        }
    }
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const row = array[rowIndexes[rowOffset]];
        const valueOffset = rowOffset * fieldCount;
        for (let i = 0, length = directKeys.length; i < length; i++) {
            const value = values[valueOffset + directValueIndexes[i]];
            row[directKeys[i]] = cloneValues ? clonePatchValueIfObject(value) : value;
        }
        for (let group = 0, groupCount = nestedKeys.length; group < groupCount; group++) {
            const parent = row[nestedKeys[group]];
            const childKeys = nestedChildKeys[group];
            const valueIndexes = nestedValueIndexes[group];
            for (let i = 0, length = childKeys.length; i < length; i++) {
                const value = values[valueOffset + valueIndexes[i]];
                parent[childKeys[i]] = cloneValues ? clonePatchValueIfObject(value) : value;
            }
        }
    }
}
function assignArrayObjectFieldValuesImmutablePlanned(array, rowIndexes, values, plan) {
    const directKeys = plan[0];
    const directValueIndexes = plan[1];
    const nestedKeys = plan[2];
    const nestedChildKeys = plan[3];
    const nestedValueIndexes = plan[4];
    const fieldCount = plan[5];
    if (nestedKeys.length === 0) {
        if (directKeys.length === 1) {
            assignArrayObjectFieldValuesImmutableDirect1(array, rowIndexes, values, directKeys[0], directValueIndexes[0], fieldCount);
            return;
        }
        if (directKeys.length === 2) {
            assignArrayObjectFieldValuesImmutableDirect2(array, rowIndexes, values, directKeys[0], directValueIndexes[0], directKeys[1], directValueIndexes[1], fieldCount);
            return;
        }
    }
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const rowIndex = rowIndexes[rowOffset];
        const row = shallowCloneRowForAssign(array[rowIndex]);
        array[rowIndex] = row;
        const valueOffset = rowOffset * fieldCount;
        for (let i = 0, length = directKeys.length; i < length; i++) {
            row[directKeys[i]] = clonePatchValueIfObject(values[valueOffset + directValueIndexes[i]]);
        }
        for (let group = 0, groupCount = nestedKeys.length; group < groupCount; group++) {
            const parent = shallowCloneContainer(row[nestedKeys[group]]);
            row[nestedKeys[group]] = parent;
            const childKeys = nestedChildKeys[group];
            const valueIndexes = nestedValueIndexes[group];
            for (let i = 0, length = childKeys.length; i < length; i++) {
                parent[childKeys[i]] = clonePatchValueIfObject(values[valueOffset + valueIndexes[i]]);
            }
        }
    }
}
function assignArrayObjectFieldValuesDirect1(array, rowIndexes, values, key, valueIndex, fieldCount, cloneValues) {
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const row = array[rowIndexes[rowOffset]];
        const value = values[rowOffset * fieldCount + valueIndex];
        row[key] = cloneValues ? clonePatchValueIfObject(value) : value;
    }
}
function assignArrayObjectFieldValuesDirect2(array, rowIndexes, values, key0, valueIndex0, key1, valueIndex1, fieldCount, cloneValues) {
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const row = array[rowIndexes[rowOffset]];
        const valueOffset = rowOffset * fieldCount;
        const value0 = values[valueOffset + valueIndex0];
        const value1 = values[valueOffset + valueIndex1];
        row[key0] = cloneValues ? clonePatchValueIfObject(value0) : value0;
        row[key1] = cloneValues ? clonePatchValueIfObject(value1) : value1;
    }
}
function assignArrayObjectFieldValuesImmutableDirect1(array, rowIndexes, values, key, valueIndex, fieldCount) {
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const rowIndex = rowIndexes[rowOffset];
        const row = shallowCloneRowForAssign(array[rowIndex]);
        array[rowIndex] = row;
        row[key] = clonePatchValueIfObject(values[rowOffset * fieldCount + valueIndex]);
    }
}
function assignArrayObjectFieldValuesImmutableDirect2(array, rowIndexes, values, key0, valueIndex0, key1, valueIndex1, fieldCount) {
    for (let rowOffset = 0, rowCount = rowIndexes.length; rowOffset < rowCount; rowOffset++) {
        const rowIndex = rowIndexes[rowOffset];
        const row = shallowCloneRowForAssign(array[rowIndex]);
        array[rowIndex] = row;
        const valueOffset = rowOffset * fieldCount;
        row[key0] = clonePatchValueIfObject(values[valueOffset + valueIndex0]);
        row[key1] = clonePatchValueIfObject(values[valueOffset + valueIndex1]);
    }
}
function prepareObjectFieldApplyPlan(fields) {
    const directKeys = [];
    const directValueIndexes = [];
    const nestedKeys = [];
    const nestedChildKeys = [];
    const nestedValueIndexes = [];
    for (let i = 0, length = fields.length; i < length; i++) {
        const field = fields[i];
        if (field.length === 1) {
            directKeys[directKeys.length] = field[0];
            directValueIndexes[directValueIndexes.length] = i;
        }
        else if (field.length === 2) {
            const topKey = field[0];
            let group = nestedKeys.indexOf(topKey);
            if (group === -1) {
                group = nestedKeys.length;
                nestedKeys[group] = topKey;
                nestedChildKeys[group] = [field[1]];
                nestedValueIndexes[group] = [i];
            }
            else {
                nestedChildKeys[group][nestedChildKeys[group].length] = field[1];
                nestedValueIndexes[group][nestedValueIndexes[group].length] = i;
            }
        }
        else {
            return null;
        }
    }
    return [directKeys, directValueIndexes, nestedKeys, nestedChildKeys, nestedValueIndexes, fields.length];
}
function readObjectFieldApplyPlan(fields) {
    const cached = objectFieldApplyPlanCache.get(fields);
    if (cached !== undefined)
        return cached === NO_OBJECT_FIELD_APPLY_PLAN ? null : cached;
    const plan = prepareObjectFieldApplyPlan(fields);
    objectFieldApplyPlanCache.set(fields, plan === null ? NO_OBJECT_FIELD_APPLY_PLAN : plan);
    return plan;
}
function assignRelativeField(row, field, value) {
    let parent = row;
    for (let i = 0, last = field.length - 1; i < last; i++)
        parent = parent[field[i]];
    parent[field[field.length - 1]] = value;
}
function assignRelativeFieldImmutable(row, field, value) {
    let parent = row;
    for (let i = 0, last = field.length - 1; i < last; i++) {
        const key = field[i];
        const child = shallowCloneContainer(parent[key]);
        parent[key] = child;
        parent = child;
    }
    parent[field[field.length - 1]] = value;
}
function clonePatchValueIfObject(value) {
    return value !== null && typeof value === 'object' ? clonePatchValue(value) : value;
}
function stringInsertionRunEnd(patch, start, path) {
    if (patch[start][3] !== 0)
        return start + 1;
    let index = start + 1;
    while (index < patch.length &&
        patch[index][0] === OP_STRING_SPLICE &&
        patch[index][3] === 0 &&
        samePath(path, patch[index][1])) {
        index++;
    }
    return index;
}
function applyStringInsertionRun(value, patch, start, end) {
    if (typeof value !== 'string')
        return null;
    const clustered = applyStringSinglePointInsertionRun(value, patch, start, end);
    if (clustered !== null)
        return clustered;
    let insertedLength = 0;
    let cursor = 0;
    const parts = [];
    for (let i = start; i < end; i++) {
        const op = patch[i];
        const sourceIndex = op[2] - insertedLength;
        if (sourceIndex < cursor || sourceIndex > value.length)
            return null;
        if (sourceIndex > cursor)
            parts[parts.length] = value.slice(cursor, sourceIndex);
        parts[parts.length] = op[4];
        cursor = sourceIndex;
        insertedLength += op[4].length;
    }
    if (cursor < value.length)
        parts[parts.length] = value.slice(cursor);
    return parts.join('');
}
function applyStringSinglePointInsertionRun(value, patch, start, end) {
    const first = patch[start];
    const sourceIndex = first[2];
    if (sourceIndex < 0 || sourceIndex > value.length)
        return null;
    let insertedLength = 0;
    let inserted = '';
    for (let i = start; i < end; i++) {
        const op = patch[i];
        if (op[2] - insertedLength !== sourceIndex)
            return null;
        inserted += op[4];
        insertedLength += op[4].length;
    }
    return value.slice(0, sourceIndex) + inserted + value.slice(sourceIndex);
}
function samePath(left, right) {
    if (left.length !== right.length)
        return false;
    for (let i = 0, length = left.length; i < length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}
function assignValues(object, values, cloneValues) {
    const keys = Object.keys(values);
    if (!hasOwn.call(values, '__proto__')) {
        for (let i = 0, length = keys.length; i < length; i++) {
            const key = keys[i];
            const value = values[key];
            object[key] = cloneValues ? clonePatchValueIfObject(value) : value;
        }
        return;
    }
    for (let i = 0, length = keys.length; i < length; i++) {
        const key = keys[i];
        const value = values[key];
        const nextValue = cloneValues ? clonePatchValueIfObject(value) : value;
        if (key === '__proto__') {
            setOwnValue(object, key, nextValue);
        }
        else {
            object[key] = nextValue;
        }
    }
}
function spliceString(value, op) {
    const start = op[2];
    const deleteCount = op[3];
    return value.slice(0, start) + op[4] + value.slice(start + deleteCount);
}
function copyString(value, op) {
    const targetStart = op[2];
    const sourceStart = op[3];
    const count = op[4];
    return value.slice(0, targetStart) +
        value.slice(sourceStart, sourceStart + count) +
        value.slice(targetStart);
}
function parentAt(root, path) {
    let node = root;
    for (let i = 0, length = path.length - 1; i < length; i++) {
        node = node[path[i]];
    }
    return node;
}
function targetAt(root, path) {
    return path.length === 0 ? root : parentAt(root, path)[path[path.length - 1]];
}
function valueAtDepth(root, path, depth) {
    let node = root;
    for (let i = 0; i < depth; i++) {
        node = node[path[i]];
    }
    return node;
}
function samePathPrefix(left, right, length) {
    for (let i = 0; i < length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}
//# sourceMappingURL=apply.js.map