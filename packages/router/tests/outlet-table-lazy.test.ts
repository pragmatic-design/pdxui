// A lazy page of the route table loads through the table's `pageModules`, with no `file` on the route.
//
// The table used to carry `file` beside the literal `import()`, and the outlet took the lazy branch
// only when `file` was there. In a build that string was the page's ABSOLUTE path on the machine that
// built it, shipped in every bundle, for an import the literal one already does.

import { describe, it, expect, beforeAll, vi } from 'vitest';

customElements.define('pdx-tl-home', class extends HTMLElement {});

const load = vi.fn(async () => {
    if (!customElements.get('pdx-tl-page')) customElements.define('pdx-tl-page', class extends HTMLElement {});
});

(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [
        { path: '/', tag: 'pdx-tl-home' },
        { path: '/lazy', tag: 'pdx-tl-page', lazy: true },
    ],
    pageModules: { '/lazy': load },
};

import { navigate } from '../src/runtime';
import '../src/outlet';

describe('a lazy route of the table, without a file', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await new Promise((r) => setTimeout(r, 0));
        navigate('/lazy');
        await vi.waitFor(() => {
            expect(document.querySelector('pdx-router-outlet pdx-tl-page')).not.toBeNull();
        });
    });

    it('is loaded through its page module', () => {
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('is mounted once the module has registered it', () => {
        const page = document.querySelector('pdx-router-outlet pdx-tl-page');
        expect(page, 'the page element').not.toBeNull();
        expect(document.querySelector('pdx-router-outlet .pdx-route-loading'), 'the placeholder stayed').toBeNull();
    });
});
