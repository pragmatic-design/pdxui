// A generated page at boot (#160, part 5a): the outlet finds the route the server wrote — its layouts,
// their hosts, the page — and keeps it as its own instead of building it again. Every element stays
// the object the parser made, and the outlet goes on from there as if it had built them: the next
// navigation tears the layouts down through the stack it adopted.

import { describe, it, expect, beforeAll } from 'vitest';
import { html } from '@pdxui/core';
import { renderToString } from '@pdxui/core/server';

for (const tag of ['sa-shell', 'sa-admin', 'sa-users', 'sa-other']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [
        { path: '/admin/:section', tag: 'sa-users', layouts: ['sa-shell', 'sa-admin'] },
        { path: '/other', tag: 'sa-other' },
    ],
    pageModules: {},
};

import { serverRoute } from '../src/server';
import { installRouteAdoption } from '../src/hydrate';
import { navigate } from '../src/runtime';
import '../src/outlet';

installRouteAdoption();

const tick = () => new Promise((r) => setTimeout(r, 0));
let outlet: HTMLElement;
let written: { shell: Element; admin: Element; page: Element };

beforeAll(async () => {
    await serverRoute('/admin/users');
    const markup = renderToString(() => html`<pdx-router-outlet></pdx-router-outlet>`);
    history.replaceState(null, '', '/admin/users');
    const box = document.createElement('div');
    box.innerHTML = markup;
    written = {
        shell: box.querySelector('sa-shell')!,
        admin: box.querySelector('sa-admin')!,
        page: box.querySelector('sa-users')!,
    };
    document.body.appendChild(box);
    outlet = box.querySelector('pdx-router-outlet')!;
    await tick();
});

describe('the outlet of a generated page', () => {
    it('keeps the layouts and the page the server wrote, as the same elements', () => {
        expect(written.page, 'the server wrote no page').not.toBeNull();
        expect(outlet.querySelectorAll('sa-shell')).toHaveLength(1);
        expect(outlet.querySelectorAll('sa-users')).toHaveLength(1);
        expect(outlet.querySelector('sa-shell')).toBe(written.shell);
        expect(outlet.querySelector('sa-admin')).toBe(written.admin);
        expect(outlet.querySelector('sa-users'), 'the page was built again').toBe(written.page);
        expect(written.page.getAttribute('section')).toBe('users');
    });

    it('drops the mark once it has read it', () => {
        expect(outlet.hasAttribute('data-pdx-ssg')).toBe(false);
    });

    it('goes on from the tree it adopted: the next route takes the layouts down', async () => {
        navigate('/other');
        await tick();
        expect(outlet.querySelector('sa-other'), 'the next page did not render').not.toBeNull();
        expect(outlet.querySelector('sa-shell'), 'the adopted shell was left behind').toBeNull();
        expect(outlet.querySelector('sa-users')).toBeNull();
    });
});
