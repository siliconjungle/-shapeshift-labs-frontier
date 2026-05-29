import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const self = fileURLToPath(import.meta.url);
const centralCandidates = [
  process.env.FRONTIER_PACKAGE_README_SCRIPT,
  path.resolve(packageRoot, '..', 'json-diff', 'benchmarks', 'package-readme-sections.js'),
  path.resolve(packageRoot, '..', '..', 'benchmarks', 'package-readme-sections.js')
].filter(Boolean);

let delegated = false;
for (const candidate of centralCandidates) {
  const resolved = path.resolve(candidate);
  if (resolved !== self && fs.existsSync(resolved)) {
    await import(pathToFileURL(resolved).href);
    delegated = true;
    break;
  }
}

if (!delegated) {
  const packages = [
  {
    "id": "frontier",
    "name": "@shapeshift-labs/frontier",
    "role": "Core JSON diff/apply, compact patch tuples, JSON Pointer, equality, clone, validation, Unicode helpers, and tiny dependency-free runtime budget/scheduler primitives.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier",
    "repoName": "siliconjungle/-shapeshift-labs-frontier",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier"
  },
  {
    "id": "frontier-query",
    "name": "@shapeshift-labs/frontier-query",
    "role": "Shared query-key, selector path, condition, entity identity, and table-shape primitives.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-query",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-query",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-query"
  },
  {
    "id": "frontier-codec",
    "name": "@shapeshift-labs/frontier-codec",
    "role": "Patch serialization, binary frames, canonical JSON, and patch-history codecs.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-codec",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-codec",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-codec"
  },
  {
    "id": "frontier-engine",
    "name": "@shapeshift-labs/frontier-engine",
    "role": "Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-engine",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-engine",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-engine"
  },
  {
    "id": "frontier-state",
    "name": "@shapeshift-labs/frontier-state",
    "role": "Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-state",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-state",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-state"
  },
  {
    "id": "frontier-dataflow",
    "name": "@shapeshift-labs/frontier-dataflow",
    "role": "Serializable incremental dataflow and materialized-view graphs for Frontier apps, including selectors, dependency DAGs, filters, joins, aggregations, stale paths, recompute budgets, output patches, provenance records, and proof of why derived views changed.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-dataflow",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-dataflow",
    "repoUrl": "https://github.com/siliconjungle/siliconjungle--shapeshift-labs-frontier-dataflow"
  },
  {
    "id": "frontier-state-cache",
    "name": "@shapeshift-labs/frontier-state-cache",
    "role": "Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, scheduled persistence, and mutation bridge.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-state-cache",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache"
  },
  {
    "id": "frontier-state-cache-idb",
    "name": "@shapeshift-labs/frontier-state-cache-idb",
    "role": "IndexedDB persistence adapter for Frontier state-cache snapshots and durable change logs.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-idb",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-state-cache-idb",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-idb"
  },
  {
    "id": "frontier-state-cache-file",
    "name": "@shapeshift-labs/frontier-state-cache-file",
    "role": "Structured file persistence adapter for Frontier state-cache snapshots and change logs.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-file",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-state-cache-file",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-file"
  },
  {
    "id": "frontier-state-cache-sql",
    "name": "@shapeshift-labs/frontier-state-cache-sql",
    "role": "SQL persistence adapter for Frontier state-cache snapshots and change logs.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-sql",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-state-cache-sql",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-sql"
  },
  {
    "id": "frontier-schema",
    "name": "@shapeshift-labs/frontier-schema",
    "role": "JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-schema",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-schema",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-schema"
  },
  {
    "id": "frontier-migrations",
    "name": "@shapeshift-labs/frontier-migrations",
    "role": "Boundary-first data migrations, import normalization, plugin/API version mapping, versioned envelopes, graph diagnostics, patch path rewrites, dry-run reports, and current-shape rehydration.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-migrations",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-migrations",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-migrations"
  },
  {
    "id": "frontier-event-log",
    "name": "@shapeshift-labs/frontier-event-log",
    "role": "Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-event-log",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-event-log",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-event-log"
  },
  {
    "id": "frontier-inspect",
    "name": "@shapeshift-labs/frontier-inspect",
    "role": "Cross-package inspection/evidence bundles, registry graph snapshots, feature/resource impact reports, timeline/event normalization, redaction, JSONL import/export, and AI-readable app feature maps.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-inspect",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-inspect",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-inspect"
  },
  {
    "id": "frontier-scheduler",
    "name": "@shapeshift-labs/frontier-scheduler",
    "role": "Deterministic work scheduling, lanes, cancellation, backpressure, frame policies, replay snapshots, and work graphs.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-scheduler",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-scheduler",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-scheduler"
  },
  {
    "id": "frontier-logging",
    "name": "@shapeshift-labs/frontier-logging",
    "role": "Opt-in structured logging, browser telemetry, scheduled sinks, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-logging",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-logging",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-logging"
  },
  {
    "id": "frontier-mutation",
    "name": "@shapeshift-labs/frontier-mutation",
    "role": "Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-mutation",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation"
  },
  {
    "id": "frontier-effects",
    "name": "@shapeshift-labs/frontier-effects",
    "role": "Serializable effect descriptors and resource graphs for Frontier apps, including fetch, storage, timers, navigation, workers, clipboard, broadcast, WebSocket, stream, policy metadata, runtime records, redaction, JSONL, proof helpers, and registry graph output.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-effects",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-effects",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-effects"
  },
  {
    "id": "frontier-policy",
    "name": "@shapeshift-labs/frontier-policy",
    "role": "Serializable policy and capability decisions for Frontier apps, effects, views, sync, routes, traces, and AI tools.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-policy",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-policy",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-policy"
  },
  {
    "id": "frontier-tools",
    "name": "@shapeshift-labs/frontier-tools",
    "role": "Serializable app action/tool manifests for AI-operable Frontier apps, including availability, validation, dry-run plans, patch previews, effect/tool constraints, execution records, rollback links, and registry graph output.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-tools",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-tools",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-tools"
  },
  {
    "id": "frontier-sandbox",
    "name": "@shapeshift-labs/frontier-sandbox",
    "role": "Runtime-agnostic sandbox contracts for Frontier patch-producing actions, including manifests, declared reads/writes/capabilities, host-validated patch/effect/event/log results, dynamic source modules, source event replay, and structural runtime adapters.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-sandbox",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-sandbox",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-sandbox"
  },
  {
    "id": "frontier-sandbox-quickjs",
    "name": "@shapeshift-labs/frontier-sandbox-quickjs",
    "role": "QuickJS/WebAssembly runtime adapter for Frontier sandbox actions, including invocation/runtime isolation modes, deadline and memory limits, dynamic source execution, and patch/effect result normalization.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-sandbox-quickjs",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-sandbox-quickjs",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-sandbox-quickjs"
  },
  {
    "id": "frontier-workflow",
    "name": "@shapeshift-labs/frontier-workflow",
    "role": "Serializable durable workflow/process manifests for Frontier apps, including steps, waits, approvals, timers, retries, expected patches, compensation, records, timelines, and registry graph output.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-workflow",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-workflow",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-workflow"
  },
  {
    "id": "frontier-worker",
    "name": "@shapeshift-labs/frontier-worker",
    "role": "Serializable worker and edge task descriptors for Frontier apps, including queues, idempotency keys, retry and timeout policy, declared reads/writes/effects, snapshots, patch outputs, produced assets, execution records, logs, trace links, proof hashes, dedupe indexes, and registry graph output.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-worker",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-worker",
    "repoUrl": "https://github.com/siliconjungle/siliconjungle--shapeshift-labs-frontier-worker"
  },
  {
    "id": "frontier-assets",
    "name": "@shapeshift-labs/frontier-assets",
    "role": "Serializable asset and content provenance graphs for Frontier apps, including source files, generated variants, thumbnails, LOD chunks, shader/material dependencies, transforms, hashes, owners, runtime consumers, review plans, registry graph output, and impact queries.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-assets",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-assets",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-assets"
  },
  {
    "id": "frontier-triggers",
    "name": "@shapeshift-labs/frontier-triggers",
    "role": "Capability-gated event trigger registry, scoped event envelopes, listener/reaction rules, structured rejection, deterministic event-to-action scheduling, replay/provenance records, and registry graph output.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-triggers",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-triggers",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-triggers"
  },
  {
    "id": "frontier-virtual",
    "name": "@shapeshift-labs/frontier-virtual",
    "role": "DOM-neutral virtualization, layout providers, range materialization, grids, spatial/frustum indexes, patch invalidation, camera anchors, and serializable layout state.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-virtual",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-virtual",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-virtual"
  },
  {
    "id": "frontier-scene",
    "name": "@shapeshift-labs/frontier-scene",
    "role": "Patch-native 2D/3D scene graph, transform propagation, bounds queries, virtual/culling adapters, spatial invalidation, and camera/frustum materialization.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-scene",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-scene",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-scene"
  },
  {
    "id": "frontier-pathfinding",
    "name": "@shapeshift-labs/frontier-pathfinding",
    "role": "Patch-native grid pathfinding, typed-array A*/Dijkstra search, flow fields, connected components, line-of-sight smoothing, dirty-cell invalidation, and scheduler-friendly path jobs.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-pathfinding",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-pathfinding",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-pathfinding"
  },
  {
    "id": "frontier-lod",
    "name": "@shapeshift-labs/frontier-lod",
    "role": "Patch-native level-of-detail and significance selection for rendering and computation workloads, compact typed hot paths, multi-observer selection, budget degradation, materialization frames, and scheduler work plans.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-lod",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-lod",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-lod"
  },
  {
    "id": "frontier-route",
    "name": "@shapeshift-labs/frontier-route",
    "role": "DOM-neutral app/game route resources, route and scene manifests, match/resolve/transition planning, dependency metadata, sessions, registry graph output, and impact queries.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-route",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-route",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-route"
  },
  {
    "id": "frontier-trace",
    "name": "@shapeshift-labs/frontier-trace",
    "role": "Serializable traces, spans, events, causal links, W3C trace context helpers, timeline/resource/path queries, critical-path analysis, registry graph output, JSONL/proof helpers, Chrome trace export, and redaction for app-wide feature observability.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-trace",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-trace",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-trace"
  },
  {
    "id": "frontier-manifest",
    "name": "@shapeshift-labs/frontier-manifest",
    "role": "Build/static feature manifests for owners, routes, actions, states, migrations, tests, source files, assets, resources, tasks, dependency metadata, registry graph output, feature maps, JSONL export, and impact queries.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-manifest",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-manifest",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-manifest"
  },
  {
    "id": "frontier-view",
    "name": "@shapeshift-labs/frontier-view",
    "role": "Renderer-neutral view manifests, type defaults, validation frames, action bindings, visual channels, virtual/LOD hints, and data-to-representation mapping for Frontier apps.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-view",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-view",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-view"
  },
  {
    "id": "frontier-dom",
    "name": "@shapeshift-labs/frontier-dom",
    "role": "Patch-native DOM and host renderer bindings, manifest hydration, JSX runtime/compiler helpers, SSR, devtools, and logging bridges.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-dom",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-dom",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-dom"
  },
  {
    "id": "frontier-playwright",
    "name": "@shapeshift-labs/frontier-playwright",
    "role": "Playwright/headless automation probes for Frontier state, DOM, devtools, marks, and timeline queries.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-playwright",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-playwright",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-playwright"
  },
  {
    "id": "frontier-test",
    "name": "@shapeshift-labs/frontier-test",
    "role": "Serializable test/spec evidence manifests for Frontier apps, including fixtures, commands, expected patches/effects/routes/policies, coverage declarations, run plans, run records, report adapters, replay proofs, fuzzers, benchmarks, registry graph output, and impact queries.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-test",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-test",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-test"
  },
  {
    "id": "frontier-history",
    "name": "@shapeshift-labs/frontier-history",
    "role": "Serializable temporal explanation and causality records for Frontier apps, including field-change explanations, action/workflow/policy/effect/trace/test provenance, audit windows, undo planning, registry/provenance graph output, JSONL replay bundles, and proof hashes.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-history",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-history",
    "repoUrl": "https://github.com/siliconjungle/siliconjungle--shapeshift-labs-frontier-history"
  },
  {
    "id": "frontier-application",
    "name": "@shapeshift-labs/frontier-application",
    "role": "Serializable whole-application graph and impact queries for Frontier apps, including features, owners, packages, routes, views, actions, mutations, state paths, effects, workers, assets, tests, traces, policies, workflows, migrations, benchmarks, registry graph output, feature maps, JSONL bundles, and proof hashes.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-application",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-application",
    "repoUrl": "https://github.com/siliconjungle/siliconjungle--shapeshift-labs-frontier-application"
  },
  {
    "id": "frontier-linter",
    "name": "@shapeshift-labs/frontier-linter",
    "role": "Serializable Frontier lint rules, diagnostics, fixes, reports, and fast rule execution for package catalogs, registry graphs, application maps, manifests, traces, policies, workflows, workers, assets, tests, benchmarks, and source snippets.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-linter",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-linter",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-linter"
  },
  {
    "id": "frontier-crdt",
    "name": "@shapeshift-labs/frontier-crdt",
    "role": "Native CRDT documents, update tooling, awareness, branches, conflict introspection, version frames, and undo.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-crdt",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt"
  },
  {
    "id": "frontier-crdt-sync",
    "name": "@shapeshift-labs/frontier-crdt-sync",
    "role": "CRDT sync endpoints, repo/storage/provider contracts, scheduled sync work, document URLs, local networks, model checking, forensics, and text binding contracts.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-crdt-sync",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync"
  },
  {
    "id": "frontier-crdt-websocket",
    "name": "@shapeshift-labs/frontier-crdt-websocket",
    "role": "WebSocket client/server transports for Frontier CRDT sync providers.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-websocket",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-crdt-websocket",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-websocket"
  },
  {
    "id": "frontier-react",
    "name": "@shapeshift-labs/frontier-react",
    "role": "React external-store hooks and adapters for Frontier state, cache, and CRDT surfaces.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-react",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-react",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-react"
  },
  {
    "id": "frontier-richtext",
    "name": "@shapeshift-labs/frontier-richtext",
    "role": "Rich text Delta normalization/application, marks, embeds, ranges, and cursor/selection transforms for local editor integrations.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-richtext",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-richtext",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-richtext"
  },
  {
    "id": "frontier-realtime",
    "name": "@shapeshift-labs/frontier-realtime",
    "role": "Shared realtime command, tick, snapshot, prediction, reconciliation, interpolation, rollback, message, and delta primitives.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-realtime",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime"
  },
  {
    "id": "frontier-realtime-server",
    "name": "@shapeshift-labs/frontier-realtime-server",
    "role": "Authoritative realtime room, tick, command validation, rate-limit, session, and snapshot-history runtime.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-server",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-realtime-server",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-server"
  },
  {
    "id": "frontier-realtime-websocket",
    "name": "@shapeshift-labs/frontier-realtime-websocket",
    "role": "WebSocket client, wire, and Node room-server transport for Frontier realtime.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-websocket",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-realtime-websocket",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-websocket"
  },
  {
    "id": "frontier-game",
    "name": "@shapeshift-labs/frontier-game",
    "role": "Game-facing entity, component, player, room, ownership, spatial interest, rollback, physics, and replication helpers above realtime.",
    "npmUrl": "https://www.npmjs.com/package/@shapeshift-labs/frontier-game",
    "repoName": "siliconjungle/-shapeshift-labs-frontier-game",
    "repoUrl": "https://github.com/siliconjungle/-shapeshift-labs-frontier-game"
  }
];
  const check = process.argv.slice(2).includes('--check');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const current = packages.find((entry) => entry.name === packageJson.name);
  if (!current) throw new Error('unknown Frontier package in package.json: ' + packageJson.name);
  const readmePath = path.join(packageRoot, 'README.md');
  const currentText = fs.readFileSync(readmePath, 'utf8');
  const nextText = replaceOrInsertHeadingSection(currentText, '## Related Packages', renderRelatedPackages(packages, current));
  if (currentText !== nextText) {
    if (check) {
      console.error('README package-family sections are stale.');
      console.error('Run npm run readme:packages to refresh README.md.');
      process.exit(1);
    }
    fs.writeFileSync(readmePath, nextText);
  }
}

