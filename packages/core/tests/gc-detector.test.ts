// The MutationObserver GC detector is installed in this package's unit run.
//
// Two halves, and both are needed: `--expose-gc` from the vite config, and the wrapper from the
// setup file. Either one missing and the suite would run without the detector while looking exactly
// the same.
import { describe, it, expect } from 'vitest';
import { setImmediate } from 'node:timers';

/** One macrotask, without betting on a duration: the detector's own collection is scheduled the same
 *  way, so after two of these it has run. */
const turn = () => new Promise((r) => setImmediate(r));

describe('the GC detector', () => {
    it('has a gc() to call: --expose-gc reached the worker', () => {
        expect(typeof (globalThis as { gc?: unknown }).gc).toBe('function');
    });

    it('wraps MutationObserver.observe', () => {
        expect((MutationObserver.prototype.observe as unknown as { pdxGcDetector?: boolean }).pdxGcDetector).toBe(true);
    });

    it('an observer whose records arrive after a forced collection still delivers them', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        let delivered = 0;
        const observer = new MutationObserver(() => { delivered++; });
        observer.observe(host, { childList: true });

        // The detector's forced collection is one macrotask after observe(). Up to 20.10.2 happy-dom
        // held the delivery callback only through a WeakRef, and this observer went silent here; it
        // must not go silent again.
        await turn();
        await turn();
        host.appendChild(document.createElement('span'));
        await turn();
        await turn();

        expect(delivered, 'the collection silenced the observer: happy-dom drops MutationObserver records again').toBe(1);
        observer.disconnect();
        host.remove();
    });
});
