// Tests for Scoped Slot runtime.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { renderSlot, slotCarrier } from '../src/renderer/slot';
import type { SlotFunction } from '../src/renderer/slot';

describe('renderSlot()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders default content when no slot function provided', () => {
        const frag = renderSlot(
            undefined,
            'cell',
            null,
            () => html`<span class="cell">default cell</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.cell')?.textContent).toBe('default cell');
    });

    it('renders slot function when provided', () => {
        const slots: Record<string, SlotFunction> = {
            cell: (scope) => {
                const el = document.createElement('span');
                el.className = 'custom';
                el.textContent = `custom: ${scope.value}`;
                return el;
            },
        };

        const frag = renderSlot(
            slots,
            'cell',
            () => ({ value: 'hello' }),
            () => html`<span class="cell">default</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.custom')?.textContent).toBe('custom: hello');
    });

    it('slot function receives scope data', () => {
        const receivedScope: Record<string, unknown>[] = [];

        const slots: Record<string, SlotFunction> = {
            item: (scope) => {
                receivedScope.push({ ...scope });
                const span = document.createElement('span');
                span.textContent = `${scope.name}-${scope.index}`;
                return span;
            },
        };

        const frag = renderSlot(
            slots,
            'item',
            () => ({ name: 'Alice', index: 0 }),
            () => html`<span>default</span>`
        );

        document.body.appendChild(frag);
        expect(receivedScope).toHaveLength(1);
        expect(receivedScope[0]).toEqual({ name: 'Alice', index: 0 });
        expect(document.querySelector('span')?.textContent).toBe('Alice-0');
    });

    it('re-renders when scope data changes (reactive)', () => {
        const name = signal('Alice');

        const slots: Record<string, SlotFunction> = {
            cell: (scope) => {
                const el = document.createElement('span');
                el.className = 'slot-cell';
                el.textContent = String(scope.name);
                return el;
            },
        };

        const frag = renderSlot(
            slots,
            'cell',
            () => ({ name: name() }),
            () => html`<span class="cell">default</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.slot-cell')?.textContent).toBe('Alice');

        name.set('Bob');
        expect(document.querySelector('.slot-cell')?.textContent).toBe('Bob');
    });

    it('renders default when slot name not in slots record', () => {
        const slots: Record<string, SlotFunction> = {
            other: () => html`<div>other</div>`,
        };

        const frag = renderSlot(
            slots,
            'cell',
            null,
            () => html`<span class="cell">default</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.cell')?.textContent).toBe('default');
    });

    it('works with empty slots record', () => {
        const frag = renderSlot(
            {},
            'cell',
            null,
            () => html`<span class="cell">default</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('.cell')?.textContent).toBe('default');
    });

    it('slot function can return DocumentFragment', () => {
        const slots: Record<string, SlotFunction> = {
            multi: () => {
                const frag = document.createDocumentFragment();
                const span1 = document.createElement('span');
                span1.textContent = 'A';
                const span2 = document.createElement('span');
                span2.textContent = 'B';
                frag.appendChild(span1);
                frag.appendChild(span2);
                return frag;
            },
        };

        const frag = renderSlot(
            slots,
            'multi',
            () => ({}),
            () => html`<span>default</span>`
        );

        document.body.appendChild(frag);
        const spans = document.querySelectorAll('span');
        expect(spans).toHaveLength(2);
        expect(spans[0].textContent).toBe('A');
        expect(spans[1].textContent).toBe('B');
    });

    it('null scopeFn passes empty object to slot function', () => {
        let receivedScope: Record<string, unknown> | null = null;

        const slots: Record<string, SlotFunction> = {
            test: (scope) => {
                receivedScope = scope;
                return document.createElement('div');
            },
        };

        const frag = renderSlot(
            slots,
            'test',
            null,
            () => html`<div>default</div>`
        );

        document.body.appendChild(frag);
        expect(receivedScope).toEqual({});
    });
});

describe('slotCarrier()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('creates a hidden carrier element with slot function', () => {
        const fn: SlotFunction = (scope) => {
            const el = document.createElement('span');
            el.textContent = String(scope.name);
            return el;
        };

        const carrier = slotCarrier('item', fn);
        expect(carrier.tagName.toLowerCase()).toBe('pdx-slot');
        expect(carrier.style.display).toBe('none');
        expect((carrier as any).__pdxSlotName).toBe('item');
        expect((carrier as any).__pdxSlot).toBe(fn);
    });

    it('carrier slot function is callable with scope data', () => {
        const fn: SlotFunction = (scope) => {
            const el = document.createElement('span');
            el.textContent = `${scope.label} (${scope.index})`;
            return el;
        };

        const carrier = slotCarrier('cell', fn);
        const slotFn = (carrier as any).__pdxSlot as SlotFunction;
        const result = slotFn({ label: 'Hello', index: 42 });
        expect((result as HTMLElement).textContent).toBe('Hello (42)');
    });

    it('integrates with renderSlot — carrier function used as slot', () => {
        const fn: SlotFunction = (scope) => {
            const el = document.createElement('b');
            el.textContent = String(scope.value);
            return el;
        };

        const carrier = slotCarrier('test', fn);
        const slots: Record<string, SlotFunction> = {};
        slots[(carrier as any).__pdxSlotName] = (carrier as any).__pdxSlot;

        const frag = renderSlot(
            slots,
            'test',
            () => ({ value: 'scoped-data' }),
            () => html`<span>default</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('b')?.textContent).toBe('scoped-data');
    });

    it('works with scopeless slot (no scope data)', () => {
        const fn: SlotFunction = () => {
            const el = document.createElement('em');
            el.textContent = 'no results';
            return el;
        };

        const carrier = slotCarrier('empty', fn);
        const slots: Record<string, SlotFunction> = {};
        slots[(carrier as any).__pdxSlotName] = (carrier as any).__pdxSlot;

        const frag = renderSlot(
            slots,
            'empty',
            null,
            () => html`<span>default</span>`
        );

        document.body.appendChild(frag);
        expect(document.querySelector('em')?.textContent).toBe('no results');
    });
});
