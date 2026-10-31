// A popup closed — or removed — at once leaves no click-outside listener on the document (#163).
//
// pdx-dropdown-menu, pdx-context-menu and pdx-menubar added a `mousedown` listener on `document` 10 ms
// after they opened, pdx-inline-edit on the next task after it started editing. Closed before that,
// they got the listener anyway: added after the close ran, nothing removed it. #163 cancelled the
// timer on close; #427 removed the timer, so the listener is added when the popup opens and the close
// removes it. Either way, what is measured is the listener left behind.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';
import '../../src/context-menu/pdx-context-menu';
import '../../src/menubar/pdx-menubar';
import '../../src/inline-edit/pdx-inline-edit';

type Host = HTMLElement & Record<string, (...args: unknown[]) => void>;

interface Popup {
    name: string;
    mount(): Promise<Host>;
    open(el: Host): void;
    close(el: Host): void;
}

async function mounted(tag: string, setup: (el: Host) => void = () => {}): Promise<Host> {
    const el = document.createElement(tag) as Host;
    setup(el);
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const POPUPS: Popup[] = [
    {
        name: 'pdx-dropdown-menu',
        mount: () => mounted('pdx-dropdown-menu', (el) => {
            el.setAttribute('label', 'Options');
            (el as unknown as { items: unknown[] }).items = [{ key: 'a', label: 'A' }];
        }),
        open: (el) => el.show(),
        close: (el) => el.close(),
    },
    {
        name: 'pdx-context-menu',
        mount: () => mounted('pdx-context-menu', (el) => {
            (el as unknown as { items: unknown[] }).items = [{ key: 'a', label: 'A' }];
            el.appendChild(document.createElement('div'));
        }),
        open: (el) => el.show(10, 10),
        close: (el) => el.close(),
    },
    {
        name: 'pdx-menubar',
        mount: async () => {
            const el = await mounted('pdx-menubar');
            (el as unknown as { items: unknown[] }).items = [{ key: 'file', label: 'File', children: [{ key: 'new', label: 'New' }] }];
            await tick(100);
            return el;
        },
        open: (el) => el.openMenu('file'),
        close: (el) => el.closeMenu(true),
    },
    {
        name: 'pdx-inline-edit',
        mount: () => mounted('pdx-inline-edit', (el) => { el.setAttribute('value', 'x'); }),
        open: (el) => el.startEdit(),
        close: (el) => el.cancelEdit(),
    },
];

/**
 * The mousedown listeners left on `document` by `fn` and the `ms` after it: added minus removed.
 * Since #427 the listener is added when the popup opens, not by a timer, so a close removes one that
 * was added; what must hold is that none is left.
 */
async function mousedownsAdded(fn: () => void, ms: number): Promise<number> {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    try {
        fn();
        await tick(ms);
        const count = (calls: unknown[][]) => calls.filter((c) => c[0] === 'mousedown').length;
        return count(add.mock.calls) - count(remove.mock.calls);
    } finally {
        add.mockRestore();
        remove.mockRestore();
    }
}

describe('a click-outside listener is not added after its popup closed (#163)', () => {
    afterEach(() => cleanup());

    for (const p of POPUPS) {
        it(`${p.name}: the control — left open, it does get the listener`, async () => {
            const el = await p.mount();
            expect(await mousedownsAdded(() => p.open(el), 40)).toBe(1);
            p.close(el);
        });

        it(`${p.name}: closed at once, it does not`, async () => {
            const el = await p.mount();
            expect(await mousedownsAdded(() => { p.open(el); p.close(el); }, 40)).toBe(0);
        });

        it(`${p.name}: removed at once, it does not`, async () => {
            const el = await p.mount();
            expect(await mousedownsAdded(() => { p.open(el); el.remove(); }, 40)).toBe(0);
        });
    }
});
