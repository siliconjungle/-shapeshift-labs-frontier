import type { JsonValue } from './types.js';

const hasOwn = Object.prototype.hasOwnProperty;
const SMALL_ARRAY_OBJECT_KEY_LIMIT = 16;
const SHAPE_CLONE_MAX_DEPTH = 4;
const SHAPE_CLONE_MAX_KEYS = 16;
const SHAPE_CLONE_CACHE_LIMIT = 128;
const shapeClonePlanCache = new Map();

export function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return cloneArray(value);
  }

  const out = {};
  const keys = Object.keys(value);
  for (let i = 0, length = keys.length; i < length; i++) {
    const key = keys[i];
    const item = value[key];
    const cloned = item === null || typeof item !== 'object' ? item : cloneJson(item);
    if (key === '__proto__') {
      Object.defineProperty(out, key, {
        value: cloned,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      out[key] = cloned;
    }
  }
  return out as T;
}

function cloneArray(value) {
  const length = value.length;

  for (let i = 0; i < length; i++) {
    const item = value[i];
    if (item !== null && typeof item === 'object') {
      const knownRows = tryCloneKnownObjectArray(value, i, length, item);
      if (knownRows !== null) return knownRows;

      const useSmallObjectClone = !Array.isArray(item) &&
        Object.keys(item).length <= SMALL_ARRAY_OBJECT_KEY_LIMIT;
      const out = new Array(length);
      for (let j = 0; j < i; j++) {
        out[j] = value[j];
      }
      for (let j = i; j < length; j++) {
        const next = value[j];
        out[j] = next === null || typeof next !== 'object'
          ? next
          : Array.isArray(next)
            ? cloneArray(next)
            : useSmallObjectClone
              ? cloneSmallObjectFromArray(next)
              : cloneJson(next);
      }
      return out;
    }
  }

  return value.slice();
}

function tryCloneKnownObjectArray(value, start, length, first) {
  const plan = readShapeClonePlan(first, 0);
  if (plan === null) return null;

  const out = new Array(length);
  for (let i = 0; i < start; i++) {
    out[i] = value[i];
  }

  const firstClone = cloneObjectWithPlan(first, plan);
  if (firstClone === null) return null;
  out[start] = firstClone;

  for (let i = start + 1; i < length; i++) {
    const item = value[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
    const cloned = cloneObjectWithPlan(item, plan);
    if (cloned === null) return null;
    out[i] = cloned;
  }

  return out;
}

function cloneSmallObjectFromArray(value) {
  const plan = readShapeClonePlan(value, 0);
  if (plan !== null) {
    const cloned = cloneObjectWithPlan(value, plan);
    if (cloned !== null) return cloned;
  }

  const out = {};
  for (const key in value) {
    if (!hasOwn.call(value, key)) continue;
    const item = value[key];
    const cloned = item === null || typeof item !== 'object'
      ? item
      : Array.isArray(item)
        ? cloneArray(item)
        : cloneSmallObjectFromArray(item);
    if (key === '__proto__') {
      Object.defineProperty(out, key, {
        value: cloned,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      out[key] = cloned;
    }
  }
  return out;
}

function readShapeClonePlan(value, depth) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    depth > SHAPE_CLONE_MAX_DEPTH
  ) {
    return null;
  }

  const keys = Object.keys(value);
  if (keys.length === 0 || keys.length > SHAPE_CLONE_MAX_KEYS) return null;

  const fields = new Array(keys.length);
  const signatureParts = ['o', keys.length];
  for (let i = 0, length = keys.length; i < length; i++) {
    const item = value[keys[i]];
    const childPlan = readShapeCloneFieldPlan(item, depth + 1);
    if (childPlan === null) return null;
    fields[i] = childPlan;
    signatureParts[signatureParts.length] = childPlan.signature;
  }

  const signature = signatureParts.join('\u0000');
  const cached = shapeClonePlanCache.get(signature);
  if (cached !== undefined) return cached;

  const plan = { kind: 'object', keyCount: keys.length, fields, signature };
  rememberShapeClonePlan(signature, plan);
  return plan;
}

function readShapeCloneFieldPlan(value, depth) {
  if (value === null) return { kind: 'scalar', type: 'null', signature: 'n' };
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return { kind: 'scalar', type, signature: type.charAt(0) };
  }
  if (Array.isArray(value)) {
    return { kind: 'array', signature: 'a' };
  }
  return readShapeClonePlan(value, depth);
}

function rememberShapeClonePlan(signature, plan) {
  if (shapeClonePlanCache.size >= SHAPE_CLONE_CACHE_LIMIT && !shapeClonePlanCache.has(signature)) {
    const first = shapeClonePlanCache.keys().next();
    if (!first.done) shapeClonePlanCache.delete(first.value);
  }
  shapeClonePlanCache.set(signature, plan);
}

function cloneObjectWithPlan(value, plan) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== plan.keyCount) return null;

  const out = {};
  for (let i = 0, length = keys.length; i < length; i++) {
    const key = keys[i];
    const cloned = cloneValueWithPlan(value[key], plan.fields[i]);
    if (cloned === MISSING_SHAPE_CLONE_VALUE) return null;
    if (key === '__proto__') {
      Object.defineProperty(out, key, {
        value: cloned,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      out[key] = cloned;
    }
  }
  return out;
}

const MISSING_SHAPE_CLONE_VALUE = Symbol('missingShapeCloneValue');

function cloneValueWithPlan(value, plan) {
  if (plan.kind === 'scalar') {
    if (value === null) return plan.type === 'null' ? null : MISSING_SHAPE_CLONE_VALUE;
    return typeof value === plan.type ? value : MISSING_SHAPE_CLONE_VALUE;
  }
  if (plan.kind === 'array') {
    return Array.isArray(value) ? cloneArray(value) : MISSING_SHAPE_CLONE_VALUE;
  }
  const cloned = cloneObjectWithPlan(value, plan);
  return cloned === null ? MISSING_SHAPE_CLONE_VALUE : cloned;
}
