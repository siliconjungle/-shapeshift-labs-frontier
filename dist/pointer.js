const pointerPathCache = new Map();
const MAX_POINTER_CACHE_SIZE = 4096;
let lastPointerPathKey = null;
let lastPointerPathValue = null;
export function parsePointer(pointer) {
    if (pointer === '')
        return [];
    assertPointerString(pointer);
    const path = [];
    let start = 1;
    for (let i = 1, length = pointer.length; i <= length; i++) {
        if (i === length || pointer.charCodeAt(i) === 47) {
            path[path.length] = decodePointerSegment(pointer, start, i);
            start = i + 1;
        }
    }
    return path;
}
export function stringifyPointer(path) {
    if (!Array.isArray(path))
        throw new TypeError('JSON Pointer path must be an array');
    let pointer = '';
    for (let i = 0, length = path.length; i < length; i++) {
        pointer += '/' + encodePointerSegment(String(path[i]));
    }
    return pointer;
}
export function getPath(value, path) {
    const length = path.length;
    if (length === 0)
        return value;
    let node = value;
    if (node === null || node === undefined)
        return undefined;
    node = node[path[0]];
    if (length === 1)
        return node;
    if (node === null || node === undefined)
        return undefined;
    node = node[path[1]];
    if (length === 2)
        return node;
    if (node === null || node === undefined)
        return undefined;
    node = node[path[2]];
    if (length === 3)
        return node;
    if (node === null || node === undefined)
        return undefined;
    node = node[path[3]];
    for (let i = 4; i < length; i++) {
        if (node === null || node === undefined)
            return undefined;
        node = node[path[i]];
    }
    return node;
}
export function getPointer(value, pointer) {
    return getPath(value, getCachedPointerPath(pointer));
}
export function findPointerParent(value, pointer) {
    const path = getCachedPointerPath(pointer);
    if (path.length === 0)
        return null;
    let node = value;
    for (let i = 0, length = path.length - 1; i < length; i++) {
        if (node === null || node === undefined) {
            throw new TypeError('JSON Pointer parent does not exist: ' + pointer);
        }
        node = node[path[i]];
    }
    return [node, path[path.length - 1]];
}
export function getCachedPointerPath(pointer) {
    if (pointer === lastPointerPathKey)
        return lastPointerPathValue;
    let path = pointerPathCache.get(pointer);
    if (path !== undefined) {
        lastPointerPathKey = pointer;
        lastPointerPathValue = path;
        return path;
    }
    path = parseCachedPointerPath(pointer);
    if (pointerPathCache.size >= MAX_POINTER_CACHE_SIZE)
        pointerPathCache.clear();
    pointerPathCache.set(pointer, path);
    lastPointerPathKey = pointer;
    lastPointerPathValue = path;
    return path;
}
function parseCachedPointerPath(pointer) {
    if (pointer === '')
        return [];
    assertPointerString(pointer);
    const path = [];
    let start = 1;
    for (let i = 1, length = pointer.length; i <= length; i++) {
        if (i === length || pointer.charCodeAt(i) === 47) {
            path[path.length] = readCachedPointerSegment(pointer, start, i);
            start = i + 1;
        }
    }
    return path;
}
function readCachedPointerSegment(pointer, start, end) {
    const segment = decodePointerSegment(pointer, start, end);
    return toCanonicalNumericSegment(segment);
}
export function decodePointerSegment(pointer, start, end) {
    let tilde = -1;
    for (let i = start; i < end; i++) {
        if (pointer.charCodeAt(i) === 126) {
            tilde = i;
            break;
        }
    }
    if (tilde === -1)
        return pointer.slice(start, end);
    let out = pointer.slice(start, tilde);
    let chunkStart = tilde + 2;
    for (let i = tilde; i < end; i++) {
        if (pointer.charCodeAt(i) !== 126)
            continue;
        const next = pointer.charCodeAt(i + 1);
        if (next === 48) {
            out += pointer.slice(chunkStart, i) + '~';
        }
        else if (next === 49) {
            out += pointer.slice(chunkStart, i) + '/';
        }
        else {
            throw new TypeError('invalid JSON Pointer escape in segment: ' + pointer.slice(start, end));
        }
        i++;
        chunkStart = i + 1;
    }
    if (chunkStart < end)
        out += pointer.slice(chunkStart, end);
    return out;
}
export function readArrayIndex(key, length, allowAppend) {
    if (typeof key === 'number') {
        if (!Number.isSafeInteger(key) || key < 0)
            throw new RangeError('invalid JSON Pointer array index: ' + key);
        if (key > length || (!allowAppend && key === length)) {
            throw new RangeError('JSON Pointer array index out of bounds: ' + key);
        }
        return key;
    }
    const text = String(key);
    if (text === '-') {
        if (allowAppend)
            return length;
        throw new RangeError('JSON Pointer "-" is only valid for add operations');
    }
    if (text === '')
        throw new RangeError('invalid JSON Pointer array index');
    if (text.length > 1 && text.charCodeAt(0) === 48) {
        throw new RangeError('invalid JSON Pointer array index: ' + text);
    }
    let index = 0;
    for (let i = 0, keyLength = text.length; i < keyLength; i++) {
        const digit = text.charCodeAt(i) - 48;
        if (digit < 0 || digit > 9)
            throw new RangeError('invalid JSON Pointer array index: ' + text);
        index = index * 10 + digit;
        if (!Number.isSafeInteger(index))
            throw new RangeError('JSON Pointer array index is not a safe integer: ' + text);
    }
    if (index > length || (!allowAppend && index === length)) {
        throw new RangeError('JSON Pointer array index out of bounds: ' + text);
    }
    return index;
}
function toCanonicalNumericSegment(segment) {
    const length = segment.length;
    if (length === 0)
        return segment;
    let code = segment.charCodeAt(0);
    if (code === 48)
        return length === 1 ? 0 : segment;
    if (code < 49 || code > 57)
        return segment;
    let value = code - 48;
    for (let i = 1; i < length; i++) {
        code = segment.charCodeAt(i) - 48;
        if (code < 0 || code > 9)
            return segment;
        value = value * 10 + code;
    }
    return Number.isSafeInteger(value) ? value : segment;
}
function assertPointerString(pointer) {
    if (typeof pointer !== 'string' || pointer.charCodeAt(0) !== 47) {
        throw new TypeError('JSON Pointer must be empty or start with "/"');
    }
}
function encodePointerSegment(segment) {
    let out = '';
    let start = 0;
    for (let i = 0, length = segment.length; i < length; i++) {
        const code = segment.charCodeAt(i);
        if (code === 47) {
            out += segment.slice(start, i) + '~1';
            start = i + 1;
        }
        else if (code === 126) {
            out += segment.slice(start, i) + '~0';
            start = i + 1;
        }
    }
    return start === 0 ? segment : out + segment.slice(start);
}
//# sourceMappingURL=pointer.js.map