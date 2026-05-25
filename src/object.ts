import type { JsonArray, JsonObject, JsonValue, PathSegment } from './types.js';

export function setOwnValue(object: JsonObject | JsonArray, key: PathSegment, value: JsonValue): void {
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
