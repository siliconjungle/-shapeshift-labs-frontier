import type { JsonObject, JsonPath, JsonValue, PathSegment } from './types.js';

export type FrontierRegistryEntryKind =
  | 'feature'
  | 'method'
  | 'action'
  | 'query'
  | 'state'
  | 'subscription'
  | 'component'
  | 'effect'
  | 'route'
  | 'schema'
  | 'cache'
  | 'event'
  | 'job'
  | 'service'
  | 'module'
  | 'asset'
  | 'test'
  | 'fixture'
  | 'probe'
  | 'telemetry'
  | string;

export type FrontierRegistryPath = string | readonly PathSegment[];

export type FrontierRegistryEdgeKind =
  | 'belongs-to'
  | 'owns'
  | 'declares-read'
  | 'declares-write'
  | 'runtime-read'
  | 'runtime-write'
  | 'calls'
  | 'runtime-call'
  | 'depends-on'
  | 'invalidates'
  | 'affects'
  | 'touches'
  | 'handles'
  | 'observes'
  | 'produces'
  | 'consumes'
  | 'subscribes'
  | 'persists'
  | 'schedules'
  | 'emits'
  | 'covers'
  | 'declared-in'
  | 'documented-by'
  | 'tagged-as'
  | string;

export type FrontierRegistryRecordStatus = 'ok' | 'error' | 'pending' | string;

export interface FrontierRegistrySourceLocation {
  file: string;
  line?: number;
  column?: number;
  symbol?: string;
  exportName?: string;
  package?: string;
}

export type FrontierRegistrySource = FrontierRegistrySourceLocation | readonly FrontierRegistrySourceLocation[];

export interface FrontierRegistryEntry {
  id: string;
  kind: FrontierRegistryEntryKind;
  description?: string;
  package?: string;
  feature?: string;
  owner?: string;
  version?: string;
  contentHash?: string;
  source?: FrontierRegistrySource;
  reads?: readonly FrontierRegistryPath[];
  writes?: readonly FrontierRegistryPath[];
  calls?: readonly string[];
  dependsOn?: readonly string[];
  invalidates?: readonly string[];
  affects?: readonly string[];
  touches?: readonly string[];
  handles?: readonly string[];
  observes?: readonly string[];
  produces?: readonly string[];
  consumes?: readonly string[];
  emits?: readonly string[];
  covers?: readonly string[];
  docs?: readonly string[];
  tags?: readonly string[];
  metadata?: JsonObject;
}

export interface FrontierRegistryRecord {
  id: string;
  entryId: string;
  kind?: FrontierRegistryEntryKind;
  causeId?: string;
  parentId?: string;
  status?: FrontierRegistryRecordStatus;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  input?: JsonValue;
  output?: JsonValue;
  reads?: readonly FrontierRegistryPath[];
  writes?: readonly FrontierRegistryPath[];
  calls?: readonly string[];
  affected?: readonly string[];
  metadata?: JsonObject;
  error?: string;
}

export interface FrontierRegistryEdge {
  from: string;
  to: string;
  kind: FrontierRegistryEdgeKind;
  metadata?: JsonObject;
}

export interface FrontierRegistryGraph {
  kind: 'frontier.registry.graph';
  version: 1;
  generatedAt?: number;
  entries: FrontierRegistryEntry[];
  records: FrontierRegistryRecord[];
  edges: FrontierRegistryEdge[];
  metadata?: JsonObject;
}

export interface FrontierRegistryGraphInput {
  entries?: readonly FrontierRegistryEntry[];
  records?: readonly FrontierRegistryRecord[];
  edges?: readonly FrontierRegistryEdge[];
  generatedAt?: number;
  metadata?: JsonObject;
}

export interface FrontierRegistryImpactInput {
  ids?: readonly string[];
  paths?: readonly FrontierRegistryPath[];
  features?: readonly string[];
  packages?: readonly string[];
  tags?: readonly string[];
  files?: readonly string[];
  nodes?: readonly string[];
  direction?: 'forward' | 'reverse' | 'both';
}

export interface FrontierRegistryImpact {
  kind: 'frontier.registry.impact';
  version: 1;
  seeds: string[];
  nodes: string[];
  entries: FrontierRegistryEntry[];
  records: FrontierRegistryRecord[];
  edges: FrontierRegistryEdge[];
}

export interface FrontierRegistryOptions {
  generatedAt?: () => number;
  metadata?: JsonObject;
}

export interface FrontierRegistryRecordOptions {
  edges?: readonly FrontierRegistryEdge[];
}

export class FrontierRegistry {
  private readonly entries = new Map<string, FrontierRegistryEntry>();
  private readonly records: FrontierRegistryRecord[] = [];
  private readonly extraEdges: FrontierRegistryEdge[] = [];

  constructor(private readonly options: FrontierRegistryOptions = {}) {}

  register(entry: FrontierRegistryEntry): this {
    const normalized = normalizeEntry(entry);
    this.entries.set(normalized.id, normalized);
    return this;
  }

  unregister(id: string): boolean {
    return this.entries.delete(normalizeId(id, 'registry entry id'));
  }

  has(id: string): boolean {
    return this.entries.has(normalizeId(id, 'registry entry id'));
  }

  get(id: string): FrontierRegistryEntry {
    const entry = this.entries.get(normalizeId(id, 'registry entry id'));
    if (!entry) throw new TypeError('unknown frontier registry entry: ' + id);
    return cloneEntry(entry);
  }

  list(): FrontierRegistryEntry[] {
    return Array.from(this.entries.values(), cloneEntry);
  }

