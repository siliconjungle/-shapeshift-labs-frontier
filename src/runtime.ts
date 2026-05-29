export const FRONTIER_RUNTIME_WORK_AREAS = ['diff', 'apply', 'codec', 'sync', 'cache', 'logging'] as const;

export type FrontierRuntimeWorkArea = (typeof FRONTIER_RUNTIME_WORK_AREAS)[number] | 'other' | (string & {});
export type FrontierRuntimeTaskPriority = 'high' | 'normal' | 'low' | number;

export type FrontierRuntimeClock = () => number;

export interface FrontierRuntimeBudgetOptions {
  clock?: FrontierRuntimeClock;
  startMs?: number;
  maxMs?: number | null;
  maxUnits?: number | null;
}

export interface FrontierRuntimeBudgetSnapshot {
  startMs: number;
  nowMs: number;
  deadlineMs: number;
  elapsedMs: number;
  remainingMs: number;
  maxUnits: number;
  usedUnits: number;
  remainingUnits: number;
  exhausted: boolean;
}

export interface FrontierRuntimeBudget {
  readonly startMs: number;
  readonly deadlineMs: number;
  readonly maxUnits: number;
  readonly usedUnits: number;
  now(): number;
  elapsedMs(): number;
  remainingMs(): number;
  remainingUnits(): number;
  canRun(units?: number): boolean;
  shouldYield(units?: number): boolean;
  consume(units?: number): boolean;
  snapshot(): FrontierRuntimeBudgetSnapshot;
}

export interface FrontierRuntimeScheduledTask {
  id: string;
  area: FrontierRuntimeWorkArea;
  priority: number;
  units: number;
  queuedAt: number;
}

export interface FrontierRuntimeTask<TValue = unknown> {
  id?: string;
  area?: FrontierRuntimeWorkArea;
  priority?: FrontierRuntimeTaskPriority;
  units?: number;
  run: (budget: FrontierRuntimeBudget, task: FrontierRuntimeScheduledTask) => TValue | void;
}

export interface FrontierRuntimeSchedulerOptions extends FrontierRuntimeBudgetOptions {
  maxTasks?: number | null;
  areaUnitBudgets?: Readonly<Record<string, number | null | undefined>>;
  onTaskError?: (error: unknown, task: FrontierRuntimeScheduledTask) => void;
}

export interface FrontierRuntimeSchedulerRunOptions extends FrontierRuntimeBudgetOptions {
  maxTasks?: number | null;
  areaUnitBudgets?: Readonly<Record<string, number | null | undefined>>;
}

export interface FrontierRuntimeSchedulerSnapshot {
  pending: number;
  pendingByArea: Record<string, number>;
}

export interface FrontierRuntimeSchedulerRunResult extends FrontierRuntimeBudgetSnapshot {
  completed: number;
  failed: number;
  pending: number;
  completedByArea: Record<string, number>;
  failedByArea: Record<string, number>;
  pendingByArea: Record<string, number>;
  budgetExhausted: boolean;
  taskLimitReached: boolean;
}

export interface FrontierRuntimeScheduler {
  schedule<TValue = unknown>(task: FrontierRuntimeTask<TValue>): FrontierRuntimeScheduledTask;
  run(options?: FrontierRuntimeSchedulerRunOptions): FrontierRuntimeSchedulerRunResult;
  clear(area?: FrontierRuntimeWorkArea): number;
  getPendingCount(area?: FrontierRuntimeWorkArea): number;
  snapshot(): FrontierRuntimeSchedulerSnapshot;
}

interface InternalRuntimeTask extends FrontierRuntimeScheduledTask {
  run: FrontierRuntimeTask['run'];
  view: FrontierRuntimeScheduledTask;
}

const DEFAULT_CLOCK: FrontierRuntimeClock = () => {
  const perf = globalThis.performance;
  return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
};

export function createRuntimeBudget(options: FrontierRuntimeBudgetOptions = {}): FrontierRuntimeBudget {
  return new RuntimeBudget(options);
}

export function createRuntimeScheduler(options: FrontierRuntimeSchedulerOptions = {}): FrontierRuntimeScheduler {
  return new RuntimeScheduler(options);
}

class RuntimeBudget implements FrontierRuntimeBudget {
  private readonly clock: FrontierRuntimeClock;
  private used = 0;

  readonly startMs: number;
  readonly deadlineMs: number;
  readonly maxUnits: number;

