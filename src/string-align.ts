import { OP_STRING_SPLICE } from './constants.js';
import type { JsonPath, Patch } from './types.js';

const ANCHOR = 32;
const BLOCKS = 8;
const MAX_CANDIDATES = 3;
const MAX_OPERATIONS = 32;
const CHUNK = 256;

type Gap = { s: number; e: number; t: number; u: number; cost: number };
type Anchor = { s: number; t: number; cost: number; previous: Anchor | null; gap: Gap | null };
type Budget = { left: number };

/**
 * Optional, bounded text planner. Adapted mechanisms from OpenAI's 2026 edit
 * distance manuscript: cost-predicted bands (5.1) and endpoint cost envelopes
 * (4.1). Uses deterministic single-splice upper bounds, not the paper's random
 * seed/refinement tables. It inherits no approximation or near-linear theorem.
 * Every retained anchor is an exact UTF-16 substring match; all gaps are emitted.
 */
export function tryAlignString(
  patch: Patch, path: JsonPath, source: string, target: string,
  start: number, sourceEnd: number, targetEnd: number,
  costBands = true
): boolean {
  const sourceLength = sourceEnd - start;
  const targetLength = targetEnd - start;
  if (Math.min(sourceLength, targetLength) < 1024) return false;

  const budget: Budget = { left: Math.min(8 * 1024 * 1024, 12 * (sourceLength + targetLength)) };
  const radius = Math.min(2048, Math.max(128, Math.ceil(Math.max(sourceLength, targetLength) / 16)));
  let previous: Anchor[] = [{ s: start - ANCHOR, t: start - ANCHOR, cost: 0, previous: null, gap: null }];
  let matchedCuts = 0;

  // Wide coarse pass: retain several matches for ambiguous/repeated anchors.
  // Each edge is evaluated once and its verified gap is retained for replay.
  for (let j = 1; j < BLOCKS; j++) {
    const s = start + Math.floor(sourceLength * j / BLOCKS);
    const predicted = start + Math.floor(targetLength * j / BLOCKS);
    const matches = findAnchors(source, target, s, predicted, radius, start, targetEnd, budget);
    if (budget.left < 0) return false;
    if (matches.length === 0) continue;
    const next: Anchor[] = [];
    for (const t of matches) {
      let best: Anchor | null = null;
      for (const parent of previous) {
        if (parent.t + ANCHOR > t) continue;
        const gap = trimGap(source, target, parent.s + ANCHOR, s, parent.t + ANCHOR, t, budget);
        if (budget.left < 0) return false;
        const cost = parent.cost + gap.cost;
        if (best === null || cost < best.cost) best = { s, t, cost, previous: parent, gap };
      }
      if (best !== null) next.push(best);
    }
    if (next.length !== 0) { previous = next; matchedCuts++; }
  }
  if (matchedCuts === 0) return false;

  let best: Anchor | null = null;
  for (const parent of previous) {
    const gap = trimGap(source, target, parent.s + ANCHOR, sourceEnd, parent.t + ANCHOR, targetEnd, budget);
    const cost = parent.cost + gap.cost;
    if (best === null || cost < best.cost) best = { s: sourceEnd, t: targetEnd, cost, previous: parent, gap };
  }
  if (budget.left < 0 || best === null) return false;

  const gaps: Gap[] = [];
  for (let node = best; node !== null; node = node.previous) if (node.gap?.cost) gaps.push(node.gap);
  gaps.reverse();
  const refined: Gap[] = [];
  for (const gap of gaps) refineGap(source, target, gap, refined, budget, 0, costBands);
  if (budget.left < 0 || refined.length < 2 || refined.length > MAX_OPERATIONS) return false;

  // Conservative UTF-8 JSON size bound: each inserted UTF-16 unit costs at
  // most six bytes when escaped. Avoid serializing the full original payload.
  const overhead = 3 * JSON.stringify(path).length + 80;
  let upperBytes = refined.length * overhead;
  for (const gap of refined) upperBytes += 6 * (gap.u - gap.t);
  if (upperBytes >= targetLength) return false;

  // Left-to-right splices use target offsets: earlier edits have already moved
  // the current gap to that position. No sampled equality is trusted for replay.
  for (const gap of refined) {
    patch.push([OP_STRING_SPLICE, path.slice(), gap.t, gap.e - gap.s, target.slice(gap.t, gap.u)]);
  }
  return true;
}

function findAnchors(source: string, target: string, s: number, center: number, radius: number, low: number, high: number, budget: Budget): number[] {
  const probe = source.slice(s, s + ANCHOR);
  // Uniform runs provide little positional information. Decline them, rather
  // than spending the candidate budget on interchangeable matches.
  if (probe.length !== ANCHOR || probe === probe[0].repeat(ANCHOR)) return [];
  const from = Math.max(low, Math.floor(center - radius));
  const to = Math.min(high, Math.ceil(center + radius) + ANCHOR);
  if (to - from < ANCHOR) return [];
  budget.left -= (to - from) * MAX_CANDIDATES;
  if (budget.left < 0) return [];
  const window = target.slice(from, to);
  const matches: number[] = [];
  let at = window.indexOf(probe);
  while (at >= 0 && matches.length < MAX_CANDIDATES) {
    matches.push(from + at);
    at = window.indexOf(probe, at + 1);
  }
  return matches;
}