  record(record: FrontierRegistryRecord, options: FrontierRegistryRecordOptions = {}): this {
    this.records[this.records.length] = normalizeRecord(record);
    if (options.edges) {
      for (let i = 0; i < options.edges.length; i++) this.extraEdges[this.extraEdges.length] = normalizeEdge(options.edges[i]);
    }
    return this;
  }

  history(): FrontierRegistryRecord[] {
    return this.records.map(cloneRecord);
  }

  edge(edge: FrontierRegistryEdge): this {
    this.extraEdges[this.extraEdges.length] = normalizeEdge(edge);
    return this;
  }

  inspect(): FrontierRegistryGraph {
    return createFrontierRegistryGraph({
      entries: this.list(),
      records: this.history(),
      edges: this.extraEdges,
      generatedAt: this.options.generatedAt?.(),
      metadata: this.options.metadata
    });
  }

  impact(input: FrontierRegistryImpactInput): FrontierRegistryImpact {
    return frontierRegistryImpact(this.inspect(), input);
  }

  clearRecords(): void {
    this.records.length = 0;
  }
}

export interface FrontierRegistryValidationOptions {
  requireFeature?: boolean;
  requireSource?: boolean;
}

export type FrontierRegistryValidationSeverity = 'error' | 'warning';

export interface FrontierRegistryValidationIssue {
  severity: FrontierRegistryValidationSeverity;
  code: string;
  message: string;
  node?: string;
  entryId?: string;
  recordId?: string;
  edge?: FrontierRegistryEdge;
}

export interface FrontierRegistryValidation {
  kind: 'frontier.registry.validation';
  version: 1;
  valid: boolean;
  issues: FrontierRegistryValidationIssue[];
}

export interface FrontierRegistryFeatureSummary {
  id: string;
  entryCount: number;
  recordCount: number;
  entries: string[];
  packages: string[];
  owners: string[];
  kinds: string[];
  tags: string[];
  reads: string[];
  writes: string[];
  calls: string[];
  invalidates: string[];
  touches: string[];
  tests: string[];
  telemetry: string[];
}

export interface FrontierRegistryIndex {
  kind: 'frontier.registry.index';
  version: 1;
  generatedAt?: number;
  entriesById: Record<string, FrontierRegistryEntry>;
  recordsById: Record<string, FrontierRegistryRecord>;
  features: FrontierRegistryFeatureSummary[];
  packages: Record<string, string[]>;
  tags: Record<string, string[]>;
  files: Record<string, string[]>;
}

export interface FrontierRegistryQueryInput {
  ids?: readonly string[];
  kinds?: readonly string[];
  features?: readonly string[];
  packages?: readonly string[];
  tags?: readonly string[];
  files?: readonly string[];
  paths?: readonly FrontierRegistryPath[];
}

export interface FrontierRegistryQueryResult {
  kind: 'frontier.registry.query';
  version: 1;
  entries: FrontierRegistryEntry[];
  records: FrontierRegistryRecord[];
  edges: FrontierRegistryEdge[];
}

export interface FrontierRegistryTraceInput extends FrontierRegistryImpactInput {
  targets?: FrontierRegistryImpactInput;
  maxDepth?: number;
  maxPaths?: number;
}

export interface FrontierRegistryTracePath {
  nodes: string[];
  edges: FrontierRegistryEdge[];
}

export interface FrontierRegistryTrace {
  kind: 'frontier.registry.trace';
  version: 1;
  seeds: string[];
  targets: string[];
  paths: FrontierRegistryTracePath[];
}

export interface FrontierRegistryExplainInput extends FrontierRegistryImpactInput {
  targets?: FrontierRegistryImpactInput;
  maxTraceDepth?: number;
  maxTracePaths?: number;
  validation?: FrontierRegistryValidationOptions;
}

export interface FrontierRegistryExplainSummary {
  entryCount: number;
  recordCount: number;
  edgeCount: number;
  featureCount: number;
  packageCount: number;
  tagCount: number;
  fileCount: number;
  issueCount: number;
}

export interface FrontierRegistryExplain {
  kind: 'frontier.registry.explain';
  version: 1;
  summary: FrontierRegistryExplainSummary;
  features: FrontierRegistryFeatureSummary[];
  packages: Record<string, string[]>;
  tags: Record<string, string[]>;
  files: Record<string, string[]>;
  impact: FrontierRegistryImpact;
  traces?: FrontierRegistryTrace;
  validation: FrontierRegistryValidation;
}

export function createFrontierRegistry(options: FrontierRegistryOptions = {}): FrontierRegistry {
  return new FrontierRegistry(options);
}

export function createFrontierRegistryGraph(input: FrontierRegistryGraphInput = {}): FrontierRegistryGraph {
  const entries = (input.entries ?? []).map(normalizeEntry);
  const records = (input.records ?? []).map(normalizeRecord);
  const edges = (input.edges ?? []).map(normalizeEdge);
  for (const entry of entries) appendEntryEdges(edges, entry);
  for (const record of records) appendRecordEdges(edges, record);
  return {
    kind: 'frontier.registry.graph',
    version: 1,
    generatedAt: input.generatedAt,
    entries,
    records,
    edges: dedupeEdges(edges),
    metadata: input.metadata === undefined ? undefined : cloneJsonObject(input.metadata)
  };
}

