// The column chooser and the filter popover attach their outside-click and scroll listeners a tick
// after they open, so the click that opened them does not close them. Closing them through their
// exported close — what the grid, its toolbar and a reopen call — must take those listeners away,
// whether they are already attached or still pending; otherwise they stay on the document and
// window with nothing to remove them, and a pending one fires into a torn-down environment.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import { openColumnChooser, closeColumnChooser } from '../../src/shared/column-chooser';
import { openFilterPopoverFor, closeFilterPopover, createEmptyState, type FilterFieldInfo } from '../../src/shared/filter-popover';

const WATCHED = new Set(['pointerdown', 'scroll']);

/** Listeners of the watched types added minus removed, on document and window. */
function countListeners(): () => number {
    let net = 0;
    for (const target of [document, window] as EventTarget[]) {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        vi.spyOn(target, 'addEventListener').mockImplementation((type: string, ...rest: any[]) => {
            if (WATCHED.has(type)) net++;
            return (add as any)(type, ...rest);
        });
        vi.spyOn(target, 'removeEventListener').mockImplementation((type: string, ...rest: any[]) => {
            if (WATCHED.has(type)) net--;
            return (remove as any)(type, ...rest);
        });
    }
    return () => net;
}

function anchor(): HTMLElement {
    const b = document.createElement('button');
    document.body.appendChild(b);
    return b;
}

const openChooser = () => openColumnChooser(
    [{ field: 'name', header: 'Name', visible: true }], anchor(), { onToggle() {}, onReorder() {} });

const field: FilterFieldInfo = { field: 'name', label: 'Name', type: 'text' };
const openFilter = () => openFilterPopoverFor(
    field, createEmptyState(field), anchor(), { onApply() {}, onClear() {}, onClose() {} });

describe('shared grid popovers take their listeners with them when closed', () => {
    let net: () => number;
    beforeEach(() => { cleanup(); net = countListeners(); });
    afterEach(() => { closeColumnChooser(); closeFilterPopover(); vi.restoreAllMocks(); });

    for (const [name, open, close] of [
        ['column chooser', openChooser, closeColumnChooser],
        ['filter popover', openFilter, closeFilterPopover],
    ] as const) {
        it(`${name}: closed before the listeners attach`, async () => {
            open();
            close();
            await tick(20);
            expect(net()).toBe(0);
        });

        it(`${name}: closed after the listeners attached`, async () => {
            open();
            await tick(20);
            close();
            expect(net()).toBe(0);
        });

        it(`${name}: reopened, then closed`, async () => {
            open();
            await tick(20);
            open();
            await tick(20);
            close();
            expect(net()).toBe(0);
        });
    }
});
