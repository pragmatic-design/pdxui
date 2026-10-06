// Debug inspector — signal naming, effect tracing, component tree, DevTools protocol.
// 3 telemetry levels:
//   Level 0 (OFF)    — production default, zero overhead, no data collected
//   Level 1 (ERRORS) — production opt-in: errors, cycle detection, memory warnings
//   Level 2 (TRACE)  — development default: full trace, timing, reconciliation, dependency graph

import type { PdxElement } from '../component/element';
import { DEV } from '../utils/env';

// ─── Telemetry Level ──────────────────────────────────────────────

export type TelemetryLevel = 0 | 1 | 2;
let _level: TelemetryLevel = 0;

/**
 * Turned on BEFORE the app is built, or there is nothing to inspect.
 *
 * The registries only fill at level 2, and a signal registers itself when it is CREATED — so a
 * developer who opens the console and calls `setLevel(2)` is asking about an application that was
 * assembled while nobody was recording, and every answer is empty: `names()` returns `[]` on a page
 * full of named computeds.
 *
 * Two ways in, both read at module load and both DEV-only:
 *   · `?pdxdebug=2` in the address — one reload, nothing to remember;
 *   · `localStorage['pdx.telemetry'] = '2'` — it survives the reload, which is what a session of
 *     actually chasing something needs.
 *
 * Level 0 is the default and costs nothing: every registration returns at its first line.
 */
if (DEV && typeof window !== 'undefined') {
    try {
        const fromUrl = new URLSearchParams(window.location.search).get('pdxdebug');
        const fromStore = window.localStorage?.getItem('pdx.telemetry');
        const wanted = Number(fromUrl ?? fromStore ?? 0);
        if (wanted === 1 || wanted === 2) _level = wanted as TelemetryLevel;
    } catch {
        // A blocked localStorage or an exotic URL: the inspector stays off, which is the default.
        _level = 0;
    }
}

/** Set telemetry level. 0=off, 1=errors only (prod-safe), 2=full trace (dev). */
export function setTelemetryLevel(level: TelemetryLevel): void { _level = level; }
/**
 * The current telemetry level: 0 off, 1 errors only (safe in production), 2 full trace (development).
 *
 * Read it before building an expensive diagnostic payload — at level 0 the tracing calls are no-ops,
 * but the argument you computed to pass them is not.
 */
export function getTelemetryLevel(): TelemetryLevel { return _level; }

// ─── Types ─────────────────────────────────────────────────────────

export interface SignalInfo {
    name: string;
    value: unknown;
    subscriberCount: number;
}

export interface EffectInfo {
    name: string;
    deps: string[];
    active: boolean;
}

export interface StoreInfo {
    id: string;
    snapshot: Record<string, unknown>;
}

export interface TraceEntry {
    effect: string;
    trigger: string;
    oldValue: unknown;
    newValue: unknown;
    timestamp: number;
    duration?: number;      // effect execution time (ms)
    error?: string;         // error message if effect threw
}

export interface ReconcileMetrics {
    listId: string;
    oldCount: number;
    newCount: number;
    reused: number;
    added: number;
    removed: number;
    moved: number;
    lisLength: number;
    durationMs: number;
    timestamp: number;
}

export interface ComponentInfo {
    tag: string;
    el: HTMLElement;
    props: Record<string, unknown>;
    children: ComponentInfo[];
}

export interface PerfSummary {
    signals: number;
    effects: number;
    components: number;
    flushCycles: number;
    totalFlushTimeMs: number;
    avgFlushTimeMs: number;
    maxFlushTimeMs: number;
    reconcileCount: number;
    errorCount: number;
    cycleDetections: number;
}

// ─── Registries (WeakRef-based for GC) ────────────────────────────

interface SignalRecord {
    name: string;
    read: () => unknown;
    subscriberCount: () => number;
}

interface EffectRecord {
    name: string;
    deps: Set<string>;
    active: boolean;
}

const signalRegistry = new Map<number, WeakRef<SignalRecord>>();
const effectRegistry = new Map<number, WeakRef<EffectRecord>>();
const componentSet = new Set<WeakRef<PdxElement>>();
let nextSignalId = 0;
let nextEffectId = 0;