export function frontierRegistryMergeGraphs(
  graphs: readonly FrontierRegistryGraph[],
  input: Omit<FrontierRegistryGraphInput, 'entries' | 'records' | 'edges'> = {}
): FrontierRegistryGraph {
  const entries: FrontierRegistryEntry[] = [];
  const records: FrontierRegistryRecord[] = [];
  const edges: FrontierRegistryEdge[] = [];
  for (let i = 0; i < graphs.length; i++) {
    const graph = graphs[i];
    for (let j = 0; j < graph.entries.length; j++) entries[entries.length] = graph.entries[j];
    for (let j = 0; j < graph.records.length; j++) records[records.length] = graph.records[j];
    for (let j = 0; j < graph.edges.length; j++) edges[edges.length] = graph.edges[j];
  }
  return createFrontierRegistryGraph({
    entries: dedupeEntries(entries),
    records: dedupeRecords(records),
    edges,
    generatedAt: input.generatedAt,
    metadata: input.metadata
  });
}

export function frontierRegistryImpact(
  graph: FrontierRegistryGraph,
  input: FrontierRegistryImpactInput
): FrontierRegistryImpact {
  const seeds = normalizeImpactSeeds(input);
  const seedSet = new Set(seeds);
  const visited = new Set<string>(seeds);
  const queue = seeds.slice();
  const direction = input.direction ?? 'both';

  for (const path of input.paths ?? []) {
    const normalized = normalizeRegistryPath(path);
    for (const edge of graph.edges) {
      if (edge.to.startsWith('path:') && registryPathsOverlap(edge.to.slice(5), normalized)) {
        enqueue(edge.to, visited, queue);
        enqueue(edge.from, visited, queue);
      }
      if (edge.from.startsWith('path:') && registryPathsOverlap(edge.from.slice(5), normalized)) {
        enqueue(edge.from, visited, queue);
        enqueue(edge.to, visited, queue);
      }
    }
  }

  while (queue.length !== 0) {
    const node = queue.shift() as string;
    for (const edge of graph.edges) {
      if ((direction === 'forward' || direction === 'both') && edge.from === node) enqueue(edge.to, visited, queue);
      if ((direction === 'reverse' || direction === 'both') && edge.to === node) enqueue(edge.from, visited, queue);
    }
  }

  const nodes = Array.from(visited).sort();
  const impacted = new Set(nodes);
  return {
    kind: 'frontier.registry.impact',
    version: 1,
    seeds: Array.from(seedSet).sort(),
    nodes,
    entries: graph.entries.filter((entry) => impacted.has(entryNode(entry.id))).map(cloneEntry),
    records: graph.records.filter((record) => impacted.has(recordNode(record.id))).map(cloneRecord),
    edges: graph.edges.filter((edge) => impacted.has(edge.from) || impacted.has(edge.to)).map(cloneEdge)
  };
}

export function frontierRegistryIndex(graph: FrontierRegistryGraph): FrontierRegistryIndex {
  const entriesById: Record<string, FrontierRegistryEntry> = {};
  const recordsById: Record<string, FrontierRegistryRecord> = {};
  const recordsByEntry = new Map<string, FrontierRegistryRecord[]>();
  const packages: Record<string, string[]> = {};
  const tags: Record<string, string[]> = {};
  const files: Record<string, string[]> = {};

  for (let i = 0; i < graph.entries.length; i++) {
    const entry = cloneEntry(graph.entries[i]);
    entriesById[entry.id] = entry;
    if (entry.package !== undefined) pushIndexValue(packages, entry.package, entry.id);
    for (const tag of entry.tags ?? []) pushIndexValue(tags, tag, entry.id);
    const sources = normalizeSourceList(entry.source);
    for (let j = 0; j < sources.length; j++) pushIndexValue(files, sources[j].file, entry.id);
  }

  for (let i = 0; i < graph.records.length; i++) {
    const record = cloneRecord(graph.records[i]);
    recordsById[record.id] = record;
    const bucket = recordsByEntry.get(record.entryId);
    if (bucket === undefined) recordsByEntry.set(record.entryId, [record]);
    else bucket[bucket.length] = record;
  }

  return {
    kind: 'frontier.registry.index',
    version: 1,
    generatedAt: graph.generatedAt,
    entriesById,
    recordsById,
    features: createFeatureSummaries(graph.entries, recordsByEntry).sort(compareFeatureSummary),
    packages: sortIndex(packages),
    tags: sortIndex(tags),
    files: sortIndex(files)
  };
}

export function frontierRegistryQuery(
  graph: FrontierRegistryGraph,
  input: FrontierRegistryQueryInput
): FrontierRegistryQueryResult {
  const recordsByEntry = groupRecordsByEntry(graph.records);
  const idSet = input.ids === undefined ? null : new Set(input.ids.map((id) => normalizeId(id, 'registry query id')));
  const kindSet = input.kinds === undefined ? null : new Set(input.kinds.map(String));
  const featureSet = input.features === undefined ? null : new Set(input.features.map(String));
  const packageSet = input.packages === undefined ? null : new Set(input.packages.map(String));
  const tagSet = input.tags === undefined ? null : new Set(input.tags.map(String));
  const fileSet = input.files === undefined ? null : new Set(input.files.map(String));
  const paths = (input.paths ?? []).map(normalizeRegistryPath);
  const entries = graph.entries.filter((entry) => {
    if (idSet !== null && !idSet.has(entry.id)) return false;
    if (kindSet !== null && !kindSet.has(entry.kind)) return false;
    if (featureSet !== null && (entry.feature === undefined || !featureSet.has(entry.feature))) return false;
    if (packageSet !== null && (entry.package === undefined || !packageSet.has(entry.package))) return false;
    if (tagSet !== null && !hasAny(entry.tags, tagSet)) return false;
    if (fileSet !== null && !hasAnySourceFile(entry.source, fileSet)) return false;
    if (paths.length !== 0 && !entryTouchesAnyPath(entry, paths) && !recordsTouchAnyPath(recordsByEntry.get(entry.id), paths)) return false;
    return true;
  }).map(cloneEntry);
  const selectedNodes = new Set(entries.map((entry) => entryNode(entry.id)));
  const records = graph.records.filter((record) => selectedNodes.has(entryNode(record.entryId))).map(cloneRecord);
  for (let i = 0; i < records.length; i++) selectedNodes.add(recordNode(records[i].id));
  return {
    kind: 'frontier.registry.query',
    version: 1,
    entries,
    records,
    edges: graph.edges.filter((edge) => selectedNodes.has(edge.from) || selectedNodes.has(edge.to)).map(cloneEdge)
  };
}

