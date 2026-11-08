// A generated page that is not the route being shown (#160, part 5a) — the file served for another
// path, or a page the build wrote before the routes changed. What the server wrote goes, and the
// outlet builds the route it resolved, as on any page.

import { describe, it, expect, beforeAll } from 'vitest';
import { html } from '@pdxui/core';
import { renderToString } from '@pdxui/core/server';

for (const tag of ['sm-shell', 'sm-a', 'sm-b']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [
        { path: '/a', tag: 'sm-a', layouts: ['sm-shell'] },
        { path: '/b', tag: 'sm-b', layouts: ['sm-shell'] },
    ],
    pageModules: {},
};

import { serverRoute } from '../src/server';
import { installRouteAdoption } from '../src/hydrate';
import '../src/outlet';

installRouteAdoption();

let outlet: HTMLElement;
let writtenShell: Element;

beforeAll(async () => {
    await serverRoute('/a');
    const markup = renderToString(() => html`<pdx-router-outlet></pdx-router-outlet>`);
    history.replaceState(null, '', '/b');
    const box = document.createElement('div');
    box.innerHTML = markup;
    writtenShell = box.querySelector('sm-shell')!;
    document.body.appendChild(box);
    outlet = box.querySelector('pdx-router-outlet')!;
    await new Promise((r) => setTimeout(r, 0));
});

describe('a generated page for another route', () => {
    it('loses what the server wrote, and shows the route it resolved', () => {
        expect(writtenShell, 'the server wrote no shell').not.toBeNull();
        expect(outlet.querySelector('sm-a'), 'the other route\'s page stayed').toBeNull();
        expect(outlet.querySelectorAll('sm-shell'), 'two shells: the server\'s was left beside the new one').toHaveLength(1);
        expect(outlet.querySelector('sm-shell')).not.toBe(writtenShell);
        expect(outlet.querySelector('sm-shell sm-b')).not.toBeNull();
        expect(outlet.hasAttribute('data-pdx-ssg')).toBe(false);
    });
});
