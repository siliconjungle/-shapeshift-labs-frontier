import assert from 'node:assert';

const frontier = await import('../dist/index.js');
const args = parseArgs(process.argv.slice(2));
const cases = readPositiveInt(args.cases, 1000);
let seed = readSeed(args.seed);

for (let i = 0; i < cases; i++) {
  const before = makeJson(0);
  const after = mutate(frontier.cloneJson(before), 0);
  const options = (i % 5) === 0 ? { stable: true } : undefined;
  const patch = frontier.diff(before, after, options);
  frontier.assertPatch(patch);
  assert.deepStrictEqual(frontier.applyPatchImmutable(before, patch), after, 'immutable case ' + i);
  assert.deepStrictEqual(frontier.applyPatch(frontier.cloneJson(before), patch, { cloneValues: true }), after, 'mutable case ' + i);

  const normalized = frontier.normalizePatch(patch);
  frontier.assertPatch(normalized);
  assert.deepStrictEqual(frontier.applyPatchImmutable(before, normalized), after, 'normalized case ' + i);

  if ((i % 7) === 0) {
    const stableA = frontier.diffStable(before, after);
    const stableB = frontier.diffStable(before, after);
    assert.deepStrictEqual(stableA, stableB, 'stable deterministic case ' + i);
    assert.deepStrictEqual(frontier.applyPatchImmutable(before, stableA), after, 'stable apply case ' + i);
  }
}

console.log('frontier core diff fuzz passed cases=' + cases + ' seed=' + seed);

function makeJson(depth) {
  if (depth >= 4) return makeScalar();
  const choice = nextRandom() % 6;
  if (choice <= 2) return makeScalar();
  if (choice === 3) {
    const length = nextRandom() % 5;
    const array = new Array(length);
    for (let i = 0; i < length; i++) array[i] = makeJson(depth + 1);
    return array;
  }
  const count = nextRandom() % 5;
  const object = {};
  for (let i = 0; i < count; i++) object['k' + i + '_' + (nextRandom() % 7)] = makeJson(depth + 1);
  return object;
}

function makeScalar() {
  const choice = nextRandom() % 6;
  if (choice === 0) return null;
  if (choice === 1) return (nextRandom() & 1) === 1;
  if (choice === 2) return (nextRandom() % 2000) - 1000;
  if (choice === 3) return '';
  return makeString();
}

function makeString() {
  const alphabet = 'abcdef0123456789_ ';
  const length = nextRandom() % 12;
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[nextRandom() % alphabet.length];
  return out;
}

function mutate(value, depth) {
  if (depth >= 4 || value === null || typeof value !== 'object') return makeJson(depth);
  if (Array.isArray(value)) return mutateArray(value, depth);
  return mutateObject(value, depth);
}

function mutateArray(array, depth) {
  const choice = nextRandom() % 5;
  if (choice === 0 || array.length === 0) {
    array.splice(nextRandom() % (array.length + 1), 0, makeJson(depth + 1));
    return array;
  }
  if (choice === 1) {
    array.splice(nextRandom() % array.length, 1);
    return array;
  }
  if (choice === 2) {
    const index = nextRandom() % array.length;
    array[index] = mutate(array[index], depth + 1);
    return array;
  }
  if (choice === 3 && array.length > 1) {
    const from = nextRandom() % array.length;
    const item = array.splice(from, 1)[0];
    array.splice(nextRandom() % (array.length + 1), 0, item);
    return array;
  }
  array.push(makeJson(depth + 1));
  return array;
}

function mutateObject(object, depth) {
  const keys = Object.keys(object);
  const choice = nextRandom() % 4;
  if (choice === 0 || keys.length === 0) {
    object['n' + (nextRandom() % 50)] = makeJson(depth + 1);
    return object;
  }
  const key = keys[nextRandom() % keys.length];
  if (choice === 1) {
    delete object[key];
    return object;
  }
  object[key] = mutate(object[key], depth + 1);
  return object;
}

function nextRandom() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cases') out.cases = argv[++i];
    else if (arg === '--seed') out.seed = argv[++i];
    else throw new Error('unknown argument: ' + arg);
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function readSeed(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number >>> 0 : 0x9e3779b9;
}