export function frontierRegistryValidateGraph(
  graph: FrontierRegistryGraph,
  options: FrontierRegistryValidationOptions = {}
): FrontierRegistryValidation {
  const issues: FrontierRegistryValidationIssue[] = [];
  const entryIds = new Set<string>();
  const recordIds = new Set<string>();

  for (let i = 0; i < graph.entries.length; i++) {
    const entry = graph.entries[i];
    if (entryIds.has(entry.id)) {
      issues[issues.length] = {
        severity: 'error',
        code: 'duplicate-entry',
        message: 'registry entry id is declared more than once: ' + entry.id,
        entryId: entry.id,
        node: entryNode(entry.id)
      };
    }
    entryIds.add(entry.id);
    if (options.requireFeature === true && entry.kind !== 'feature' && entry.feature === undefined) {
      issues[issues.length] = {
        severity: 'warning',
        code: 'missing-feature',
        message: 'registry entry has no feature owner: ' + entry.id,
        entryId: entry.id,
        node: entryNode(entry.id)
      };
    }
    if (options.requireSource === true && entry.source === undefined) {
      issues[issues.length] = {
        severity: 'warning',
        code: 'missing-source',
        message: 'registry entry has no source location: ' + entry.id,
        entryId: entry.id,
        node: entryNode(entry.id)
      };
    }
  }

  for (let i = 0; i < graph.records.length; i++) {
    const record = graph.records[i];
    if (recordIds.has(record.id)) {
      issues[issues.length] = {
        severity: 'error',
        code: 'duplicate-record',
        message: 'registry record id is declared more than once: ' + record.id,
        recordId: record.id,
        node: recordNode(record.id)
      };
    }
    recordIds.add(record.id);
    if (!entryIds.has(record.entryId)) {
      issues[issues.length] = {
        severity: 'error',
        code: 'record-entry-missing',
        message: 'registry record references an unknown entry: ' + record.entryId,
        recordId: record.id,
        node: recordNode(record.id)
      };
    }
  }

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    if (edge.from.startsWith('entry:') && !entryIds.has(edge.from.slice(6))) {
      issues[issues.length] = {
        severity: 'error',
        code: 'edge-from-entry-missing',
        message: 'registry edge starts at an unknown entry: ' + edge.from,
        node: edge.from,
        edge: cloneEdge(edge)
      };
    }
    if (edge.to.startsWith('entry:') && !entryIds.has(edge.to.slice(6))) {
      issues[issues.length] = {
        severity: 'error',
        code: 'edge-to-entry-missing',
        message: 'registry edge targets an unknown entry: ' + edge.to,
        node: edge.to,
        edge: cloneEdge(edge)
      };
    }
    if (edge.from.startsWith('record:') && !recordIds.has(edge.from.slice(7))) {
      issues[issues.length] = {
        severity: 'error',
        code: 'edge-from-record-missing',
        message: 'registry edge starts at an unknown record: ' + edge.from,
        node: edge.from,
        edge: cloneEdge(edge)
      };
    }
    if (edge.to.startsWith('record:') && !recordIds.has(edge.to.slice(7))) {
      issues[issues.length] = {
        severity: 'error',
        code: 'edge-to-record-missing',
        message: 'registry edge targets an unknown record: ' + edge.to,
        node: edge.to,
        edge: cloneEdge(edge)
      };
    }
  }

  return {
    kind: 'frontier.registry.validation',
    version: 1,
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues
  };
}

export function frontierRegistryTrace(graph: FrontierRegistryGraph, input: FrontierRegistryTraceInput): FrontierRegistryTrace {
  const seeds = normalizeImpactSeeds(input);
  const targets = normalizeImpactSeeds(input.targets ?? {});
  const targetSet = new Set(targets);
  const maxDepth = input.maxDepth === undefined ? 8 : Math.max(1, Math.floor(input.maxDepth));
  const maxPaths = input.maxPaths === undefined ? 16 : Math.max(1, Math.floor(input.maxPaths));
  const direction = input.direction ?? 'both';
  const adjacency = createTraceAdjacency(graph.edges, direction);
  const queue: Array<{ node: string; nodes: string[]; edges: FrontierRegistryEdge[] }> = [];
  const bestDepth = new Map<string, number>();
  const paths: FrontierRegistryTracePath[] = [];

  for (let i = 0; i < seeds.length; i++) {
    queue[queue.length] = { node: seeds[i], nodes: [seeds[i]], edges: [] };
    bestDepth.set(seeds[i], 0);
  }

  while (queue.length !== 0 && paths.length < maxPaths) {
    const item = queue.shift() as { node: string; nodes: string[]; edges: FrontierRegistryEdge[] };
    if (targetSet.size !== 0 && targetSet.has(item.node) && item.edges.length !== 0) {
      paths[paths.length] = { nodes: item.nodes.slice(), edges: item.edges.map(cloneEdge) };
      continue;
    }
    if (item.edges.length >= maxDepth) continue;
    const nextEdges = adjacency.get(item.node);
    if (nextEdges === undefined) continue;
    for (let i = 0; i < nextEdges.length; i++) {
      const edge = nextEdges[i];
      const nextNode = edge.from === item.node ? edge.to : edge.from;
      if (item.nodes.includes(nextNode)) continue;
      const nextDepth = item.edges.length + 1;
      const seenDepth = bestDepth.get(nextNode);
      if (seenDepth !== undefined && seenDepth < nextDepth) continue;
      bestDepth.set(nextNode, nextDepth);
      queue[queue.length] = {
        node: nextNode,
        nodes: item.nodes.concat(nextNode),
        edges: item.edges.concat(edge)
      };
    }
  }

  return {
    kind: 'frontier.registry.trace',
    version: 1,
    seeds,
    targets,
    paths
  };
}

