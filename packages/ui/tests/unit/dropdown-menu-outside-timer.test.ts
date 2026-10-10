// A popup that adds its click-outside listener on a timer must cancel the timer when it closes (#163).
//
// pdx-dropdown-menu, pdx-context-menu and pdx-menubar add a `mousedown` listener on `document` 10 ms
// after they open, pdx-inline-edit on the next task after it starts editing. Closed — or removed —
// before that, they got the listener anyway: added after the close ran, nothing removed it. In a
// test whose environment was gone the timer reached for a `document` that no longer existed, which
// is how it surfaced. pdx-split-button had the same defect and was fixed the same way before.

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
        open: (el) => el.open(),
        close: (el) => el.close(),
    },
    {
        name: 'pdx-context-menu',
        mount: () => mounted('pdx-context-menu', (el) => {
            (el as unknown as { items: unknown[] }).items = [{ key: 'a', label: 'A' }];
            el.appendChild(document.createElement('div'));
        }),
        open: (el) => el.open(10, 10),
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

/** The mousedown listeners added to `document` while `fn` runs and for `ms` after it. */
async function mousedownsAdded(fn: () => void, ms: number): Promise<number> {
    const spy = vi.spyOn(document, 'addEventListener');
    try {
        fn();
        await tick(ms);
        return spy.mock.calls.filter((c) => c[0] === 'mousedown').length;
    } finally {
        spy.mockRestore();
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
