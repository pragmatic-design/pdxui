// A pdx-nav-menu link, under the router.
//
// An entry with `href` is a plain <a>, and a browser that follows it in an app with
// @pdxui/router makes a FULL PAGE LOAD — the shell, the state and the prefetch gone. The router
// intercepts only <pdx-link>, and @pdxui/ui does not depend on the router.
//
// So `pdx-select` is cancelable: a listener that calls `preventDefault()` takes the navigation over
// (it calls `navigate(href)`), and the menu stops the anchor. A modified click — Ctrl, Cmd, Shift,
// the middle button — is the browser's: «open in a new tab» must keep working, so it is neither
// prevented nor reported as a selection.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

async function mount(): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = [{ key: 'tickets', label: 'Tickets', href: '/tickets' }];
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const link = (el: HTMLElement) => el.querySelector('a[data-nav-key="tickets"]') as HTMLAnchorElement;

function click(target: HTMLElement, init: MouseEventInit = {}): MouseEvent {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    target.dispatchEvent(ev);
    return ev;
}

describe('pdx-nav-menu: pdx-select is cancelable', () => {
    beforeEach(cleanup);

    it('a listener that prevents it takes the navigation over: the anchor does not follow', async () => {
        const el = await mount();
        let href = '';
        el.addEventListener('pdx-select', (e) => { e.preventDefault(); href = (e as CustomEvent).detail.href; });
        const ev = click(link(el));
        expect(href).toBe('/tickets');
        expect(ev.defaultPrevented, 'the browser would still load the page').toBe(true);
    });

    it('control — a listener that does not prevent it leaves the link a link', async () => {
        const el = await mount();
        let seen = false;
        el.addEventListener('pdx-select', () => { seen = true; });
        const ev = click(link(el));
        expect(seen).toBe(true);
        expect(ev.defaultPrevented).toBe(false);
    });

    for (const [name, init] of [
        ['Ctrl', { ctrlKey: true }], ['Cmd', { metaKey: true }], ['Shift', { shiftKey: true }], ['the middle button', { button: 1 }],
    ] as const) {
        it(`a ${name}-click is the browser's: not prevented, not a selection`, async () => {
            const el = await mount();
            let seen = false;
            el.addEventListener('pdx-select', (e) => { seen = true; e.preventDefault(); });
            const ev = click(link(el), init);
            expect(ev.defaultPrevented, '«open in a new tab» was taken away').toBe(false);
            expect(seen, 'the app would navigate this tab too').toBe(false);
        });
    }
});
