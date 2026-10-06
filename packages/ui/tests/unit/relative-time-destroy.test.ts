// pdx-relative-time stops its timer when it is destroyed.
//
// Its cleanup is core's `onDestroy`, imported: the component context has no `onDestroy`, so an
// optional call through it does nothing, and the interval that refreshes "2 minutes ago" keeps
// running after the element is removed: once per element ever mounted, each one updating a <time>
// no longer in the document.
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../src/relative-time/pdx-relative-time';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('pdx-relative-time', () => {
    it('clears the interval it started when the element is removed', async () => {
        const started: unknown[] = [];
        const realSet = globalThis.setInterval;
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
            const id = realSet(fn, ms);
            if (ms === 1000) started.push(id);
            return id;
        }) as typeof setInterval);
        const cleared = vi.spyOn(globalThis, 'clearInterval');

        const el = document.createElement('pdx-relative-time');
        el.setAttribute('datetime', new Date().toISOString());
        el.setAttribute('update-interval', '1000');
        document.body.appendChild(el);
        await frame();
        await frame();
        expect(started, 'the case measures nothing: no interval was started').toHaveLength(1);

        el.remove();
        expect(cleared).toHaveBeenCalledWith(started[0]);
    });

    it('the control: while it stays in the document, the interval is not cleared', async () => {
        const cleared = vi.spyOn(globalThis, 'clearInterval');
        const el = document.createElement('pdx-relative-time');
        el.setAttribute('datetime', new Date().toISOString());
        el.setAttribute('update-interval', '1000');
        document.body.appendChild(el);
        await frame();
        await frame();
        expect(el.querySelector('time'), 'it built').not.toBeNull();
        expect(cleared).not.toHaveBeenCalled();
    });
});
