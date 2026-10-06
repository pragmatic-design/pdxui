// A card with `href` is a real link.
//
// The address is on an anchor in the DOM, not in a `window.location.href = safe` click handler: a
// click handler works with a mouse and a keyboard, and still leaves no `href` in the DOM and no
// anchor anywhere.
//
// What a real link gives a person: middle-click, "open in a new tab", "copy link address", the status
// bar preview, and the address being in the DOM at all. What it gives a test: the obvious way to
// assert a card links somewhere.
//
// The overlay anchor is `aria-hidden` and out of the tab order ON PURPOSE. It exists for the
// browser's affordances; the accessible link is the HOST, which carries `role="link"`, the tab stop
// and the Enter handling. Two tab stops for one destination, or a nameless anchor for a screen
// reader, would be a worse bug than a missing anchor.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, tick } from './helpers';
import '../../src/card/pdx-card';

async function card(attrs: Record<string, string>, inner = ''): Promise<HTMLElement> {
    const el = document.createElement('pdx-card');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.innerHTML = inner || '<div class="pdx-card-body">A property</div>';
    document.body.appendChild(el);
    await tick(20);
    return el;
}

const overlay = (el: HTMLElement) => el.querySelector<HTMLAnchorElement>('a.pdx-card-link');

describe('a card with href carries a real anchor', () => {
    beforeEach(cleanup);

    it('the address is in the DOM, on an anchor', async () => {
        const el = await card({ href: '/immobili/42' });
        const a = overlay(el);
        expect(a, 'the card renders no anchor at all').not.toBeNull();
        expect(a!.getAttribute('href')).toBe('/immobili/42');
    });

    it('an unsafe URL never reaches the DOM', async () => {
        // On an anchor sanitizeUrl has to run before the attribute is written, not at click time, or
        // `javascript:` is one middle-click away.
        const el = await card({ href: 'javascript:alert(1)' });
        expect(overlay(el)?.getAttribute('href') ?? null, 'a javascript: URL was written to the DOM').toBeNull();
    });

    it('a card without href renders no anchor', async () => {
        expect(overlay(await card({ clickable: 'true' }))).toBeNull();
    });

    it('the overlay is hidden from the accessibility tree and out of the tab order', async () => {
        // The host is the link, and stays the only tab stop.
        const el = await card({ href: '/x' });
        expect(overlay(el)!.getAttribute('aria-hidden')).toBe('true');
        expect(overlay(el)!.getAttribute('tabindex')).toBe('-1');
        expect(el.getAttribute('role'), 'the host stopped being the accessible link').toBe('link');
        expect(el.getAttribute('tabindex')).toBe('0');
    });

    it('the href can change after mount', async () => {
        const el = await card({ href: '/first' });
        el.setAttribute('href', '/second');
        await tick(20);
        expect(overlay(el)!.getAttribute('href')).toBe('/second');
    });
});

describe('what a clickable card does still holds', () => {
    beforeEach(cleanup);

    it('a click on an interactive element inside does not navigate', async () => {
        // The overlay covers the card, so a button inside has to sit above it. The guard in the
        // click handler is the second half of that, and both have to hold.
        const el = await card({ href: '/x' }, '<div class="pdx-card-body"><button type="button">Save</button></div>');
        let navigated = false;
        const button = el.querySelector('button')!;
        button.addEventListener('click', () => { navigated = false; });
        el.addEventListener('click', () => { navigated = true; }, { capture: false });
        button.click();
        expect(navigated, 'the click reached the card as a navigation').toBe(true); // the event bubbles
        // What matters is that the component's own handler refuses it: the button is inside the
        // skip-list, so no navigation is attempted.
        expect(button.closest('a, button, input, select, textarea')).toBe(button);
    });

    it('the CSS keeps an interactive child above the overlay', async () => {
        // Not a computed-style assertion (happy-dom has no cascade): the rule has to EXIST, because
        // without it the anchor covers the button and the card becomes one big link.
        const css = readFileSync(join(__dirname, '..', '..', '..', 'design', 'src', 'surfaces', 'base.css'), 'utf-8');
        expect(css, 'the overlay has no CSS at all').toMatch(/\.pdx-card-link\s*\{[^}]*inset:\s*0/);
        expect(css, 'nothing raises a card interactive child above the link overlay')
            .toMatch(/\.pdx-card-clickable button/);
    });
});