  constructor(options: FrontierRuntimeBudgetOptions) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.startMs = readStartMs(options.startMs, this.clock);
    const maxMs = readTimeLimit(options.maxMs, Infinity, 'maxMs');
    this.deadlineMs = maxMs === Infinity ? Infinity : this.startMs + maxMs;
    this.maxUnits = readLimit(options.maxUnits, Infinity, 'maxUnits');
  }

  get usedUnits(): number {
    return this.used;
  }

  now(): number {
    return this.clock();
  }

  elapsedMs(): number {
    return Math.max(0, this.now() - this.startMs);
  }

  remainingMs(): number {
    if (this.deadlineMs === Infinity) return Infinity;
    return Math.max(0, this.deadlineMs - this.now());
  }

  remainingUnits(): number {
    if (this.maxUnits === Infinity) return Infinity;
    return Math.max(0, this.maxUnits - this.used);
  }

  canRun(units = 1): boolean {
    const normalized = readUnits(units, 'units');
    return this.hasTime() && this.used + normalized <= this.maxUnits;
  }

  shouldYield(units = 1): boolean {
    return !this.canRun(units);
  }

  consume(units = 1): boolean {
    const normalized = readUnits(units, 'units');
    if (!this.canRun(normalized)) return false;
    this.used += normalized;
    return true;
  }

  snapshot(): FrontierRuntimeBudgetSnapshot {
    const nowMs = this.now();
    const remainingMs = this.deadlineMs === Infinity ? Infinity : Math.max(0, this.deadlineMs - nowMs);
    const remainingUnits = this.maxUnits === Infinity ? Infinity : Math.max(0, this.maxUnits - this.used);
    return {
      startMs: this.startMs,
      nowMs,
      deadlineMs: this.deadlineMs,
      elapsedMs: Math.max(0, nowMs - this.startMs),
      remainingMs,
      maxUnits: this.maxUnits,
      usedUnits: this.used,
      remainingUnits,
      exhausted: remainingMs <= 0 || remainingUnits <= 0
    };
  }

  private hasTime(): boolean {
    return this.deadlineMs === Infinity || this.now() < this.deadlineMs;
  }
}

class RuntimeScheduler implements FrontierRuntimeScheduler {
  private readonly options: FrontierRuntimeSchedulerOptions;
  private readonly queues = new Map<string, InternalRuntimeTask[]>();
  private readonly areaOrder: string[] = [...FRONTIER_RUNTIME_WORK_AREAS, 'other'];
  private cursor = 0;
  private sequence = 0;
  private pending = 0;

  constructor(options: FrontierRuntimeSchedulerOptions) {
    this.options = options;
    for (const area of this.areaOrder) this.queues.set(area, []);
  }

  schedule<TValue = unknown>(task: FrontierRuntimeTask<TValue>): FrontierRuntimeScheduledTask {
    if (!task || typeof task.run !== 'function') throw new TypeError('runtime task requires a run function');
    const area = task.area ?? 'other';
    const queue = this.queueFor(area);
    const queued = {
      id: task.id ?? area + '-' + (++this.sequence),
      area,
      priority: readPriority(task.priority),
      units: readUnits(task.units ?? 1, 'task.units'),
      queuedAt: (this.options.clock ?? DEFAULT_CLOCK)(),
      run: task.run as FrontierRuntimeTask['run']
    } as InternalRuntimeTask;
    queued.view = publicTask(queued);
    let index = queue.length;
    while (index > 0 && queue[index - 1]!.priority < queued.priority) index--;
    queue.splice(index, 0, queued);
    this.pending++;
    return queued.view;
  }

  run(options: FrontierRuntimeSchedulerRunOptions = {}): FrontierRuntimeSchedulerRunResult {
    const budget = createRuntimeBudget({
      clock: options.clock ?? this.options.clock,
      startMs: options.startMs,
      maxMs: options.maxMs ?? this.options.maxMs,
      maxUnits: options.maxUnits ?? this.options.maxUnits
    });
    const maxTasks = readLimit(options.maxTasks ?? this.options.maxTasks, Infinity, 'maxTasks');
    const areaBudgets = mergeAreaBudgets(this.options.areaUnitBudgets, options.areaUnitBudgets);
    const areaUsed: Record<string, number> = {};
    const completedByArea: Record<string, number> = {};
    const failedByArea: Record<string, number> = {};
    let completed = 0;
    let failed = 0;

    while (this.pending > 0 && completed < maxTasks) {
      const task = this.takeNextTask(budget, areaBudgets, areaUsed);
      if (!task) break;
      if (!budget.consume(task.units)) {
        this.unshiftTask(task);
        break;
      }
      areaUsed[task.area] = (areaUsed[task.area] ?? 0) + task.units;
      try {
        task.run(budget, task.view);
      } catch (error) {
        failed++;
        failedByArea[task.area] = (failedByArea[task.area] ?? 0) + 1;
        if (typeof this.options.onTaskError === 'function') {
          this.options.onTaskError(error, task.view);
        }
      }
      completed++;
      completedByArea[task.area] = (completedByArea[task.area] ?? 0) + 1;
    }

    const snapshot = budget.snapshot();
    const taskLimitReached = completed >= maxTasks && this.pending > 0;
    return {
      ...snapshot,
      completed,
      failed,
      pending: this.pending,
      completedByArea,
      failedByArea,
      pendingByArea: this.pendingByArea(),
      budgetExhausted: snapshot.exhausted && this.pending > 0,
      taskLimitReached
    };
  }