// ─── Trace + Metrics ──────────────────────────────────────────────

let tracing = false;
const traceLog: TraceEntry[] = [];
const reconcileLog: ReconcileMetrics[] = [];
let currentTriggerSignal = '';
let currentTriggerOldValue: unknown = undefined;
let currentTriggerNewValue: unknown = undefined;

// Performance counters
let flushCycles = 0;
let totalFlushTimeMs = 0;
let maxFlushTimeMs = 0;
let errorCount = 0;
let cycleDetections = 0;

// Max log sizes (prevent memory leak from unbounded logs)
const MAX_TRACE_LOG = 1000;
const MAX_RECONCILE_LOG = 200;

// ─── Registration API (called from signal.ts) ─────────────────────

/**
 * Which reactive node a subscriber-Set belongs to, and what a computed last read.
 *
 * A computed keeps its dependencies as the subscriber SETS of its sources (`signal.ts:299`), which
 * is the right shape for pruning and a useless one for a person: it is a list of Sets. These two
 * maps are what turns it into names — the Set to the signal that owns it, and the accessor a
 * caller has in hand to the internals behind it.
 *
 * WeakMaps, and only filled at level 2: a registry that keeps every signal alive is a leak with a
 * console command.
 */
const setOwner = new WeakMap<object, string>();
type NodeInternals = { name: string; deps?: () => object[]; subs?: () => object; dirty?: () => boolean };
const nodeInternals = new WeakMap<object, NodeInternals>();

/**
 * And the same internals BY NAME, weakly.
 *
 * On a page the accessor is a `const` inside a component's setup: `__pdx_debug.deps(liveKey)` is
 * something only the page itself could write. What a person has in the console is the name the
 * compiler emitted — `tickets:liveKey` — so both readings take a name as well: an instrument that
 * only works where you already have the variable does not work where the bug is.
 *
 * WeakRef, so naming a node does not keep it alive.
 */
const byName = new Map<string, WeakRef<object>>();

/** The internals behind an accessor or a name, or null. */
function internalsOf(target: unknown): NodeInternals | null {
    if (_level < 2) return null;
    if (typeof target === 'string') {
        const ref = byName.get(target);
        const accessor = ref?.deref();
        if (!accessor) { byName.delete(target); return null; }
        return nodeInternals.get(accessor) ?? null;
    }
    if (typeof target !== 'function' && typeof target !== 'object') return null;
    return nodeInternals.get(target as object) ?? null;
}

/** Every name the inspector can answer for, sorted — what to type when you do not know it. */
/**
 * Is this computed waiting to recompute? `null` for anything that is not one.
 *
 * The reading that splits a stale value in two: after a source
 * changed, TRUE means the computed was told and nobody has read it since — so the fault is
 * downstream, in whatever should have read it. FALSE means it was never told, and the fault is the
 * notification. From a screen the two look identical.
 *
 * It does not touch the value, so asking does not recompute anything: the measurement does not
 * disturb what it measures.
 */
export function isDirty(target: unknown): boolean | null {
    const node = internalsOf(target);
    return node?.dirty ? node.dirty() : null;
}

export function reactiveNames(): string[] {
    if (_level < 2) return [];
    const alive: string[] = [];
    for (const [name, ref] of byName) {
        if (ref.deref()) alive.push(name); else byName.delete(name);
    }
    return alive.sort();
}

/** Called from signal.ts when a signal is created: the accessor, its name, its subscriber Set. */
export function registerReactiveNode(
    accessor: object,
    name: string,
    subscriberSet: object,
    deps?: () => object[],
    dirty?: () => boolean,
): void {
    if (_level < 2) return;
    setOwner.set(subscriberSet, name);
    nodeInternals.set(accessor, { name, deps, subs: () => subscriberSet, dirty });
    if (name && name !== '(unnamed)') byName.set(name, new WeakRef(accessor));
}

