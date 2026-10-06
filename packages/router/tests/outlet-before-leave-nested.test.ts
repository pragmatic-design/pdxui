// onBeforeLeave registered by a component NESTED inside the page is asked too.
//
// Reading `_beforeLeaveCallbacks` off the routed element only would leave a guard registered by a
// child component — a dialog on the page, an editor panel, a composable called in a child — dead.
// That includes createForm({ warnUnsaved: true }): a form in a dialog inside the owner page must
// ask before the page is left with a name typed.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { component, html, onBeforeLeave, createForm, getDialogQueue } from '@pdxui/core';
import type { Form } from '@pdxui/core';

// Registered BEFORE the outlet connects — autoInitRouter reads these on connect.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/owner', tag: 'pdx-nested-owner-page' },
    { path: '/owner-form', tag: 'pdx-nested-form-page' },
    { path: '/plain', tag: 'pdx-nested-plain-page' },
    { path: '/elsewhere', tag: 'pdx-nested-elsewhere' },
];

/** What the child's guard answers, and how many times it was asked. */
let answer: boolean = true;
let asked = 0;

component('pdx-nested-guard', {
    setup() {
        onBeforeLeave(() => { asked++; return answer; });
        return {};
    },
    render: () => html`<span>editor</span>`,
});
component('pdx-nested-owner-page', {
    setup: () => ({}),
    render: () => html`<section><pdx-nested-guard></pdx-nested-guard></section>`,
});

let form: Form<{ name: string }>;
component('pdx-nested-animal-dialog', {
    setup() {
        form = createForm({ initialValues: { name: '' }, warnUnsaved: true });
        return {};
    },
    render: () => html`<div role="dialog">new animal</div>`,
});
component('pdx-nested-form-page', {
    setup: () => ({}),
    render: () => html`<div><pdx-nested-animal-dialog></pdx-nested-animal-dialog></div>`,
});
component('pdx-nested-plain-page', {
    setup: () => ({}),
    render: () => html`<p>nothing to guard</p>`,
});
customElements.define('pdx-nested-elsewhere', class extends HTMLElement {});
// The warnUnsaved guard mounts the dialog outlet; a stand-in, the real one is @pdxui/ui.
customElements.define('pdx-overlay-outlet', class extends HTMLElement {});

import { navigate, currentPath } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise(r => setTimeout(r, 0));

async function go(path: string): Promise<void> {
    navigate(path);
    await tick();
    await tick();
}

describe('the outlet asks the components inside the page it is leaving', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/elsewhere');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await tick();
    });
    afterEach(() => getDialogQueue().closeAll());

    it('a child component refuses: the navigation is refused and the page stays', async () => {
        await go('/owner');
        answer = false;
        asked = 0;

        await go('/elsewhere');

        expect(asked, 'the child\'s guard was never asked').toBe(1);
        expect(currentPath()).toBe('/owner');
        expect(document.querySelector('pdx-nested-elsewhere')).toBeNull();
    });

    it('control — the child allows: the navigation goes through', async () => {
        await go('/owner');
        answer = true;
        asked = 0;

        await go('/elsewhere');

        expect(asked).toBe(1);
        expect(currentPath()).toBe('/elsewhere');
    });

    it('a dirty warnUnsaved form in a child: the confirm opens, and Stay keeps the page', async () => {
        await go('/owner-form');
        form.fields.name.onChange('Fido');

        navigate('/elsewhere');
        await tick();
        const items = getDialogQueue().items();
        expect(items.length, 'leaving did not ask about the typed name').toBe(1);
        getDialogQueue().close(items[0].id, false);
        await tick();
        await tick();

        expect(currentPath()).toBe('/owner-form');
        expect(form.fields.name.value()).toBe('Fido');
        // Saved: clean again, so the next case can leave this page without being asked.
        form.reset({ name: 'Fido' });
    });

    it('control — a page with no guard anywhere navigates without asking', async () => {
        await go('/plain');
        await go('/elsewhere');
        expect(getDialogQueue().items().length).toBe(0);
        expect(currentPath()).toBe('/elsewhere');
    });
});
