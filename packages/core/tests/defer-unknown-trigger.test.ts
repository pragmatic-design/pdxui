// A hand-written `defer()` with a trigger the runtime does not know warns in development (#260).
//
// The runtime keeps its fallback — an unknown trigger fires at once, rather than never — because a
// hand-written call has no compiler in front of it. A `.pdx` never reaches it: the compiler stops it
// as PDX_DEFER_UNKNOWN_TRIGGER. Here it warns once per trigger, so the fallback is not silent.
//
// And it holds the compiler's list to the runtime: every trigger the compiler accepts is one the
// runtime reads without the fallback (the compiler cannot import from core).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { html } from '../src/renderer/template';
import { defer } from '../src/renderer/defer';
import { DEFER_TRIGGERS } from '../../compiler/src/compiler/defer-triggers';

const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** Insert a deferred block with `trigger` and let its triggers arm. */
async function mount(trigger: string): Promise<void> {
    const box = document.createElement('div');
    document.body.appendChild(box);
    box.appendChild(defer({ trigger, placeholder: () => html`<span></span>` },
        () => Promise.resolve(), () => html`<i></i>`));
    await frame();
    await frame();
}

const deferWarnings = (spy: { mock: { calls: unknown[][] } }): string[] =>
    spy.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.includes('[pdx] defer'));

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('defer() with an unknown trigger', () => {
    it('warns, naming the trigger and the ones that exist', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount('viewprt');
        const found = deferWarnings(warn);
        expect(found).toHaveLength(1);
        expect(found[0]).toContain("'viewprt'");
        expect(found[0]).toContain('viewport');
    });

    it('once per trigger, not once per block', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount('soonish');
        await mount('soonish');
        expect(deferWarnings(warn).filter((m) => m.includes("'soonish'"))).toHaveLength(1);
    });

    it('control: no trigger the compiler accepts reaches the fallback', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (const t of DEFER_TRIGGERS) await mount(t.replace('<n>', '100'));
        expect(deferWarnings(warn), 'the compiler accepts a trigger the runtime does not read').toEqual([]);
    });
});