  clear(area?: FrontierRuntimeWorkArea): number {
    if (area !== undefined) {
      const queue = this.queueFor(area);
      const count = queue.length;
      queue.length = 0;
      this.pending -= count;
      return count;
    }
    let count = 0;
    for (const queue of this.queues.values()) {
      count += queue.length;
      queue.length = 0;
    }
    this.pending = 0;
    return count;
  }

  getPendingCount(area?: FrontierRuntimeWorkArea): number {
    if (area !== undefined) return this.queueFor(area).length;
    return this.pending;
  }

  snapshot(): FrontierRuntimeSchedulerSnapshot {
    return {
      pending: this.getPendingCount(),
      pendingByArea: this.pendingByArea()
    };
  }

  private takeNextTask(
    budget: FrontierRuntimeBudget,
    areaBudgets: Record<string, number>,
    areaUsed: Record<string, number>
  ): InternalRuntimeTask | null {
    let bestAreaIndex = -1;
    let bestTask: InternalRuntimeTask | null = null;
    let bestRank = -Infinity;
    const areaCount = this.areaOrder.length;
    for (let offset = 0; offset < areaCount; offset++) {
      const areaIndex = (this.cursor + offset) % areaCount;
      const area = this.areaOrder[areaIndex]!;
      const task = this.queues.get(area)?.[0];
      if (!task || !this.canTakeTask(task, budget, areaBudgets, areaUsed)) continue;
      const rank = task.priority * areaCount - offset;
      if (rank > bestRank) {
        bestRank = rank;
        bestTask = task;
        bestAreaIndex = areaIndex;
      }
    }
    if (!bestTask || bestAreaIndex < 0) return null;
    this.queues.get(bestTask.area)!.shift();
    this.pending--;
    this.cursor = (bestAreaIndex + 1) % areaCount;
    return bestTask;
  }

  private canTakeTask(
    task: InternalRuntimeTask,
    budget: FrontierRuntimeBudget,
    areaBudgets: Record<string, number>,
    areaUsed: Record<string, number>
  ): boolean {
    if (!budget.canRun(task.units)) return false;
    const areaBudget = areaBudgets[task.area];
    return areaBudget === undefined || (areaUsed[task.area] ?? 0) + task.units <= areaBudget;
  }

  private unshiftTask(task: InternalRuntimeTask): void {
    this.queueFor(task.area).unshift(task);
    this.pending++;
  }

  private queueFor(area: FrontierRuntimeWorkArea): InternalRuntimeTask[] {
    const key = String(area);
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
      this.areaOrder.push(key);
    }
    return queue;
  }

  private pendingByArea(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const area of this.areaOrder) {
      const count = this.queues.get(area)?.length ?? 0;
      if (count > 0) out[area] = count;
    }
    return out;
  }
}

function publicTask(task: InternalRuntimeTask): FrontierRuntimeScheduledTask {
  return {
    id: task.id,
    area: task.area,
    priority: task.priority,
    units: task.units,
    queuedAt: task.queuedAt
  };
}

function readStartMs(value: number | undefined, clock: FrontierRuntimeClock): number {
  if (value === undefined) return clock();
  if (!Number.isFinite(value)) throw new RangeError('startMs must be finite');
  return value;
}

function readLimit(value: number | null | undefined, fallback: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  if (value === Infinity) return Infinity;
  if (!Number.isFinite(value) || value < 0) throw new RangeError(name + ' must be a non-negative number');
  return Math.floor(value);
}

function readTimeLimit(value: number | null | undefined, fallback: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  if (value === Infinity) return Infinity;
  if (!Number.isFinite(value) || value < 0) throw new RangeError(name + ' must be a non-negative number');
  return value;
}

function readUnits(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(name + ' must be a non-negative number');
  return Math.floor(value);
}

function readPriority(value: FrontierRuntimeTaskPriority | undefined): number {
  if (value === undefined || value === 'normal') return 0;
  if (value === 'high') return 1;
  if (value === 'low') return -1;
  if (!Number.isFinite(value)) throw new RangeError('task.priority must be finite');
  return value;
}

function mergeAreaBudgets(
  base: Readonly<Record<string, number | null | undefined>> | undefined,
  override: Readonly<Record<string, number | null | undefined>> | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (base) assignAreaBudgets(out, base);
  if (override) assignAreaBudgets(out, override);
  return out;
}

function assignAreaBudgets(
  out: Record<string, number>,
  values: Readonly<Record<string, number | null | undefined>>
): void {
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (value === undefined || value === null) delete out[key];
    else out[key] = readLimit(value, Infinity, 'areaUnitBudgets.' + key);
  }
}