export function frontierRegistryExplain(
  graph: FrontierRegistryGraph,
  input: FrontierRegistryExplainInput = {}
): FrontierRegistryExplain {
  const index = frontierRegistryIndex(graph);
  const validation = frontierRegistryValidateGraph(graph, input.validation);
  const impact = frontierRegistryImpact(graph, input);
  const traces = input.targets === undefined
    ? undefined
    : frontierRegistryTrace(graph, {
      ...input,
      targets: input.targets,
      maxDepth: input.maxTraceDepth,
      maxPaths: input.maxTracePaths
    });
  return {
    kind: 'frontier.registry.explain',
    version: 1,
    summary: {
      entryCount: graph.entries.length,
      recordCount: graph.records.length,
      edgeCount: graph.edges.length,
      featureCount: index.features.length,
      packageCount: Object.keys(index.packages).length,
      tagCount: Object.keys(index.tags).length,
      fileCount: Object.keys(index.files).length,
      issueCount: validation.issues.length
    },
    features: index.features,
    packages: index.packages,
    tags: index.tags,
    files: index.files,
    impact,
    traces,
    validation
  };
}

export function frontierRegistryEntryNode(id: string): string {
  return entryNode(normalizeId(id, 'registry entry id'));
}

export function frontierRegistryRecordNode(id: string): string {
  return recordNode(normalizeId(id, 'registry record id'));
}

export function frontierRegistryPathNode(path: FrontierRegistryPath): string {
  return pathNode(normalizeRegistryPath(path));
}

export function frontierRegistryFeatureNode(feature: string): string {
  return featureNode(String(feature));
}

export function frontierRegistryPackageNode(packageName: string): string {
  return packageNode(String(packageName));
}

export function frontierRegistryTagNode(tag: string): string {
  return tagNode(String(tag));
}

export function frontierRegistryFileNode(file: string): string {
  return fileNode(String(file));
}

export function frontierRegistryNode(kind: string, id: string): string {
  return typedNode(normalizeId(kind, 'registry node kind'), normalizeId(id, 'registry node id'));
}

export function normalizeFrontierRegistryPath(path: FrontierRegistryPath): string {
  return normalizeRegistryPath(path);
}

function appendEntryEdges(edges: FrontierRegistryEdge[], entry: FrontierRegistryEntry): void {
  const from = entryNode(entry.id);
  if (entry.feature !== undefined) edges[edges.length] = { from, to: featureNode(entry.feature), kind: 'belongs-to' };
  if (entry.package !== undefined) edges[edges.length] = { from, to: packageNode(entry.package), kind: 'belongs-to' };
  for (const source of normalizeSourceList(entry.source)) {
    edges[edges.length] = { from, to: fileNode(source.file), kind: 'declared-in' };
  }
  appendPathEdges(edges, from, entry.reads, 'declares-read');
  appendPathEdges(edges, from, entry.writes, 'declares-write');
  appendIdEdges(edges, from, entry.calls, 'calls');
  appendIdEdges(edges, from, entry.dependsOn, 'depends-on');
  appendIdEdges(edges, from, entry.invalidates, 'invalidates');
  appendNodeEdges(edges, from, entry.affects, 'affects');
  appendNodeEdges(edges, from, entry.touches, 'touches');
  appendNodeEdges(edges, from, entry.handles, 'handles');
  appendNodeEdges(edges, from, entry.observes, 'observes');
  appendNodeEdges(edges, from, entry.produces, 'produces');
  appendNodeEdges(edges, from, entry.consumes, 'consumes');
  appendNodeEdges(edges, from, entry.emits, 'emits');
  appendNodeEdges(edges, from, entry.covers, 'covers');
  appendNodeEdges(edges, from, entry.docs, 'documented-by');
  for (const tag of entry.tags ?? []) edges[edges.length] = { from, to: tagNode(tag), kind: 'tagged-as' };
}

function appendRecordEdges(edges: FrontierRegistryEdge[], record: FrontierRegistryRecord): void {
  const from = recordNode(record.id);
  edges[edges.length] = { from, to: entryNode(record.entryId), kind: 'belongs-to' };
  appendPathEdges(edges, from, record.reads, 'runtime-read');
  appendPathEdges(edges, from, record.writes, 'runtime-write');
  appendIdEdges(edges, from, record.calls, 'runtime-call');
  appendNodeEdges(edges, from, record.affected, 'affects');
}

function appendPathEdges(
  edges: FrontierRegistryEdge[],
  from: string,
  paths: readonly FrontierRegistryPath[] | undefined,
  kind: FrontierRegistryEdgeKind
): void {
  if (!paths) return;
  for (let i = 0; i < paths.length; i++) edges[edges.length] = { from, to: pathNode(normalizeRegistryPath(paths[i])), kind };
}

