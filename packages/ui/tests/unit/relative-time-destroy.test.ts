// pdx-relative-time stops waiting for its next update when it is destroyed.
//
// The update that refreshes "2 minutes ago" is an effect that waits one interval, then ticks (#291, so
// that a frozen page parks it, #269). Its wait is the effect's cleanup: once the element is removed
// nothing must stay armed, or every element ever mounted would keep updating a <time> no longer in the
// document. The freeze itself is measured in Chromium (display-d-beta-contract.spec.ts).
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../src/relative-time/pdx-relative-time';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

/** Records the waits of `ms` the component arms. */
function spyWaits(ms: number): unknown[] {
    const started: unknown[] = [];
    const realSet = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, delay?: number) => {
        const id = realSet(fn, delay);
        if (delay === ms) started.push(id);
        return id;
    }) as typeof setTimeout);
    return started;
}

describe('pdx-relative-time', () => {
    it('clears the wait it armed when the element is removed', async () => {
        const started = spyWaits(1000);
        const cleared = vi.spyOn(globalThis, 'clearTimeout');

        const el = document.createElement('pdx-relative-time');
        el.setAttribute('datetime', new Date().toISOString());
        el.setAttribute('update-interval', '1000');
        document.body.appendChild(el);
        await frame();
        await frame();
        expect(started.length, 'the case measures nothing: no wait was armed').toBeGreaterThan(0);

        el.remove();
        expect(cleared).toHaveBeenCalledWith(started[started.length - 1]);
    });

    it('the control: while it stays in the document, its wait is not cleared', async () => {
        const started = spyWaits(1000);
        const cleared = vi.spyOn(globalThis, 'clearTimeout');
        const el = document.createElement('pdx-relative-time');
        el.setAttribute('datetime', new Date().toISOString());
        el.setAttribute('update-interval', '1000');
        document.body.appendChild(el);
        await frame();
        await frame();
        expect(el.querySelector('time'), 'it built').not.toBeNull();
        expect(cleared).not.toHaveBeenCalledWith(started[started.length - 1]);
    });
});