function renderRelatedPackages(packages, currentPackage) {
  const related = packages.filter((entry) => entry.id !== currentPackage.id);
  const tick = String.fromCharCode(96);
  return [
    'The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:',
    '',
    ...related.map((entry) => '- [' + tick + entry.name + tick + '](' + entry.npmUrl + '): ' + entry.role),
    '',
    'Package source repositories:',
    '',
    ...packages.map((entry) => '- [' + tick + entry.repoName + tick + '](' + entry.repoUrl + ')')
  ].join('\n') + '\n';
}

function replaceOrInsertHeadingSection(text, heading, body) {
  const normalizedBody = body.replace(/\n*$/, '\n\n');
  const start = text.indexOf(heading + '\n');
  if (start !== -1) {
    const bodyStart = start + heading.length + 1;
    const next = findNextHeading(text, bodyStart);
    if (next === -1) return text.slice(0, bodyStart) + '\n' + normalizedBody;
    return text.slice(0, bodyStart) + '\n' + normalizedBody + text.slice(next);
  }
  const insertAt = findNextHeading(text, text.indexOf('\n') + 1);
  if (insertAt === -1) return text.replace(/\n*$/, '\n\n') + heading + '\n\n' + normalizedBody;
  return text.slice(0, insertAt) + '\n' + heading + '\n\n' + normalizedBody + text.slice(insertAt);
}

function findNextHeading(text, fromIndex) {
  const headingPattern = /^## .+$/gm;
  headingPattern.lastIndex = fromIndex;
  const match = headingPattern.exec(text);
  return match ? match.index : -1;
}