function appendIdEdges(
  edges: FrontierRegistryEdge[],
  from: string,
  ids: readonly string[] | undefined,
  kind: FrontierRegistryEdgeKind
): void {
  if (!ids) return;
  for (let i = 0; i < ids.length; i++) edges[edges.length] = { from, to: entryNode(normalizeId(ids[i], 'registry target id')), kind };
}

function appendNodeEdges(
  edges: FrontierRegistryEdge[],
  from: string,
  nodes: readonly string[] | undefined,
  kind: FrontierRegistryEdgeKind
): void {
  if (!nodes) return;
  for (let i = 0; i < nodes.length; i++) edges[edges.length] = { from, to: normalizeNode(nodes[i]), kind };
}

function normalizeEntry(entry: FrontierRegistryEntry): FrontierRegistryEntry {
  const out: FrontierRegistryEntry = {
    id: normalizeId(entry.id, 'registry entry id'),
    kind: normalizeId(entry.kind, 'registry entry kind')
  };
  if (entry.description !== undefined) out.description = String(entry.description);
  if (entry.package !== undefined) out.package = String(entry.package);
  if (entry.feature !== undefined) out.feature = String(entry.feature);
  if (entry.owner !== undefined) out.owner = String(entry.owner);
  if (entry.version !== undefined) out.version = String(entry.version);
  if (entry.contentHash !== undefined) out.contentHash = String(entry.contentHash);
  if (entry.source !== undefined) out.source = normalizeSource(entry.source);
  if (entry.reads !== undefined) out.reads = clonePathList(entry.reads);
  if (entry.writes !== undefined) out.writes = clonePathList(entry.writes);
  if (entry.calls !== undefined) out.calls = uniqueStrings(entry.calls);
  if (entry.dependsOn !== undefined) out.dependsOn = uniqueStrings(entry.dependsOn);
  if (entry.invalidates !== undefined) out.invalidates = uniqueStrings(entry.invalidates);
  if (entry.affects !== undefined) out.affects = uniqueStrings(entry.affects);
  if (entry.touches !== undefined) out.touches = uniqueStrings(entry.touches);
  if (entry.handles !== undefined) out.handles = uniqueStrings(entry.handles);
  if (entry.observes !== undefined) out.observes = uniqueStrings(entry.observes);
  if (entry.produces !== undefined) out.produces = uniqueStrings(entry.produces);
  if (entry.consumes !== undefined) out.consumes = uniqueStrings(entry.consumes);
  if (entry.emits !== undefined) out.emits = uniqueStrings(entry.emits);
  if (entry.covers !== undefined) out.covers = uniqueStrings(entry.covers);
  if (entry.docs !== undefined) out.docs = uniqueStrings(entry.docs);
  if (entry.tags !== undefined) out.tags = uniqueStrings(entry.tags);
  if (entry.metadata !== undefined) out.metadata = cloneJsonObject(entry.metadata);
  return out;
}

function normalizeRecord(record: FrontierRegistryRecord): FrontierRegistryRecord {
  const out: FrontierRegistryRecord = {
    id: normalizeId(record.id, 'registry record id'),
    entryId: normalizeId(record.entryId, 'registry record entry id')
  };
  if (record.kind !== undefined) out.kind = String(record.kind);
  if (record.causeId !== undefined) out.causeId = String(record.causeId);
  if (record.parentId !== undefined) out.parentId = String(record.parentId);
  if (record.status !== undefined) out.status = String(record.status);
  if (record.startedAt !== undefined) out.startedAt = Number(record.startedAt);
  if (record.endedAt !== undefined) out.endedAt = Number(record.endedAt);
  if (record.durationMs !== undefined) out.durationMs = Number(record.durationMs);
  if (record.input !== undefined) out.input = cloneJsonValue(record.input);
  if (record.output !== undefined) out.output = cloneJsonValue(record.output);
  if (record.reads !== undefined) out.reads = clonePathList(record.reads);
  if (record.writes !== undefined) out.writes = clonePathList(record.writes);
  if (record.calls !== undefined) out.calls = uniqueStrings(record.calls);
  if (record.affected !== undefined) out.affected = uniqueStrings(record.affected);
  if (record.metadata !== undefined) out.metadata = cloneJsonObject(record.metadata);
  if (record.error !== undefined) out.error = String(record.error);
  return out;
}

function normalizeEdge(edge: FrontierRegistryEdge): FrontierRegistryEdge {
  const out: FrontierRegistryEdge = {
    from: normalizeNode(edge.from),
    to: normalizeNode(edge.to),
    kind: normalizeId(edge.kind, 'registry edge kind')
  };
  if (edge.metadata !== undefined) out.metadata = cloneJsonObject(edge.metadata);
  return out;
}

function normalizeImpactSeeds(input: FrontierRegistryImpactInput): string[] {
  const seeds: string[] = [];
  for (const id of input.ids ?? []) pushUnique(seeds, entryNode(normalizeId(id, 'registry impact id')));
  for (const path of input.paths ?? []) pushUnique(seeds, pathNode(normalizeRegistryPath(path)));
  for (const feature of input.features ?? []) pushUnique(seeds, featureNode(String(feature)));
  for (const packageName of input.packages ?? []) pushUnique(seeds, packageNode(String(packageName)));
  for (const tag of input.tags ?? []) pushUnique(seeds, tagNode(String(tag)));
  for (const file of input.files ?? []) pushUnique(seeds, fileNode(String(file)));
  for (const node of input.nodes ?? []) pushUnique(seeds, normalizeNode(node));
  return seeds;
}

function normalizeRegistryPath(path: FrontierRegistryPath): string {
  if (typeof path === 'string') return path.startsWith('/') ? path : '/' + path;
  return '/' + path.map(escapePointerSegment).join('/');
}

