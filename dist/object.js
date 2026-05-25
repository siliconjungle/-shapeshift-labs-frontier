export function setOwnValue(object, key, value) {
    if (key === '__proto__') {
        Object.defineProperty(object, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true
        });
        return;
    }
    object[key] = value;
}
//# sourceMappingURL=object.js.map