function trimGap(source: string, target: string, s: number, e: number, t: number, u: number, budget: Budget): Gap {
  // Charge compared input lengths, even if the native comparison exits early.
  budget.left -= (e - s) + (u - t);
  if (budget.left < 0) return { s, e, t, u, cost: Math.max(e - s, u - t) };
  while (s + CHUNK <= e && t + CHUNK <= u && source.slice(s, s + CHUNK) === target.slice(t, t + CHUNK)) { s += CHUNK; t += CHUNK; }
  while (s < e && t < u && source.charCodeAt(s) === target.charCodeAt(t)) { s++; t++; }
  while (e - CHUNK >= s && u - CHUNK >= t && source.slice(e - CHUNK, e) === target.slice(u - CHUNK, u)) { e -= CHUNK; u -= CHUNK; }
  while (e > s && u > t && source.charCodeAt(e - 1) === target.charCodeAt(u - 1)) { e--; u--; }
  return { s, e, t, u, cost: Math.max(e - s, u - t) };
}

function refineGap(source: string, target: string, gap: Gap, out: Gap[], budget: Budget, depth: number, costBands: boolean): void {
  const { s, e, t, u } = gap;
  if (gap.cost === 0) return;
  if (depth >= 4 || out.length >= MAX_OPERATIONS || Math.min(e - s, u - t) < 512 || budget.left < 0) { out.push(gap); return; }
  const cut = s + Math.floor((e - s) / 2);
  const delta = (u - t) - (e - s);
  const p0 = t - s;
  let center = t + Math.floor((u - t) / 2);
  const velocity = delta / gap.cost;

  // Try the inexpensive position band first. Cost envelopes are useful when
  // edit cost is concentrated unevenly and that band misses the alignment.
  let matches = findAnchors(source, target, cut, center, 96, t, u, budget);
  if (matches.length === 0 && costBands && Math.abs(velocity) < 0.95 && budget.left >= 0) {
    // Endpoint Lipschitz envelope: U(c) + |q-c| is an upper bound on
    // prefix edit cost at q. Its lower envelope is 1-Lipschitz. This is the
    // practical analogue of the paper's cone construction, using our coarse
    // upper bounds instead of its much more expensive approximation tables.
    const centers = [Math.max(t, Math.min(u, cut + p0)), center, Math.max(t, Math.min(u, cut + p0 + delta))];
    const costs = centers.map(c => prefixCost(source, target, s, cut, t, c, budget));
    for (let iteration = 0; iteration < 6; iteration++) {
      let phi = Infinity;
      for (let i = 0; i < centers.length; i++) phi = Math.min(phi, costs[i] + Math.abs(center - centers[i]));
      // Section 5.1: p = p0 + (net shift / estimated cost) * Phi(p).
      const next = Math.max(t, Math.min(u - ANCHOR, Math.round(cut + p0 + velocity * phi)));
      if (Math.abs(next - center) <= 1) { center = next; break; }
      center = next;
    }
    matches = findAnchors(source, target, cut, center, 96, t, u, budget);
  }
  if (budget.left < 0) { out.push(gap); return; }
  let chosen: { left: Gap; right: Gap; cost: number } | null = null;
  for (const at of matches) {
    const left = trimGap(source, target, s, cut, t, at, budget);
    const right = trimGap(source, target, cut + ANCHOR, e, at + ANCHOR, u, budget);
    const cost = left.cost + right.cost;
    if (cost < gap.cost && (chosen === null || cost < chosen.cost)) chosen = { left, right, cost };
  }
  if (chosen === null || budget.left < 0) { out.push(gap); return; }
  refineGap(source, target, chosen.left, out, budget, depth + 1, costBands);
  refineGap(source, target, chosen.right, out, budget, depth + 1, costBands);
}

// A single splice can greatly overestimate a prefix containing an insertion
// followed by a cropped endpoint. One verified interior anchor supplies a
// better (still conservative) seed before taking the Lipschitz envelope.
function prefixCost(source: string, target: string, s: number, e: number, t: number, u: number, budget: Budget): number {
  const gap = trimGap(source, target, s, e, t, u, budget);
  if (Math.min(gap.e - gap.s, gap.u - gap.t) < 256 || budget.left < 0) return gap.cost;
  const cut = gap.s + Math.floor((gap.e - gap.s) / 2);
  const center = gap.t + Math.floor((gap.u - gap.t) / 2);
  const matches = findAnchors(source, target, cut, center, 512, gap.t, gap.u, budget);
  let cost = gap.cost;
  for (const at of matches) {
    const left = trimGap(source, target, gap.s, cut, gap.t, at, budget);
    const right = trimGap(source, target, cut + ANCHOR, gap.e, at + ANCHOR, gap.u, budget);
    cost = Math.min(cost, left.cost + right.cost);
  }
  return cost;
}
