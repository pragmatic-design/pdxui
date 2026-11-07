// A generated page whose route is lazy (#160, part 5a): at boot its module has not arrived, so its
// element is not yet the page's class. The outlet keeps it as the server wrote it — no «Loading...»
// in its place — and loads the module, and the element upgrades where it stands.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { html } from '@pdxui/core';
import { renderToString } from '@pdxui/core/server';

class LazyPage extends HTMLElement {}
const load = vi.fn(async () => {
    if (!customElements.get('sl-page')) customElements.define('sl-page', LazyPage);
});

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [{ path: '/lazy', tag: 'sl-page', lazy: true }],
    pageModules: { '/lazy': load },
};

import { serverRoute } from '../src/server';
import { installRouteAdoption } from '../src/hydrate';
import '../src/outlet';

installRouteAdoption();

let outlet: HTMLElement;
let written: Element;

beforeAll(async () => {
    serverRoute('/lazy');
    const markup = renderToString(() => html`<pdx-router-outlet></pdx-router-outlet>`);
    history.replaceState(null, '', '/lazy');
    const box = document.createElement('div');
    box.innerHTML = markup;
    written = box.querySelector('sl-page')!;
    document.body.appendChild(box);
    outlet = box.querySelector('pdx-router-outlet')!;
    await vi.waitFor(() => expect(customElements.get('sl-page')).toBeDefined());
});

describe('a lazy page the server wrote', () => {
    it('stays in place, with no placeholder standing in for it', () => {
        expect(written, 'the server wrote no page').not.toBeNull();
        expect(outlet.querySelector('.pdx-route-loading')).toBeNull();
        expect(outlet.querySelectorAll('sl-page')).toHaveLength(1);
        expect(outlet.querySelector('sl-page')).toBe(written);
    });

    it('has its module loaded, and becomes the page where it stands', () => {
        expect(load).toHaveBeenCalledTimes(1);
        expect(written).toBeInstanceOf(LazyPage);
    });
});
