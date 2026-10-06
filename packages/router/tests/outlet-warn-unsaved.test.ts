// A page with a dirty `warnUnsaved` form, and a link.
//
// createForm installs the leave guard itself; the outlet is what asks it. Measured end to end here:
// a real core component whose setup builds the form, a <pdx-link> click, the confirm in the dialog
// queue, and the outlet holding the page on "Stay". <pdx-overlay-outlet> lives in @pdxui/ui, so
// a stand-in is registered: the guard mounts one when the page has none, and this test answers
// through the queue the real outlet draws.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { component, html, createForm, getDialogQueue } from '@pdxui/core';
import type { Form } from '@pdxui/core';

// Registered BEFORE the outlet connects — autoInitRouter reads these on connect.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/owners/new', tag: 'pdx-unsaved-owner' },
    { path: '/owners', tag: 'pdx-unsaved-owners' },
    // A route-level redirect: the router runs the before-hooks again for the hop.
    { path: '/clients', tag: 'pdx-unsaved-owners', redirect: '/owners' },
];

let form: Form<{ name: string }>;
component('pdx-unsaved-owner', {
    setup() {
        form = createForm({ initialValues: { name: '' }, warnUnsaved: true });
        return {};
    },
    render: () => html`<pdx-link to="/owners">Owners</pdx-link>`,
});
customElements.define('pdx-unsaved-owners', class extends HTMLElement {});
customElements.define('pdx-overlay-outlet', class extends HTMLElement {});

import { navigate, currentPath } from '../src/runtime';
import '../src/outlet';
import '../src/link';

const tick = () => new Promise(r => setTimeout(r, 0));

async function openNewOwner(): Promise<void> {
    navigate('/owners/new');
    await tick();
    await tick();
}

function clickOwnersLink(): void {
    (document.querySelector('pdx-unsaved-owner pdx-link a') as HTMLElement).click();
}

describe('a dirty warnUnsaved form, and a link away', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/owners');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await tick();
    });
    afterEach(() => getDialogQueue().closeAll());

    it('the dialog opens, and "Stay" keeps the page and the typed value', async () => {
        await openNewOwner();
        form.fields.name.onChange('Rossi');

        clickOwnersLink();
        await tick();
        const items = getDialogQueue().items();
        expect(items.length, 'no dialog opened for unsaved work').toBe(1);
        expect(items[0].title).toBe('Unsaved changes');

        getDialogQueue().close(items[0].id, false);
        await tick();
        await tick();
        expect(currentPath()).toBe('/owners/new');
        expect(document.querySelector('pdx-unsaved-owners'), 'the list was mounted behind "Stay"').toBeNull();
        expect(form.fields.name.value()).toBe('Rossi');
    });

    it('"Leave" goes to the list', async () => {
        await openNewOwner();
        form.fields.name.onChange('Rossi');
        clickOwnersLink();
        await tick();
        getDialogQueue().close(getDialogQueue().items()[0].id, true);
        await tick();
        await tick();
        expect(currentPath()).toBe('/owners');
        expect(document.querySelector('pdx-unsaved-owners')).toBeTruthy();
    });

    it('control — nothing typed: the link goes without a question', async () => {
        await openNewOwner();
        clickOwnersLink();
        await tick();
        await tick();
        expect(getDialogQueue().items().length).toBe(0);
        expect(currentPath()).toBe('/owners');
    });
});

// The page is asked BEFORE the address moves, where onBeforeNavigate is asked.
//
// Asked once the route has already changed, the address bar would name the destination while
// "Unsaved changes" is on screen, and "Stay" would come back with navigate(), a push: one more
// history entry, with the refused destination one Back away.
describe('a dirty warnUnsaved form: the address and the history', () => {
    /** The browser's Back, as happy-dom can do it: the URL moves, then popstate is answered. */
    function back(path: string): void {
        history.replaceState(null, '', path);
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }
    afterEach(() => getDialogQueue().closeAll());

    it('while the question is open the address is still the page; "Stay" adds no history entry', async () => {
        await openNewOwner();
        form.fields.name.onChange('Rossi');
        const before = history.length;

        clickOwnersLink();
        await tick();
        expect(getDialogQueue().items().length, 'no dialog opened').toBe(1);
        expect(location.pathname, 'the address named the destination while asking').toBe('/owners/new');

        getDialogQueue().close(getDialogQueue().items()[0].id, false);
        await tick();
        await tick();
        expect(location.pathname).toBe('/owners/new');
        expect(currentPath()).toBe('/owners/new');
        expect(history.length, '"Stay" came back with a new history entry').toBe(before);
    });

    it('a refused Back puts the address back without a new entry', async () => {
        await openNewOwner();
        form.fields.name.onChange('Rossi');
        const before = history.length;

        back('/owners');
        await tick();
        expect(getDialogQueue().items().length, 'Back did not ask').toBe(1);

        getDialogQueue().close(getDialogQueue().items()[0].id, false);
        await tick();
        await tick();
        expect(location.pathname, 'the refused Back left the address on the destination').toBe('/owners/new');
        expect(currentPath()).toBe('/owners/new');
        expect(document.querySelector('pdx-unsaved-owners')).toBeNull();
        expect(history.length).toBe(before);
    });

    it('"Leave" towards a route that redirects asks once, and lands on the redirect target', async () => {
        await openNewOwner();
        form.fields.name.onChange('Rossi');
        let asked = 0;

        navigate('/clients');
        await tick();
        asked += getDialogQueue().items().length;
        getDialogQueue().close(getDialogQueue().items()[0].id, true);
        await tick();
        await tick();
        asked += getDialogQueue().items().length;
        expect(asked, 'the redirect hop asked the page a second time').toBe(1);
        expect(currentPath()).toBe('/owners');
        // AND the address followed the redirect. Without this line "asks once" can be bought back
        // by not moving the address at all: a router that recognises the hop by reading
        // `location.pathname` ties the two behaviours into one knot.
        expect(location.pathname, 'the address stayed on the path that redirects').toBe('/owners');
    });
});
