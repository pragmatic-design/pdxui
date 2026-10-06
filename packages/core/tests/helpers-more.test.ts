// awaitTimed and portal's retry — two corners of renderer/helpers.ts.
//
// awaitTimed exists to stop a spinner flashing for a 40ms load, and to stop a request that never
// answers from hanging on "loading" forever. Both behaviours are timing, which is easy to leave untested.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal, collectDisposers } from '../src/reactivity/signal';
import { awaitTimed, portal } from '../src/renderer/helpers';

const node = (text: string) => {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
};

const mount = (frag: DocumentFragment): HTMLElement => {
    const host = document.createElement('div');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
};

const after = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => { document.body.innerHTML = ''; });

describe('awaitTimed — the minimum delay', () => {
    it('shows nothing at all while the load may still be quick', async () => {
        const ready = signal(false);
        const host = mount(awaitTimed(() => ready(), () => node('done'), () => node('loading'), { minMs: 40 }));

        expect(host.textContent, 'the spinner flashed for a load that had barely started').toBe('');

        await after(60);
        expect(host.textContent, 'the spinner never appeared for a slow load').toBe('loading');

        ready.set(true);
        expect(host.textContent).toBe('done');
    });

    it('a load that finishes inside the window never shows a spinner', async () => {
        const ready = signal(false);
        const host = mount(awaitTimed(() => ready(), () => node('done'), () => node('loading'), { minMs: 40 }));

        ready.set(true);
        await after(60);

        expect(host.textContent).toBe('done');
    });

    it('with no minimum the loading branch is there from the start', () => {
        const host = mount(awaitTimed(() => false, () => node('done'), () => node('loading'), {}));
        expect(host.textContent).toBe('loading');
    });

    it('renders the resolved branch straight away when the condition is already true', () => {
        const host = mount(awaitTimed(() => true, () => node('done'), () => node('loading'), { minMs: 40 }));
        expect(host.textContent).toBe('done');
    });

    it('with no loading function it renders nothing rather than failing', async () => {
        const host = mount(awaitTimed(() => false, () => node('done'), null, {}));
        expect(host.textContent).toBe('');
    });
});

describe('awaitTimed — the timeout', () => {
    it('gives up waiting and shows the resolved branch once maxMs passes', async () => {
        const host = mount(awaitTimed(() => false, () => node('timed out'), () => node('loading'), { maxMs: 30 }));
        expect(host.textContent).toBe('loading');

        await after(50);

        expect(host.textContent, 'a request that never answered stayed on the spinner forever')
            .toBe('timed out');
    });

    it('a load that answers first wins the race', async () => {
        const ready = signal(false);
        const host = mount(awaitTimed(() => ready(), () => node('done'), () => node('loading'), { maxMs: 30 }));

        ready.set(true);
        await after(50);

        expect(host.textContent).toBe('done');
    });
});

describe('awaitTimed — teardown', () => {
    it('cancels its timers, so nothing writes to a signal after the unmount', async () => {
        // A timer surviving teardown writes a signal belonging to a subtree that no longer
        // exists — a leak.
        const [frag, dispose] = collectDisposers(() =>
            awaitTimed(() => false, () => node('done'), () => node('loading'), { minMs: 20, maxMs: 30 }),
        );
        const host = mount(frag as DocumentFragment);

        dispose();
        host.remove();
        await after(60);

        expect(host.textContent, 'a timer redrew a subtree that had been torn down').toBe('');
    });
});

describe('portal', () => {
    it('renders into the target it names', () => {
        const target = document.createElement('div');
        target.id = 'portal-target';
        document.body.appendChild(target);

        mount(portal(() => node('portalled'), '#portal-target'));

        expect(target.textContent).toBe('portalled');
    });

    it('takes an element as the target too', () => {
        const target = document.createElement('div');
        document.body.appendChild(target);

        mount(portal(() => node('portalled'), target));

        expect(target.textContent).toBe('portalled');
    });

    it('waits for a target that appears later, and fills it when it does', async () => {
        // A route or layout mounted after this one: without the retry, the effect would return
        // having tracked nothing and never run again.
        mount(portal(() => node('portalled'), '#late-target'));

        const target = document.createElement('div');
        target.id = 'late-target';
        document.body.appendChild(target);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

        expect(target.textContent, 'the portal never retried for a target added after it')
            .toBe('portalled');
    });

    it('warns rather than retrying forever when the target is an element that is not there', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const detached = document.createElement('div');
        detached.remove();

        mount(portal(() => node('x'), null as unknown as Element));

        expect(warn.mock.calls.some((c) => String(c[0]).includes('portal')),
            'a portal with no target failed silently').toBe(true);
        warn.mockRestore();
    });
});
