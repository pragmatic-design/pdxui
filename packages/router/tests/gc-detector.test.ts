// This package's unit run carries the MutationObserver GC detector.
//
// Both halves are per-package and both are needed: `execArgv: ['--expose-gc']` and the setup file,
// `../core/tests/setup/gc-observer.ts`, which is where the detector and the reason for it live. Its
// behaviour — a forced collection after every observe(), which an observer must survive — is asserted
// in `core/tests/gc-detector.test.ts`; here we check this package actually runs it.
import { describe, it, expect } from 'vitest';

describe('the GC detector is installed in the router unit run', () => {
    it('has a gc() to call: --expose-gc reached the worker', () => {
        expect(typeof (globalThis as { gc?: unknown }).gc).toBe('function');
    });

    it('wraps MutationObserver.observe', () => {
        expect((MutationObserver.prototype.observe as unknown as { pdxGcDetector?: boolean }).pdxGcDetector).toBe(true);
    });
});
