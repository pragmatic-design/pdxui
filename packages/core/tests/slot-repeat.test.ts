// Tests for repeatWithSlot() — slot + keyed reconciliation bridge.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { repeatWithSlot } from '../src/renderer/slot-repeat';
import type { SlotFunction } from '../src/renderer/slot';

function flush(): Promise<void> {
    return new Promise(resolve => queueMicrotask(resolve));
}

describe('repeatWithSlot()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('uses default renderer when no slot or callback provided', async () => {
        const items = signal(['a', 'b', 'c']);
        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            null,           // no slot
            null,           // no callback
            (item) => {
                const el = document.createElement('span');
                el.textContent = item;
                el.className = 'default';
                return el;
            },
        );
        document.body.appendChild(frag);
        await flush();

        const spans = document.querySelectorAll('.default');
        expect(spans.length).toBe(3);
        expect(spans[0].textContent).toBe('a');
        expect(spans[1].textContent).toBe('b');
        expect(spans[2].textContent).toBe('c');
    });

    it('uses render callback when provided (no slot)', async () => {
        const items = signal([1, 2]);
        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            null,           // no slot
            (item) => {     // callback prop
                const el = document.createElement('div');
                el.className = 'callback';
                el.textContent = `cb-${item}`;
                return el;
            },
            (_item) => document.createElement('span'), // default (should NOT be used)
        );
        document.body.appendChild(frag);
        await flush();

        const divs = document.querySelectorAll('.callback');
        expect(divs.length).toBe(2);
        expect(divs[0].textContent).toBe('cb-1');
        expect(divs[1].textContent).toBe('cb-2');
        // default renderer not used
        expect(document.querySelectorAll('span').length).toBe(0);
    });

    it('slot function takes priority over callback and default', async () => {
        const items = signal(['x', 'y']);
        const slotFn: SlotFunction = (scope) => {
            const el = document.createElement('em');
            el.className = 'slot';
            el.textContent = `slot-${scope.item}-${scope.index}`;
            return el;
        };
        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            slotFn,
            (item) => {     // callback (should NOT be used)
                const el = document.createElement('div');
                el.textContent = `cb-${item}`;
                return el;
            },
            (_item) => document.createElement('span'), // default (should NOT be used)
            (item, index) => ({ item, index }),
        );
        document.body.appendChild(frag);
        await flush();

        const ems = document.querySelectorAll('.slot');
        expect(ems.length).toBe(2);
        expect(ems[0].textContent).toBe('slot-x-0');
        expect(ems[1].textContent).toBe('slot-y-1');
        // Neither callback nor default used
        expect(document.querySelectorAll('div').length).toBe(0);
    });

    it('scopeMapper shapes the scope object correctly', async () => {
        const receivedScopes: Record<string, unknown>[] = [];
        const items = signal([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
        const slotFn: SlotFunction = (scope) => {
            receivedScopes.push({ ...scope });
            const el = document.createElement('span');
            el.textContent = scope.label as string;
            return el;
        };

        const frag = repeatWithSlot(
            () => items(),
            (item) => item.id,
            slotFn,
            null,
            () => document.createElement('span'),
            (item, index) => ({ label: item.name, value: item.id, index }),
        );
        document.body.appendChild(frag);
        await flush();

        expect(receivedScopes).toEqual([
            { label: 'Alice', value: 1, index: 0 },
            { label: 'Bob', value: 2, index: 1 },
        ]);
    });

    it('uses default scopeMapper ({item, index}) when none provided', async () => {
        const receivedScopes: Record<string, unknown>[] = [];
        const items = signal(['a']);
        const slotFn: SlotFunction = (scope) => {
            receivedScopes.push({ ...scope });
            return document.createElement('span');
        };

        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            slotFn,
            null,
            () => document.createElement('span'),
            // no scopeMapper — uses default {item, index}
        );
        document.body.appendChild(frag);
        await flush();

        expect(receivedScopes[0]).toEqual({ item: 'a', index: 0 });
    });

    it('renders empty list without errors', async () => {
        const items = signal<string[]>([]);
        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            null,
            null,
            (item) => {
                const el = document.createElement('span');
                el.textContent = item;
                return el;
            },
        );
        document.body.appendChild(frag);
        await flush();

        expect(document.querySelectorAll('span').length).toBe(0);
    });

    it('reconciles when items change (keyed update)', async () => {
        const items = signal(['a', 'b', 'c']);
        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            null,
            null,
            (item) => {
                const el = document.createElement('span');
                el.className = 'item';
                el.textContent = item;
                return el;
            },
        );
        document.body.appendChild(frag);
        await flush();

        expect(document.querySelectorAll('.item').length).toBe(3);

        // Remove middle item, add new one
        items.set(['a', 'c', 'd']);
        await flush();

        const spans = document.querySelectorAll('.item');
        expect(spans.length).toBe(3);
        expect(spans[0].textContent).toBe('a');
        expect(spans[1].textContent).toBe('c');
        expect(spans[2].textContent).toBe('d');
    });

    it('slot function works with reconciliation updates', async () => {
        const items = signal([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
        const slotFn: SlotFunction = (scope) => {
            const el = document.createElement('div');
            el.className = 'slot-item';
            el.textContent = `${scope.name}`;
            return el;
        };

        const frag = repeatWithSlot(
            () => items(),
            (item) => item.id,
            slotFn,
            null,
            () => document.createElement('span'),
            (item) => ({ name: item.name }),
        );
        document.body.appendChild(frag);
        await flush();

        expect(document.querySelectorAll('.slot-item').length).toBe(2);

        // Add a third item
        items.set([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]);
        await flush();

        const divs = document.querySelectorAll('.slot-item');
        expect(divs.length).toBe(3);
        expect(divs[2].textContent).toBe('C');
    });

    it('handles undefined slotFn gracefully (same as null)', async () => {
        const items = signal(['x']);
        const frag = repeatWithSlot(
            () => items(),
            (item) => item,
            undefined,      // undefined slot
            null,
            (item) => {
                const el = document.createElement('span');
                el.className = 'def';
                el.textContent = item;
                return el;
            },
        );
        document.body.appendChild(frag);
        await flush();

        expect(document.querySelector('.def')?.textContent).toBe('x');
    });
});
