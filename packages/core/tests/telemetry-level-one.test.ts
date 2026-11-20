// Level-1 telemetry is the one an app may turn on in production (#1246).
//
// The flush reports to it through debug/telemetry-hooks.ts: null until `setTelemetryLevel` sets a
// level above 0, so a production bundle that never asks carries none of the inspector, and one that
// asks gets its counters: flushes, effects that threw, cycles the runtime broke — read with
// `__pdx_debug.perf()`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal, effect, setTelemetryLevel, __pdx_debug, pushErrorHandler, popErrorHandler } from '../src/index';
import { telemetryHooks } from '../src/debug/telemetry-hooks';

afterEach(() => {
    setTelemetryLevel(0);
    __pdx_debug.clear();
});

describe('level-1 telemetry', () => {
    it('installs the flush hooks above level 0, and removes them at 0', () => {
        setTelemetryLevel(0);
        expect(telemetryHooks).toBeNull();
        setTelemetryLevel(1);
        expect(telemetryHooks).not.toBeNull();
        setTelemetryLevel(0);
        expect(telemetryHooks).toBeNull();
    });

    it('counts the flushes and an effect that threw', () => {
        setTelemetryLevel(1);
        __pdx_debug.clear();
        const s = signal(0);
        pushErrorHandler(() => {});
        try {
            effect(() => { if (s() > 0) throw new Error('the effect failed'); });
            s.set(1);
        } finally {
            popErrorHandler();
        }
        const perf = __pdx_debug.perf();
        expect(perf.flushCycles, 'no flush was counted').toBeGreaterThan(0);
        expect(perf.errorCount).toBe(1);
    });

    it('counts a cycle the runtime broke', () => {
        setTelemetryLevel(1);
        __pdx_debug.clear();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = signal(0);
        effect(() => { s.set(s() + 1); });
        s.set(-1);
        expect(__pdx_debug.perf().cycleDetections).toBeGreaterThan(0);
        error.mockRestore();
    });

    it('at level 0 counts nothing', () => {
        setTelemetryLevel(0);
        __pdx_debug.clear();
        const s = signal(0);
        effect(() => { s(); });
        s.set(1);
        expect(__pdx_debug.perf().flushCycles).toBe(0);
    });
});