function registryPathsOverlap(left: string, right: string): boolean {
  if (left === right || left === '/*' || right === '/*') return true;
  const leftParts = splitPointer(left);
  const rightParts = splitPointer(right);
  const length = Math.min(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i++) {
    if (leftParts[i] === '*' || rightParts[i] === '*') continue;
    if (leftParts[i] !== rightParts[i]) return false;
  }
  return leftParts.length === rightParts.length ||
    leftParts[leftParts.length - 1] === '*' ||
    rightParts[rightParts.length - 1] === '*';
}

function splitPointer(path: string): string[] {
  if (path === '' || path === '/') return [];
  return path.replace(/^\//, '').split('/');
}

function escapePointerSegment(segment: PathSegment): string {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function entryNode(id: string): string {
  return 'entry:' + id;
}

function recordNode(id: string): string {
  return 'record:' + id;
}

function pathNode(path: string): string {
  return 'path:' + path;
}

function featureNode(feature: string): string {
  return 'feature:' + feature;
}

function packageNode(packageName: string): string {
  return 'package:' + packageName;
}

function tagNode(tag: string): string {
  return 'tag:' + tag;
}

function fileNode(file: string): string {
  return 'file:' + file;
}

function typedNode(kind: string, id: string): string {
  return kind + ':' + id;
}

function normalizeNode(node: string): string {
  const value = String(node);
  if (
    value.startsWith('entry:') ||
    value.startsWith('record:') ||
    value.startsWith('path:') ||
    value.startsWith('feature:') ||
    value.startsWith('package:') ||
    value.startsWith('tag:') ||
    value.startsWith('file:') ||
    value.startsWith('node:')
  ) {
    return value;
  }
  if (/^[a-z][a-z0-9.-]*:.+$/i.test(value)) return value;
  return 'node:' + value;
}

function normalizeId(id: string, label: string): string {
  if (typeof id !== 'string' || id.length === 0) throw new TypeError(label + ' must be a non-empty string');
  return id;
}

function cloneEntry(entry: FrontierRegistryEntry): FrontierRegistryEntry {
  return normalizeEntry(entry);
}

function cloneRecord(record: FrontierRegistryRecord): FrontierRegistryRecord {
  return normalizeRecord(record);
}

function cloneEdge(edge: FrontierRegistryEdge): FrontierRegistryEdge {
  return normalizeEdge(edge);
}

function clonePathList(paths: readonly FrontierRegistryPath[]): FrontierRegistryPath[] {
  return paths.map((path) => typeof path === 'string' ? normalizeRegistryPath(path) : path.slice() as JsonPath);
}

function normalizeSource(source: FrontierRegistrySource): FrontierRegistrySource {
  const sources = normalizeSourceList(source);
  return Array.isArray(source) ? sources : sources[0];
}

function normalizeSourceList(source: FrontierRegistrySource | undefined): FrontierRegistrySourceLocation[] {
  if (source === undefined) return [];
  const list = Array.isArray(source) ? source : [source];
  const out: FrontierRegistrySourceLocation[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item === null || typeof item !== 'object') throw new TypeError('registry source location must be an object');
    const normalized: FrontierRegistrySourceLocation = {
      file: normalizeId(String(item.file), 'registry source file')
    };
    if (item.line !== undefined) normalized.line = Number(item.line);
    if (item.column !== undefined) normalized.column = Number(item.column);
    if (item.symbol !== undefined) normalized.symbol = String(item.symbol);
    if (item.exportName !== undefined) normalized.exportName = String(item.exportName);
    if (item.package !== undefined) normalized.package = String(item.package);
    out[out.length] = normalized;
  }
  return out;
}

function uniqueStrings(values: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) pushUnique(out, String(values[i]));
  return out;
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values[values.length] = value;
}

function enqueue(node: string, visited: Set<string>, queue: string[]): void {
  if (visited.has(node)) return;
  visited.add(node);
  queue[queue.length] = node;
}

function dedupeEdges(edges: readonly FrontierRegistryEdge[]): FrontierRegistryEdge[] {
  const seen = new Set<string>();
  const out: FrontierRegistryEdge[] = [];
  for (const edge of edges) {
    const key = edge.from + '\0' + edge.to + '\0' + edge.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out[out.length] = cloneEdge(edge);
  }
  return out;
}

function dedupeEntries(entries: readonly FrontierRegistryEntry[]): FrontierRegistryEntry[] {
  const seen = new Set<string>();
  const out: FrontierRegistryEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = normalizeEntry(entries[i]);
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out[out.length] = entry;
  }
  return out;
}

function dedupeRecords(records: readonly FrontierRegistryRecord[]): FrontierRegistryRecord[] {
  const seen = new Set<string>();
  const out: FrontierRegistryRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = normalizeRecord(records[i]);
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    out[out.length] = record;
  }
  return out;
}

