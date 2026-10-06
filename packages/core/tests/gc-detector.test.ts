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

    it('an observer whose records arrive after its first task is silenced — what it detects', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        let delivered = 0;
        const observer = new MutationObserver(() => { delivered++; });
        observer.observe(host, { childList: true });

        // The detector's forced collection is one macrotask after observe(); after these, happy-dom's
        // WeakRef to the delivery callback is gone.
        await turn();
        await turn();
        host.appendChild(document.createElement('span'));
        await turn();
        await turn();

        expect(delivered, 'the observer still delivered: the detector is not doing its job').toBe(0);
        observer.disconnect();
        host.remove();
    });
});
