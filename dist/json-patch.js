import { cloneJson } from './clone.js';
import { equalsJson } from './equal.js';
import { getCachedPointerPath, readArrayIndex } from './pointer.js';
import { setOwnValue } from './object.js';
const JSON_PATCH_FAST_UNSUPPORTED = Symbol('jsonPatchFastUnsupported');
const JSON_PATCH_ROW_FIELD_REPLACE_MIN = 8;
const JSON_PATCH_OBJECT_FIELD_UPDATE_MIN = 8;
export function applyJsonPatch(value, patch, options) {
    if (!Array.isArray(patch))
        throw new TypeError('JSON Patch document must be an array');
    const cloneValues = !!(options && options.cloneValues);
    let root = value;
    if (patch.length >= JSON_PATCH_ROW_FIELD_REPLACE_MIN) {
        const fast = tryApplyRowFieldReplacePatch(root, patch, cloneValues);
        if (fast !== JSON_PATCH_FAST_UNSUPPORTED)
            return fast;
    }
    if (patch.length >= JSON_PATCH_OBJECT_FIELD_UPDATE_MIN) {
        const fast = tryApplyObjectFieldPatch(root, patch, cloneValues);
        if (fast !== JSON_PATCH_FAST_UNSUPPORTED)
            return fast;
    }
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        const kind = op.op;
        if (kind === 'add') {
            root = addPointerValue(root, op.path, patchValue(op.value, cloneValues));
        }
        else if (kind === 'replace') {
            root = replacePointerValue(root, op.path, patchValue(op.value, cloneValues));
        }
        else if (kind === 'remove') {
            root = removePointerValue(root, op.path, null);
        }
        else if (kind === 'copy') {
            root = addPointerValue(root, op.path, cloneJson(getRequiredPath(root, getCachedPointerPath(op.from), op.from)));
        }
        else if (kind === 'move') {
            assertMoveTarget(op.from, op.path);
            const out = [root, undefined];
            root = removePointerValue(root, op.from, out);
            root = addPointerValue(root, op.path, out[1]);
        }
        else if (kind === 'test') {
            if (!equalsJson(getRequiredPath(root, getCachedPointerPath(op.path), op.path), op.value)) {
                throw new TypeError('JSON Patch test operation failed at ' + op.path);
            }
        }
        else {
            throw new TypeError('unknown JSON Patch operation: ' + kind);
        }
    }
    return root;
}
function tryApplyObjectFieldPatch(root, patch, cloneValues) {
    if (root === null || typeof root !== 'object')
        return JSON_PATCH_FAST_UNSUPPORTED;
    let parent = null;
    let firstPath = null;
    let parentPathLength = -1;
    const keys = new Array(patch.length);
    const values = new Array(patch.length);
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if ((op.op !== 'add' && op.op !== 'replace') || typeof op.path !== 'string')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const path = getCachedPointerPath(op.path);
        if (path.length === 0)
            return JSON_PATCH_FAST_UNSUPPORTED;
        if (i === 0) {
            firstPath = path;
            parentPathLength = path.length - 1;
            if (parentPathLength < 2)
                return JSON_PATCH_FAST_UNSUPPORTED;
            parent = readFastJsonPatchPathValue(root, path, parentPathLength);
            if (parent === null || typeof parent !== 'object' || Array.isArray(parent))
                return JSON_PATCH_FAST_UNSUPPORTED;
        }
        else if (path.length !== firstPath.length ||
            !samePathPrefix(path, firstPath, parentPathLength)) {
            return JSON_PATCH_FAST_UNSUPPORTED;
        }
        const key = path[path.length - 1];
        if (op.op === 'replace' && !hasOwn(parent, key))
            return JSON_PATCH_FAST_UNSUPPORTED;
        keys[i] = key;
        values[i] = op.value;
    }
    for (let i = 0, length = keys.length; i < length; i++) {
        setOwnValue(parent, keys[i], patchValue(values[i], cloneValues));
    }
    return root;
}
function tryApplyRowFieldReplacePatch(root, patch, cloneValues) {
    if (root === null || typeof root !== 'object')
        return JSON_PATCH_FAST_UNSUPPORTED;
    let rows = null;
    let firstPath = null;
    let collectionPathLength = -1;
    const targets = new Array(patch.length);
    const keys = new Array(patch.length);
    let targetIsArray = null;
    const values = new Array(patch.length);
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op.op !== 'replace' || typeof op.path !== 'string')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const path = getCachedPointerPath(op.path);
        if (path.length < 3)
            return JSON_PATCH_FAST_UNSUPPORTED;
        const rowIndexOffset = path.length - 2;
        if (typeof path[rowIndexOffset] !== 'number')
            return JSON_PATCH_FAST_UNSUPPORTED;
        if (i === 0) {
            firstPath = path;
            collectionPathLength = rowIndexOffset;
            rows = readFastJsonPatchPathValue(root, path, collectionPathLength);
            if (!Array.isArray(rows))
                return JSON_PATCH_FAST_UNSUPPORTED;
        }
        else if (path.length !== firstPath.length ||
            !samePathPrefix(path, firstPath, collectionPathLength)) {
            return JSON_PATCH_FAST_UNSUPPORTED;
        }
        const row = rows[path[rowIndexOffset]];
        if (row === null || row === undefined || typeof row !== 'object')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const fieldKey = path[path.length - 1];
        const rowIsArray = Array.isArray(row);
        if (rowIsArray) {
            if (typeof fieldKey !== 'number' || fieldKey < 0 || fieldKey >= row.length)
                return JSON_PATCH_FAST_UNSUPPORTED;
        }
        else if (!hasOwn(row, fieldKey)) {
            return JSON_PATCH_FAST_UNSUPPORTED;
        }
        targets[i] = row;
        keys[i] = fieldKey;
        if (rowIsArray) {
            if (targetIsArray === null)
                targetIsArray = new Array(patch.length);
            targetIsArray[i] = true;
        }
        values[i] = op.value;
    }
    if (targetIsArray === null) {
        for (let i = 0, length = targets.length; i < length; i++) {
            setOwnValue(targets[i], keys[i], patchValue(values[i], cloneValues));
        }
        return root;
    }
    for (let i = 0, length = targets.length; i < length; i++) {
        const value = patchValue(values[i], cloneValues);
        if (targetIsArray[i]) {
            targets[i][keys[i]] = value;
        }
        else {
            setOwnValue(targets[i], keys[i], value);
        }
    }
    return root;
}
function readFastJsonPatchPathValue(root, path, length) {
    let node = root;
    for (let i = 0; i < length; i++) {
        if (node === null || node === undefined || typeof node !== 'object')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const key = path[i];
        if (Array.isArray(node)) {
            if (typeof key !== 'number' || key < 0 || key >= node.length)
                return JSON_PATCH_FAST_UNSUPPORTED;
            node = node[key];
        }
        else {
            if (!hasOwn(node, key))
                return JSON_PATCH_FAST_UNSUPPORTED;
            node = node[key];
        }
    }
    return node;
}
function cloneJsonPatchContainerPath(root, path, depth, wideLeafObject = false) {
    const clonedRoot = wideLeafObject && depth === 0
        ? shallowCloneJsonPatchWideContainer(root)
        : shallowCloneJsonPatchContainer(root);
    if (clonedRoot === null)
        return null;
    if (depth === 0)
        return [clonedRoot, clonedRoot];
    let originalNode = root;
    let clonedNode = clonedRoot;
    for (let i = 0; i < depth; i++) {
        if (originalNode === null || originalNode === undefined || typeof originalNode !== 'object')
            return null;
        const key = path[i];
        let child;
        if (Array.isArray(originalNode)) {
            if (typeof key !== 'number' || key < 0 || key >= originalNode.length)
                return null;
            child = originalNode[key];
            clonedNode[key] = wideLeafObject && i === depth - 1
                ? shallowCloneJsonPatchWideContainer(child)
                : shallowCloneJsonPatchContainer(child);
        }
        else {
            if (!hasOwn(originalNode, key))
                return null;
            child = originalNode[key];
            setOwnValue(clonedNode, key, wideLeafObject && i === depth - 1
                ? shallowCloneJsonPatchWideContainer(child)
                : shallowCloneJsonPatchContainer(child));
        }
        const clonedChild = clonedNode[key];
        if (clonedChild === null)
            return null;
        originalNode = child;
        clonedNode = clonedChild;
    }
    return [clonedRoot, clonedNode];
}
function shallowCloneJsonPatchContainer(value) {
    if (Array.isArray(value))
        return value.slice();
    if (value !== null && typeof value === 'object')
        return { ...value };
    return null;
}
function shallowCloneJsonPatchWideContainer(value) {
    if (Array.isArray(value))
        return value.slice();
    if (value !== null && typeof value === 'object')
        return Object.assign({}, value);
    return null;
}
export function applyJsonPatchImmutable(value, patch) {
    if (!Array.isArray(patch))
        throw new TypeError('JSON Patch document must be an array');
    if (value !== null && typeof value === 'object') {
        if (patch.length >= JSON_PATCH_ROW_FIELD_REPLACE_MIN) {
            const fast = tryApplyImmutableRowFieldReplacePatch(value, patch);
            if (fast !== JSON_PATCH_FAST_UNSUPPORTED)
                return fast;
        }
        if (patch.length >= JSON_PATCH_OBJECT_FIELD_UPDATE_MIN) {
            const fast = tryApplyImmutableObjectFieldPatch(value, patch);
            if (fast !== JSON_PATCH_FAST_UNSUPPORTED)
                return fast;
        }
    }
    return applyJsonPatch(cloneJson(value), patch, { cloneValues: true });
}
function tryApplyImmutableObjectFieldPatch(root, patch) {
    let parent = null;
    let firstPath = null;
    let parentPathLength = -1;
    const keys = new Array(patch.length);
    const values = new Array(patch.length);
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if ((op.op !== 'add' && op.op !== 'replace') || typeof op.path !== 'string')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const path = getCachedPointerPath(op.path);
        if (path.length === 0)
            return JSON_PATCH_FAST_UNSUPPORTED;
        if (i === 0) {
            firstPath = path;
            parentPathLength = path.length - 1;
            parent = readFastJsonPatchPathValue(root, path, parentPathLength);
            if (parent === null || typeof parent !== 'object' || Array.isArray(parent))
                return JSON_PATCH_FAST_UNSUPPORTED;
        }
        else if (path.length !== firstPath.length ||
            !samePathPrefix(path, firstPath, parentPathLength)) {
            return JSON_PATCH_FAST_UNSUPPORTED;
        }
        const key = path[path.length - 1];
        if (op.op === 'replace' && !hasOwn(parent, key))
            return JSON_PATCH_FAST_UNSUPPORTED;
        keys[i] = key;
        values[i] = op.value;
    }
    const cloned = cloneJsonPatchContainerPath(root, firstPath, parentPathLength, true);
    if (cloned === null)
        return JSON_PATCH_FAST_UNSUPPORTED;
    const clonedParent = cloned[1];
    if (clonedParent === null || typeof clonedParent !== 'object' || Array.isArray(clonedParent)) {
        return JSON_PATCH_FAST_UNSUPPORTED;
    }
    for (let i = 0, length = keys.length; i < length; i++) {
        setOwnValue(clonedParent, keys[i], patchValue(values[i], true));
    }
    return cloned[0];
}
function tryApplyImmutableRowFieldReplacePatch(root, patch) {
    let rows = null;
    let firstPath = null;
    let collectionPathLength = -1;
    const rowIndexes = new Array(patch.length);
    const keys = new Array(patch.length);
    let targetIsArray = null;
    const values = new Array(patch.length);
    let rowsAreStrictlyIncreasing = true;
    let lastRowIndex = -1;
    for (let i = 0, length = patch.length; i < length; i++) {
        const op = patch[i];
        if (op.op !== 'replace' || typeof op.path !== 'string')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const path = getCachedPointerPath(op.path);
        if (path.length < 3)
            return JSON_PATCH_FAST_UNSUPPORTED;
        const rowIndexOffset = path.length - 2;
        if (typeof path[rowIndexOffset] !== 'number')
            return JSON_PATCH_FAST_UNSUPPORTED;
        if (i === 0) {
            firstPath = path;
            collectionPathLength = rowIndexOffset;
            rows = readFastJsonPatchPathValue(root, path, collectionPathLength);
            if (!Array.isArray(rows))
                return JSON_PATCH_FAST_UNSUPPORTED;
        }
        else if (path.length !== firstPath.length ||
            !samePathPrefix(path, firstPath, collectionPathLength)) {
            return JSON_PATCH_FAST_UNSUPPORTED;
        }
        const rowIndex = path[rowIndexOffset];
        const row = rows[rowIndex];
        if (row === null || row === undefined || typeof row !== 'object')
            return JSON_PATCH_FAST_UNSUPPORTED;
        const fieldKey = path[path.length - 1];
        const rowIsArray = Array.isArray(row);
        if (rowIsArray) {
            if (typeof fieldKey !== 'number' || fieldKey < 0 || fieldKey >= row.length)
                return JSON_PATCH_FAST_UNSUPPORTED;
        }
        else if (!hasOwn(row, fieldKey)) {
            return JSON_PATCH_FAST_UNSUPPORTED;
        }
        rowIndexes[i] = rowIndex;
        if (rowIndex <= lastRowIndex)
            rowsAreStrictlyIncreasing = false;
        lastRowIndex = rowIndex;
        keys[i] = fieldKey;
        if (rowIsArray) {
            if (targetIsArray === null)
                targetIsArray = new Array(patch.length);
            targetIsArray[i] = true;
        }
        values[i] = op.value;
    }
    const cloned = cloneJsonPatchContainerPath(root, firstPath, collectionPathLength);
    if (cloned === null || !Array.isArray(cloned[1]))
        return JSON_PATCH_FAST_UNSUPPORTED;
    const clonedRows = cloned[1];
    if (rowsAreStrictlyIncreasing) {
        for (let i = 0, length = rowIndexes.length; i < length; i++) {
            const rowIndex = rowIndexes[i];
            const row = shallowCloneJsonPatchContainer(clonedRows[rowIndex]);
            if (row === null)
                return JSON_PATCH_FAST_UNSUPPORTED;
            clonedRows[rowIndex] = row;
            const value = patchValue(values[i], true);
            if (targetIsArray !== null && targetIsArray[i]) {
                row[keys[i]] = value;
            }
            else {
                setOwnValue(row, keys[i], value);
            }
        }
        return cloned[0];
    }
    const clonedRowByIndex = new Map();
    for (let i = 0, length = rowIndexes.length; i < length; i++) {
        const rowIndex = rowIndexes[i];
        let row = clonedRowByIndex.get(rowIndex);
        if (row === undefined) {
            row = shallowCloneJsonPatchContainer(clonedRows[rowIndex]);
            if (row === null)
                return JSON_PATCH_FAST_UNSUPPORTED;
            clonedRows[rowIndex] = row;
            clonedRowByIndex.set(rowIndex, row);
        }
        const value = patchValue(values[i], true);
        if (targetIsArray !== null && targetIsArray[i]) {
            row[keys[i]] = value;
        }
        else {
            setOwnValue(row, keys[i], value);
        }
    }
    return cloned[0];
}
function addPointerValue(root, pointer, value) {
    const path = getCachedPointerPath(pointer);
    if (path.length === 0)
        return value;
    const parent = getParentAtPath(root, path, pointer);
    const key = path[path.length - 1];
    if (Array.isArray(parent)) {
        parent.splice(readArrayIndex(key, parent.length, true), 0, value);
    }
    else {
        setOwnValue(parent, key, value);
    }
    return root;
}
function replacePointerValue(root, pointer, value) {
    const path = getCachedPointerPath(pointer);
    if (path.length === 0)
        return value;
    const parent = getParentAtPath(root, path, pointer);
    const key = path[path.length - 1];
    if (Array.isArray(parent)) {
        parent[readArrayIndex(key, parent.length, false)] = value;
    }
    else {
        if (!hasOwn(parent, key))
            throw new TypeError('JSON Patch path does not exist: ' + pointer);
        setOwnValue(parent, key, value);
    }
    return root;
}
function removePointerValue(root, pointer, out) {
    const path = getCachedPointerPath(pointer);
    if (path.length === 0) {
        if (out !== null)
            out[1] = root;
        return undefined;
    }
    const parent = getParentAtPath(root, path, pointer);
    const key = path[path.length - 1];
    let removed;
    if (Array.isArray(parent)) {
        const index = readArrayIndex(key, parent.length, false);
        removed = parent[index];
        parent.splice(index, 1);
    }
    else {
        if (!hasOwn(parent, key))
            throw new TypeError('JSON Patch path does not exist: ' + pointer);
        removed = parent[key];
        delete parent[key];
    }
    if (out !== null)
        out[1] = removed;
    return root;
}
function patchValue(value, cloneValues) {
    return cloneValues && value !== null && typeof value === 'object' ? cloneJson(value) : value;
}
function getParentAtPath(root, path, pointer) {
    let node = root;
    for (let i = 0, length = path.length - 1; i < length; i++) {
        if (node === null || node === undefined || typeof node !== 'object') {
            throw new TypeError('JSON Patch parent path does not exist: ' + pointer);
        }
        if (Array.isArray(node)) {
            node = node[readArrayIndex(path[i], node.length, false)];
        }
        else {
            const key = path[i];
            if (!hasOwn(node, key))
                throw new TypeError('JSON Patch parent path does not exist: ' + pointer);
            node = node[key];
        }
    }
    if (node === null || node === undefined || typeof node !== 'object') {
        throw new TypeError('JSON Patch parent path does not exist: ' + pointer);
    }
    return node;
}
function getRequiredPath(root, path, pointer) {
    if (path.length === 0)
        return root;
    const parent = getParentAtPath(root, path, pointer);
    const key = path[path.length - 1];
    if (Array.isArray(parent))
        return parent[readArrayIndex(key, parent.length, false)];
    if (!hasOwn(parent, key))
        throw new TypeError('JSON Patch path does not exist: ' + pointer);
    return parent[key];
}
function assertMoveTarget(from, path) {
    const fromPath = getCachedPointerPath(from);
    const targetPath = getCachedPointerPath(path);
    if (fromPath.length >= targetPath.length)
        return;
    for (let i = 0, length = fromPath.length; i < length; i++) {
        if (fromPath[i] !== targetPath[i])
            return;
    }
    throw new TypeError('JSON Patch move target must not be inside the source path: ' + path);
}
function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}
function samePathPrefix(left, right, length) {
    for (let i = 0; i < length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}