/**
 * The names a computed read on its LAST run — empty for anything that is not one, and for one
 * nobody has read yet.
 *
 * Empty rather than a guess: it reports what was READ, and a computed that has never run has read
 * nothing. Reading its source to find out what it WOULD read is the answer that cannot tell the
 * two apart, which is the distinction the whole instrument exists for.
 */
export function depsOf(target: unknown): string[] {
    const node = internalsOf(target);
    if (!node?.deps) return [];
    // DEDUPED: the internal list records one entry per READ, so `gate() !== '' && x !== gate()`
    // lists `gate` twice. Harmless for the pruning it exists for, noise for a person reading it.
    return [...new Set(node.deps())].map((set) => setOwner.get(set) ?? '(unnamed)');
}

/**
 * The names subscribed to a signal or a computed: the computeds that read it, and the effects.
 *
 * The other half of the diagnosis. «The signal has no subscriber» is a reader that never read it;
 * «the subscriber is listed and still stale» is a notification that did not arrive. Without both
 * readings the two are indistinguishable.
 */
export function subscribersOf(target: unknown): string[] {
    const node = internalsOf(target);
    if (!node?.subs) return [];
    const set = node.subs() as Set<object>;
    return Array.from(set, (sub) => subscriberName.get(sub) ?? '(anonymous)');
}

/** A subscriber function to the node it belongs to — a computed's markDirty, an effect's runner. */
const subscriberName = new WeakMap<object, string>();

/** Called from signal.ts: this function, when it is notified, is that node. */
export function nameSubscriber(subscriber: object, name: string): void {
    if (_level < 2) return;
    subscriberName.set(subscriber, name);
}

export function registerSignal(name: string, read: () => unknown, subscriberCount: () => number): number {
    if (_level < 2) return -1;
    const id = nextSignalId++;
    signalRegistry.set(id, new WeakRef({ name, read, subscriberCount }));
    return id;
}

/**
 * Called from signal.ts when an effect is created at level 2: lists it in `effects()` and names its
 * runner, so the signals it reads can say who is subscribed. Null below level 2.
 */
export function registerEffect(name: string, runner: object): { id: number; record: EffectRecord } | null {
    if (_level < 2) return null;
    const id = nextEffectId++;
    const record: EffectRecord = { name, deps: new Set(), active: true };
    effectRegistry.set(id, new WeakRef(record));
    subscriberName.set(runner, name);
    return { id, record };
}

/** After an effect ran: the names of what it read, from the subscriber Sets it joined. */
export function noteEffectDeps(record: EffectRecord, subscriberSets: readonly object[]): void {
    record.deps = new Set(subscriberSets.map((set) => setOwner.get(set) ?? '(unnamed)'));
}

/** A disposed effect leaves the registry. */
export function unregisterEffect(id: number): void {
    const record = effectRegistry.get(id)?.deref();
    if (record) record.active = false;
    effectRegistry.delete(id);
}

/**
 * Global stores by id, at level 2. A plain Map, not WeakRefs: a store is a singleton that
 * global-store.ts keeps alive anyway.
 */
const storeRegistry = new Map<string, unknown>();

/** Called from global-store.ts when a store is created. */
export function registerStore(id: string, instance: unknown): void {
    if (_level < 2) return;
    storeRegistry.set(id, instance);
}

/** Called from global-store.ts when the stores are cleared. */
export function unregisterStores(): void {
    storeRegistry.clear();
}

export function registerComponent(el: PdxElement): void {
    if (_level < 2) return;
    componentSet.add(new WeakRef(el));
}

export function unregisterComponent(el: PdxElement): void {
    if (_level < 2) return;
    for (const ref of componentSet) {
        if (ref.deref() === el) { componentSet.delete(ref); break; }
    }
}

// ─── Trace hooks (called from signal.ts) ──────────────────────────

export function notifyTrace(signalName: string, oldValue: unknown, newValue: unknown): void {
    if (_level < 2 || !tracing) return;
    currentTriggerSignal = signalName;
    currentTriggerOldValue = oldValue;
    currentTriggerNewValue = newValue;
}