function createFeatureSummaries(
  entries: readonly FrontierRegistryEntry[],
  recordsByEntry: Map<string, FrontierRegistryRecord[]>
): FrontierRegistryFeatureSummary[] {
  const summaries = new Map<string, FrontierRegistryFeatureSummary>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const feature = entry.feature ?? entry.id;
    const summary = summaries.get(feature) ?? createFeatureSummary(feature);
    summaries.set(feature, summary);
    summary.entryCount++;
    pushUnique(summary.entries, entry.id);
    if (entry.package !== undefined) pushUnique(summary.packages, entry.package);
    if (entry.owner !== undefined) pushUnique(summary.owners, entry.owner);
    pushUnique(summary.kinds, entry.kind);
    for (const tag of entry.tags ?? []) pushUnique(summary.tags, tag);
    for (const read of entry.reads ?? []) pushUnique(summary.reads, normalizeRegistryPath(read));
    for (const write of entry.writes ?? []) pushUnique(summary.writes, normalizeRegistryPath(write));
    for (const call of entry.calls ?? []) pushUnique(summary.calls, call);
    for (const dependency of entry.dependsOn ?? []) pushUnique(summary.calls, dependency);
    for (const invalidated of entry.invalidates ?? []) pushUnique(summary.invalidates, invalidated);
    for (const touched of entry.touches ?? []) pushUnique(summary.touches, normalizeNode(touched));
    if (entry.kind === 'test' || (entry.tags ?? []).includes('test')) pushUnique(summary.tests, entry.id);
    if (entry.kind === 'telemetry' || (entry.tags ?? []).includes('telemetry')) pushUnique(summary.telemetry, entry.id);
    const records = recordsByEntry.get(entry.id);
    if (records !== undefined) {
      summary.recordCount += records.length;
      for (let j = 0; j < records.length; j++) {
        for (const read of records[j].reads ?? []) pushUnique(summary.reads, normalizeRegistryPath(read));
        for (const write of records[j].writes ?? []) pushUnique(summary.writes, normalizeRegistryPath(write));
        for (const call of records[j].calls ?? []) pushUnique(summary.calls, call);
        for (const affected of records[j].affected ?? []) pushUnique(summary.touches, normalizeNode(affected));
      }
    }
  }
  const out = Array.from(summaries.values());
  for (let i = 0; i < out.length; i++) sortFeatureSummary(out[i]);
  return out;
}

function groupRecordsByEntry(records: readonly FrontierRegistryRecord[]): Map<string, FrontierRegistryRecord[]> {
  const out = new Map<string, FrontierRegistryRecord[]>();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const bucket = out.get(record.entryId);
    if (bucket === undefined) out.set(record.entryId, [record]);
    else bucket[bucket.length] = record;
  }
  return out;
}

function createFeatureSummary(id: string): FrontierRegistryFeatureSummary {
  return {
    id,
    entryCount: 0,
    recordCount: 0,
    entries: [],
    packages: [],
    owners: [],
    kinds: [],
    tags: [],
    reads: [],
    writes: [],
    calls: [],
    invalidates: [],
    touches: [],
    tests: [],
    telemetry: []
  };
}

function sortFeatureSummary(summary: FrontierRegistryFeatureSummary): void {
  summary.entries.sort();
  summary.packages.sort();
  summary.owners.sort();
  summary.kinds.sort();
  summary.tags.sort();
  summary.reads.sort();
  summary.writes.sort();
  summary.calls.sort();
  summary.invalidates.sort();
  summary.touches.sort();
  summary.tests.sort();
  summary.telemetry.sort();
}

function compareFeatureSummary(left: FrontierRegistryFeatureSummary, right: FrontierRegistryFeatureSummary): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function pushIndexValue(index: Record<string, string[]>, key: string, value: string): void {
  const bucket = index[key] ?? (index[key] = []);
  pushUnique(bucket, value);
}

function sortIndex(index: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of Object.keys(index).sort()) out[key] = index[key].slice().sort();
  return out;
}

function hasAny(values: readonly string[] | undefined, set: Set<string>): boolean {
  if (values === undefined) return false;
  for (let i = 0; i < values.length; i++) {
    if (set.has(values[i])) return true;
  }
  return false;
}

function hasAnySourceFile(source: FrontierRegistrySource | undefined, set: Set<string>): boolean {
  const sources = normalizeSourceList(source);
  for (let i = 0; i < sources.length; i++) {
    if (set.has(sources[i].file)) return true;
  }
  return false;
}

function entryTouchesAnyPath(entry: FrontierRegistryEntry, paths: readonly string[]): boolean {
  const entryPaths = [
    ...(entry.reads ?? []).map(normalizeRegistryPath),
    ...(entry.writes ?? []).map(normalizeRegistryPath)
  ];
  for (let i = 0; i < entryPaths.length; i++) {
    for (let j = 0; j < paths.length; j++) {
      if (registryPathsOverlap(entryPaths[i], paths[j])) return true;
    }
  }
  return false;
}

function recordsTouchAnyPath(records: readonly FrontierRegistryRecord[] | undefined, paths: readonly string[]): boolean {
  if (records === undefined) return false;
  for (let i = 0; i < records.length; i++) {
    const recordPaths = [
      ...(records[i].reads ?? []).map(normalizeRegistryPath),
      ...(records[i].writes ?? []).map(normalizeRegistryPath)
    ];
    for (let j = 0; j < recordPaths.length; j++) {
      for (let k = 0; k < paths.length; k++) {
        if (registryPathsOverlap(recordPaths[j], paths[k])) return true;
      }
    }
  }
  return false;
}

function createTraceAdjacency(
  edges: readonly FrontierRegistryEdge[],
  direction: 'forward' | 'reverse' | 'both'
): Map<string, FrontierRegistryEdge[]> {
  const adjacency = new Map<string, FrontierRegistryEdge[]>();
  for (let i = 0; i < edges.length; i++) {
    const edge = cloneEdge(edges[i]);
    if (direction === 'forward' || direction === 'both') pushAdjacency(adjacency, edge.from, edge);
    if (direction === 'reverse' || direction === 'both') pushAdjacency(adjacency, edge.to, edge);
  }
  return adjacency;
}

function pushAdjacency(adjacency: Map<string, FrontierRegistryEdge[]>, node: string, edge: FrontierRegistryEdge): void {
  const bucket = adjacency.get(node);
  if (bucket === undefined) adjacency.set(node, [edge]);
  else bucket[bucket.length] = edge;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
