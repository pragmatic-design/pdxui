// The inspector's level-1 counters, as the reactive core reaches them (#1246).
//
// Level 1 is the telemetry an app may turn on in production (`setTelemetryLevel(1)`): flush times,
// effects that threw, reactive cycles broken, read with `__pdx_debug.perf()`. The flush reports to
// these hooks, which are null until the inspector installs them, when a level above 0 is set.
//
// So the flush names nothing of the inspector: an app that never sets a level bundles none of it, and
// one that does gets the counters it asked for. Level 2 — the registries, the trace — is development
// only, and its calls are behind `DEV`.

/** What the flush reports at level 1. */
export interface TelemetryHooks {
    /** A flush begins: the timestamp its end is measured from. */
    flushStart(): number;
    /** A flush ends, begun at `startTime`. */
    flushEnd(startTime: number): void;
    /** An effect threw. */
    trackError(effectName: string, error: unknown): void;
    /** The runtime broke a reactive cycle. */
    trackCycleDetection(): void;
}

/** The installed hooks, or null: what the flush calls. */
export let telemetryHooks: TelemetryHooks | null = null;

/** Install the hooks, or remove them with null. Called by the inspector's `setTelemetryLevel`. */
export function setTelemetryHooks(hooks: TelemetryHooks | null): void {
    telemetryHooks = hooks;
}
