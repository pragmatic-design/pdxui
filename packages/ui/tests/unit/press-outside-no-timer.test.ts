// A floating component listens for a press outside from the moment it opens, with no timer (#427).
//
// Eight components added the listener from a `setTimeout`, so the press that opened them would not
// close them. The timer outlived a component left open (pdx-split-button's fired after a test file's
// environment was torn down, #382). Now the listener is on the document as soon as `open()` returns,
// and the press that opened the component — still being dispatched — is told apart by its time.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';
import '../../src/context-menu/pdx-context-menu';
import '../../src/menubar/pdx-menubar';
import '../../src/inline-edit/pdx-inline-edit';
import '../../src/cascader/pdx-cascader';
import '../../src/tree-select/pdx-tree-select';
import { openColumnChooser, closeColumnChooser } from '../../src/shared/column-chooser';
import { openFilterPopoverFor, closeFilterPopover, createEmptyState, type FilterFieldInfo } from '../../src/shared/filter-popover';

type Host = HTMLElement & Record<string, (...args: unknown[]) => void>;

interface Target {
    name: string;
    /** The press it listens for. */
    press: 'mousedown' | 'pointerdown';
    /** Mount it, and return what opens it. */
    mount(): Promise<() => void>;
}

async function mounted(tag: string, setup: (el: Host) => void = () => {}): Promise<Host> {
    const el = document.createElement(tag) as Host;
    setup(el);
    document.body.appendChild(el);
    await tick(50);
    return el;
}

function anchor(): HTMLElement {
    const b = document.createElement('button');
    document.body.appendChild(b);
    return b;
}

const field: FilterFieldInfo = { field: 'name', label: 'Name', type: 'text' };
const tree = [{ key: 'a', label: 'A', children: [{ key: 'a1', label: 'A1' }] }];

const TARGETS: Target[] = [
    {
        name: 'pdx-dropdown-menu', press: 'mousedown',
        mount: async () => {
            const el = await mounted('pdx-dropdown-menu', (e) => {
                e.setAttribute('label', 'Options');
                (e as unknown as { items: unknown[] }).items = [{ key: 'a', label: 'A' }];
            });
            return () => el.show();
        },
    },
    {
        name: 'pdx-context-menu', press: 'mousedown',
        mount: async () => {
            const el = await mounted('pdx-context-menu', (e) => {
                (e as unknown as { items: unknown[] }).items = [{ key: 'a', label: 'A' }];
                e.appendChild(document.createElement('div'));
            });
            return () => el.open(10, 10);
        },
    },
    {
        name: 'pdx-menubar', press: 'mousedown',
        mount: async () => {
            const el = await mounted('pdx-menubar');
            (el as unknown as { items: unknown[] }).items = [{ key: 'file', label: 'File', children: [{ key: 'new', label: 'New' }] }];
            await tick(100);
            return () => el.openMenu('file');
        },
    },
    {
        name: 'pdx-inline-edit', press: 'mousedown',
        mount: async () => {
            const el = await mounted('pdx-inline-edit', (e) => { e.setAttribute('value', 'x'); });
            return () => el.startEdit();
        },
    },
    {
        name: 'pdx-cascader', press: 'mousedown',
        mount: async () => {
            const el = await mounted('pdx-cascader', (e) => { (e as unknown as { options: unknown[] }).options = tree; });
            return () => el.show();
        },
    },
    {
        name: 'pdx-tree-select', press: 'mousedown',
        mount: async () => {
            const el = await mounted('pdx-tree-select', (e) => { (e as unknown as { data: unknown[] }).data = tree; });
            return () => el.show();
        },
    },
    {
        name: 'column chooser', press: 'pointerdown',
        mount: async () => () => openColumnChooser(
            [{ field: 'name', header: 'Name', visible: true }], anchor(), { onToggle() {}, onReorder() {} }),
    },
    {
        name: 'filter popover', press: 'pointerdown',
        mount: async () => () => openFilterPopoverFor(
            field, createEmptyState(field), anchor(), { onApply() {}, onClear() {}, onClose() {} }),
    },
];

/** Press listeners on `document`, added minus removed. */
function countPresses(type: string): () => number {
    let net = 0;
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((t: string, ...rest: any[]) => {
        if (t === type) net++;
        return (add as any)(t, ...rest);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((t: string, ...rest: any[]) => {
        if (t === type) net--;
        return (remove as any)(t, ...rest);
    });
    return () => net;
}

/** A press on the page, outside every component. */
function pressOutside(type: 'mousedown' | 'pointerdown', target: Element = document.body): void {
    const Ctor = type === 'pointerdown' && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
}

describe('a floating component listens for a press outside as soon as it opens (#427)', () => {
    afterEach(() => { closeColumnChooser(); closeFilterPopover(); vi.restoreAllMocks(); cleanup(); });

    for (const t of TARGETS) {
        it(`${t.name}: the listener is on the document when open() returns, and a press outside closes it`, async () => {
            const open = await t.mount();
            const net = countPresses(t.press);
            open();
            expect(net(), 'no press listener right after opening: it waits for a timer').toBe(1);
            pressOutside(t.press);
            await tick();
            expect(net(), 'a press outside did not close it').toBe(0);
        });

        it(`${t.name}: the press that opened it, still being dispatched, does not close it`, async () => {
            const open = await t.mount();
            const net = countPresses(t.press);
            const outside = document.createElement('div');
            document.body.appendChild(outside);
            outside.addEventListener(t.press, () => open(), { once: true });
            // Read at once: a close by that press would happen during its dispatch, and what the
            // component builds in the frames after may add press listeners of its own.
            pressOutside(t.press, outside);
            expect(net(), 'the press that opened it closed it again').toBe(1);
        });
    }
});
