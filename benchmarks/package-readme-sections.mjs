import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const check = args.check === true;

const packages = [
  pkg('frontier', '@shapeshift-labs/frontier', 'Core JSON diff/apply, compact patch tuples, JSON Pointer, equality, clone, validation, Unicode helpers.'),
  pkg('frontier-query', '@shapeshift-labs/frontier-query', 'Shared query-key, selector path, condition, entity identity, and table-shape primitives.'),
  pkg('frontier-codec', '@shapeshift-labs/frontier-codec', 'Patch serialization, binary frames, canonical JSON, and patch-history codecs.'),
  pkg('frontier-engine', '@shapeshift-labs/frontier-engine', 'Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.'),
  pkg('frontier-state', '@shapeshift-labs/frontier-state', 'Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.'),
  pkg('frontier-state-cache', '@shapeshift-labs/frontier-state-cache', 'Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, and mutation bridge.'),
  pkg('frontier-state-cache-idb', '@shapeshift-labs/frontier-state-cache-idb', 'IndexedDB persistence adapter for Frontier state-cache snapshots.'),
  pkg('frontier-state-cache-file', '@shapeshift-labs/frontier-state-cache-file', 'Structured file persistence adapter for Frontier state-cache snapshots and change logs.'),
  pkg('frontier-state-cache-sql', '@shapeshift-labs/frontier-state-cache-sql', 'SQL persistence adapter for Frontier state-cache snapshots and change logs.'),
  pkg('frontier-schema', '@shapeshift-labs/frontier-schema', 'JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.'),
  pkg('frontier-event-log', '@shapeshift-labs/frontier-event-log', 'Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.'),
  pkg('frontier-logging', '@shapeshift-labs/frontier-logging', 'Opt-in structured logging, browser telemetry, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.'),
  pkg('frontier-mutation', '@shapeshift-labs/frontier-mutation', 'Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.'),
  pkg('frontier-crdt', '@shapeshift-labs/frontier-crdt', 'Native CRDT documents, update tooling, awareness, branches, conflict introspection, version frames, and undo.'),
  pkg('frontier-crdt-sync', '@shapeshift-labs/frontier-crdt-sync', 'CRDT sync endpoints, repo/storage/provider contracts, document URLs, local networks, model checking, forensics, and text binding contracts.'),
  pkg('frontier-crdt-websocket', '@shapeshift-labs/frontier-crdt-websocket', 'WebSocket client/server transports for Frontier CRDT sync providers.'),
  pkg('frontier-react', '@shapeshift-labs/frontier-react', 'React external-store hooks and adapters for Frontier state, cache, and CRDT surfaces.'),
  pkg('frontier-richtext', '@shapeshift-labs/frontier-richtext', 'Rich text Delta normalization/application, marks, embeds, ranges, and cursor/selection transforms for local editor integrations.'),
  pkg('frontier-realtime', '@shapeshift-labs/frontier-realtime', 'Shared realtime command, tick, snapshot, prediction, reconciliation, interpolation, rollback, message, and delta primitives.'),
  pkg('frontier-realtime-server', '@shapeshift-labs/frontier-realtime-server', 'Authoritative realtime room, tick, command validation, rate-limit, session, and snapshot-history runtime.'),
  pkg('frontier-realtime-websocket', '@shapeshift-labs/frontier-realtime-websocket', 'WebSocket client, wire, and Node room-server transport for Frontier realtime.'),
  pkg('frontier-game', '@shapeshift-labs/frontier-game', 'Game-facing entity, component, player, room, ownership, spatial interest, rollback, physics, and replication helpers above realtime.')
];

const plannedPackages = [];

const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const current = packages.find((entry) => entry.name === packageJson.name);
if (!current) throw new Error('unknown Frontier package in package.json: ' + packageJson.name);

const readmePath = path.join(rootDir, 'README.md');
const currentText = fs.readFileSync(readmePath, 'utf8');
const nextText = updatePackageReadme(currentText, current);