export function effectRunTrace(effectName: string): void {
    if (_level < 2 || !tracing || !currentTriggerSignal) return;
    if (traceLog.length >= MAX_TRACE_LOG) traceLog.shift();
    traceLog.push({
        effect: effectName,
        trigger: currentTriggerSignal,
        oldValue: currentTriggerOldValue,
        newValue: currentTriggerNewValue,
        timestamp: Date.now(),
    });
}

// ─── Flush metrics (called from signal.ts flush) ─────────────────

/** Called at start of flush cycle. Returns timestamp for duration calc. */
export function flushStart(): number {
    if (_level === 0) return 0;
    flushCycles++;
    return performance.now();
}

/** Called at end of flush cycle. Records duration. */
export function flushEnd(startTime: number): void {
    if (_level === 0 || startTime === 0) return;
    const duration = performance.now() - startTime;
    totalFlushTimeMs += duration;
    if (duration > maxFlushTimeMs) maxFlushTimeMs = duration;
}

/** Called when an effect throws an error. Level 1+ (prod-safe). */
export function trackError(effectName: string, error: unknown): void {
    if (_level === 0) return;
    errorCount++;
    // Level 1: just count. Level 2: also add to trace log.
    if (_level >= 2 && tracing) {
        if (traceLog.length >= MAX_TRACE_LOG) traceLog.shift();
        traceLog.push({
            effect: effectName,
            trigger: currentTriggerSignal || '(unknown)',
            oldValue: undefined,
            newValue: undefined,
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/** Called when cycle detection triggers. Level 1+ (prod-safe). */
export function trackCycleDetection(): void {
    if (_level === 0) return;
    cycleDetections++;
}

// ─── Reconciliation metrics (called from list.ts) ─────────────────

/** A cheap guard for the callers that BUILD the metrics object (list.ts):
 *  it avoids performance.now() + allocations when tracking is off. */
export function isReconcileTrackingEnabled(): boolean {
    return _level >= 2;
}

export function trackReconcile(metrics: Omit<ReconcileMetrics, 'timestamp'>): void {
    if (_level < 2) return;
    if (reconcileLog.length >= MAX_RECONCILE_LOG) reconcileLog.shift();
    reconcileLog.push({ ...metrics, timestamp: Date.now() });
    emitDevTools('list:reconcile', metrics);
}

// ─── DevTools Protocol Bridge ──────────────────────────────────────

export interface DevToolsHook {
    emit(event: string, payload: unknown): void;
}

/** Every connected listener: the overlay and an agent may both be listening. */
const devtoolsHooks = new Set<DevToolsHook>();

/** Listen to runtime events. Returns the disconnect. */
export function connectDevTools(hook: DevToolsHook): () => void {
    devtoolsHooks.add(hook);
    return () => { devtoolsHooks.delete(hook); };
}

/**
 * Tell every listener. Gated on there BEING one, not on the telemetry level: an agent that connected
 * is asking, whatever the level — and in production nothing can connect, since the global that
 * offers `connect` is development-only.
 */
export function emitDevTools(event: string, payload: unknown): void {
    if (devtoolsHooks.size === 0) return;
    for (const hook of devtoolsHooks) hook.emit(event, payload);
}

// ─── Data Collection ──────────────────────────────────────────────

function collectSignals(): SignalInfo[] {
    const result: SignalInfo[] = [];
    for (const [id, ref] of signalRegistry) {
        const rec = ref.deref();
        if (!rec) { signalRegistry.delete(id); continue; }
        result.push({ name: rec.name, value: rec.read(), subscriberCount: rec.subscriberCount() });
    }
    return result;
}

function collectEffects(): EffectInfo[] {
    const result: EffectInfo[] = [];
    for (const [id, ref] of effectRegistry) {
        const rec = ref.deref();
        if (!rec) { effectRegistry.delete(id); continue; }
        result.push({ name: rec.name, deps: Array.from(rec.deps), active: rec.active });
    }
    return result;
}

/**
 * Each store and its state as it is now: a signal-like member by its value (read without
 * subscribing), a plain value as it is. Methods are left out — they are the store's API, not its state.
 */
function collectStores(): StoreInfo[] {
    const result: StoreInfo[] = [];
    for (const [id, instance] of storeRegistry) {
        const snapshot: Record<string, unknown> = {};
        if (instance && typeof instance === 'object') {
            for (const [key, value] of Object.entries(instance as Record<string, unknown>)) {
                if (typeof value !== 'function') snapshot[key] = value;
                else if ('peek' in value) snapshot[key] = (value as { peek: () => unknown }).peek();
            }
        }
        result.push({ id, snapshot });
    }
    return result;
}

function buildComponentTree(root?: Element): ComponentInfo[] {
    const parent = root ?? (typeof document !== 'undefined' ? document.body : null);
    if (!parent) return [];

    const result: ComponentInfo[] = [];
    for (const child of Array.from(parent.children)) {
        if (child.tagName.includes('-')) {
            const info: ComponentInfo = {
                tag: child.tagName.toLowerCase(),
                el: child as HTMLElement,
                props: {},
                children: buildComponentTree(child),
            };
            for (const attr of Array.from(child.attributes)) {
                info.props[attr.name] = attr.value;
            }
            result.push(info);
        } else {
            result.push(...buildComponentTree(child));
        }
    }
    return result;
}

function getPerfSummary(): PerfSummary {
    return {
        signals: signalRegistry.size,
        effects: effectRegistry.size,
        components: componentSet.size,
        flushCycles,
        totalFlushTimeMs: Math.round(totalFlushTimeMs * 100) / 100,
        avgFlushTimeMs: flushCycles > 0 ? Math.round((totalFlushTimeMs / flushCycles) * 100) / 100 : 0,
        maxFlushTimeMs: Math.round(maxFlushTimeMs * 100) / 100,
        reconcileCount: reconcileLog.length,
        errorCount,
        cycleDetections,
    };
}

// ─── Public Debug API ──────────────────────────────────────────────

/**
 * The debug namespace: an export of `@pdxui/core`, and in development the same object as
 * `window.__PDX_DEVTOOLS__.debug`, which the devtools overlay and the console read.
 */
export const __pdx_debug = {
    /** Current telemetry level. */
    get level() { return _level; },

    /** Set telemetry level. 0=off, 1=errors, 2=full trace. */
    setLevel: setTelemetryLevel,

    /** List all active signals with names and values. */
    signals: collectSignals,

    /** List all active effects with dependency names. */
    effects: collectEffects,

    /** List the global stores with a snapshot of their state. */
    stores: collectStores,

    /** What a computed read on its last run, by name. Empty for anything else. */
    deps: depsOf,

    /** What is subscribed to a signal or a computed, by name. */
    subscribers: subscribersOf,

    /** Every name `deps` and `subscribers` can be asked about — what to type when you do not know it. */
    names: reactiveNames,

    /** Whether a computed is waiting to recompute — «it was told» against «it was not». */
    dirty: isDirty,

    /** Build component tree from DOM. */
    componentTree: buildComponentTree,

    /** Enable/disable effect tracing (requires level 2). */
    trace(enabled: boolean): void {
        tracing = enabled;
        if (!enabled) currentTriggerSignal = '';
    },

    /** Get trace log (effects and their triggers). */
    traceLog(): TraceEntry[] { return [...traceLog]; },

    /** Get reconciliation metrics log. */
    reconcileLog(): ReconcileMetrics[] { return [...reconcileLog]; },

    /** Get performance summary (works at level 1+). */
    perf: getPerfSummary,

    /** Clear trace log. Alias for clear(). */
    clearTrace(): void { this.clear(); },

    /** Clear all logs and counters. */
    clear(): void {
        traceLog.length = 0;
        reconcileLog.length = 0;
        flushCycles = 0;
        totalFlushTimeMs = 0;
        maxFlushTimeMs = 0;
        errorCount = 0;
        cycleDetections = 0;
    },

    /** Check if tracing is active. */
    get tracing() { return tracing; },
};

// `window.__PDX_DEVTOOLS__` — this namespace as `.debug`, and the agent API around it — is
// installed by debug/devtools-api.ts, in development only.
