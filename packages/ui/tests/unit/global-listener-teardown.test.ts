// A contract test: after a component is destroyed, NO global listener that component
// registered may remain on document.
// It instruments document.addEventListener/removeEventListener and checks the balance.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, tick, cleanup, uniqueTag } from './helpers';
import '../../src/cascader/pdx-cascader';
import '../../src/tree-select/pdx-tree-select';
import '../../src/inline-edit/pdx-inline-edit';
import '../../src/chart/pdx-sparkline';

void uniqueTag; // helper importato per uniformità

type Listener = EventListenerOrEventListenerObject;

const origAdd = document.addEventListener.bind(document);
const origRemove = document.removeEventListener.bind(document);
let active: Map<Listener, string>;

beforeEach(() => {
    active = new Map();
    (document as unknown as Record<string, unknown>).addEventListener =
        ((type: string, handler: Listener, opts?: unknown) => {
            active.set(handler, type);
            return origAdd(type, handler as EventListener, opts as AddEventListenerOptions);
        });
    (document as unknown as Record<string, unknown>).removeEventListener =
        ((type: string, handler: Listener, opts?: unknown) => {
            active.delete(handler);
            return origRemove(type, handler as EventListener, opts as AddEventListenerOptions);
        });
});

afterEach(() => {
    (document as unknown as Record<string, unknown>).addEventListener = origAdd;
    (document as unknown as Record<string, unknown>).removeEventListener = origRemove;
    cleanup();
});

describe('the global listeners are torn down on a destroy-while-open', () => {
    it('cascader: destroyed with its popover open, it leaves no mousedown on the document', async () => {
        const el = await mount<HTMLElement & { openCascader?: () => void }>('pdx-cascader');
        (el as unknown as { options?: unknown }).options = [{ value: 'a', label: 'A' }];
        await tick();
        el.openCascader?.();
        await tick(10); // the listener is added inside a setTimeout(0)

        el.remove(); // destroy while open
        await tick();
        expect([...active.values()].filter(t => t === 'mousedown').length).toBe(0);
    });

    it('tree-select: destroyed with its popover open, it leaves no mousedown on the document', async () => {
        const el = await mount<HTMLElement & { openTreeSelect?: () => void }>('pdx-tree-select');
        (el as unknown as { options?: unknown }).options = [{ value: 'a', label: 'A' }];
        await tick();
        el.openTreeSelect?.();
        await tick(10);

        el.remove();
        await tick();
        expect([...active.values()].filter(t => t === 'mousedown').length).toBe(0);
    });

    it('inline-edit: destroy durante l\'editing non lascia mousedown su document', async () => {
        const el = await mount<HTMLElement & { startEdit?: () => void }>('pdx-inline-edit', { value: 'x' });
        await tick();
        el.startEdit?.();
        await tick(10);

        el.remove();
        await tick();
        expect([...active.values()].filter(t => t === 'mousedown').length).toBe(0);
    });
});

describe('sparkline: the MutationObserver is disconnected on destroy', () => {
    it('the destroy disconnects the observer on documentElement', async () => {
        const disconnected: MutationObserver[] = [];
        const OrigMO = globalThis.MutationObserver;
        class TrackedMO extends OrigMO {
            disconnect(): void { disconnected.push(this); super.disconnect(); }
        }
        globalThis.MutationObserver = TrackedMO as typeof MutationObserver;
        try {
            const el = await mount('pdx-sparkline', { data: '1,2,3' });
            await tick();
            const before = disconnected.length;
            el.remove();
            await tick();
            expect(disconnected.length).toBeGreaterThan(before);
        } finally {
            globalThis.MutationObserver = OrigMO;
        }
    });
});