if (currentText !== nextText) {
  if (check) {
    console.error('README package-family sections are stale.');
    console.error('Run npm run readme:packages to refresh README.md.');
    process.exit(1);
  }
  fs.writeFileSync(readmePath, nextText);
}

function pkg(id, name, role) {
  return {
    id,
    name,
    role,
    npmUrl: 'https://www.npmjs.com/package/' + name,
    repoName: 'siliconjungle/-shapeshift-labs-' + id,
    repoUrl: 'https://github.com/siliconjungle/-shapeshift-labs-' + id
  };
}

function updatePackageReadme(text, currentPackage) {
  const relatedHeading = '## Related Packages';
  const plannedHeading = '## Planned Realtime and Game Packages';
  const installHeading = '## Install';
  if (!text.includes(relatedHeading + '\n')) throw new Error('README.md is missing ' + relatedHeading);
  if (!text.includes('\n' + installHeading + '\n')) throw new Error('README.md is missing ' + installHeading);

  let next = text;
  const hasPlanned = next.includes('\n' + plannedHeading + '\n');
  const relatedNextHeading = hasPlanned ? plannedHeading : installHeading;
  next = replaceHeadingSection(next, relatedHeading, relatedNextHeading, renderRelatedPackages(currentPackage));

  if (plannedPackages.length === 0) {
    if (hasPlanned) next = removeHeadingSection(next, plannedHeading, installHeading);
  } else if (hasPlanned) {
    next = replaceHeadingSection(next, plannedHeading, installHeading, renderPlannedPackages());
  } else {
    const installStart = next.indexOf('\n' + installHeading + '\n');
    if (installStart === -1) throw new Error('README.md is missing ' + installHeading);
    next = next.slice(0, installStart + 1) + plannedHeading + '\n\n' + renderPlannedPackages() + '\n' + next.slice(installStart + 1);
  }

  return next;
}

function renderRelatedPackages(currentPackage) {
  const related = packages.filter((entry) => entry.id !== currentPackage.id);
  return [
    'The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:',
    '',
    ...related.map((entry) => '- [`' + entry.name + '`](' + entry.npmUrl + '): ' + entry.role),
    '',
    'Package source repositories:',
    '',
    ...packages.map((entry) => '- [`' + entry.repoName + '`](' + entry.repoUrl + ')')
  ].join('\n') + '\n';
}

function renderPlannedPackages() {
  return [
    'The following repositories are reserved placeholders for future realtime and game-facing Frontier packages. They are not production-ready packages and should not be treated as benchmarked or stable npm surfaces yet.',
    '',
    ...plannedPackages.map(([name, description]) => '- [`' + name + '`](' + repoUrlForPackageName(name) + '): ' + description + '.')
  ].join('\n') + '\n';
}

function repoUrlForPackageName(name) {
  const id = name.replace('@shapeshift-labs/', '');
  return 'https://github.com/siliconjungle/-shapeshift-labs-' + id;
}

function replaceHeadingSection(text, heading, nextHeading, body) {
  const start = text.indexOf(heading + '\n');
  if (start === -1) throw new Error('missing heading ' + heading);
  const bodyStart = start + heading.length + 1;
  const next = text.indexOf('\n' + nextHeading, bodyStart);
  if (next === -1) throw new Error('missing next heading ' + nextHeading + ' after ' + heading);
  const normalizedBody = body.replace(/\n*$/, '\n\n');
  return text.slice(0, bodyStart) + '\n' + normalizedBody + text.slice(next + 1);
}

function removeHeadingSection(text, heading, nextHeading) {
  const start = text.indexOf(heading + '\n');
  if (start === -1) return text;
  const bodyStart = start + heading.length + 1;
  const next = text.indexOf('\n' + nextHeading, bodyStart);
  if (next === -1) throw new Error('missing next heading ' + nextHeading + ' after ' + heading);
  return text.slice(0, start) + text.slice(next + 1);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === '--check') parsed.check = true;
    else throw new Error('unknown argument: ' + arg);
  }
  return parsed;
}
