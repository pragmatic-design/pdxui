// The layout stack.
//
// A layout chain is diffed, not rebuilt: navigating between two pages under the same shell must
// KEEP that shell mounted, or every navigation destroys and recreates the sidebar, the header and
// whatever state they hold. That reuse is the whole point of `_diffLayouts`.
//
// One route table per file: `__pdx_routes` is read once, at the outlet's first connect.

import { describe, it, expect, beforeAll } from 'vitest';

/** Layouts render a <slot> the page goes into; each counts its own mounts. */
const mounts: Record<string, number> = {};

function defineLayout(tag: string): void {
    mounts[tag] = 0;
    class Layout extends HTMLElement {
        connectedCallback() {
            mounts[tag]++;
            if (!this.querySelector('slot')) this.appendChild(document.createElement('slot'));
        }
    }
    customElements.define(tag, Layout);
}

defineLayout('pdx-l-root');
defineLayout('pdx-l-admin');
defineLayout('pdx-l-settings');

for (const tag of ['pdx-lp-home', 'pdx-lp-users', 'pdx-lp-roles', 'pdx-lp-prefs', 'pdx-lp-bare']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-lp-home', layouts: ['pdx-l-root'] },
    { path: '/admin/users', tag: 'pdx-lp-users', layouts: ['pdx-l-root', 'pdx-l-admin'] },
    { path: '/admin/roles', tag: 'pdx-lp-roles', layouts: ['pdx-l-root', 'pdx-l-admin'] },
    { path: '/settings', tag: 'pdx-lp-prefs', layouts: ['pdx-l-root', 'pdx-l-settings'] },
    { path: '/bare', tag: 'pdx-lp-bare' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
let outlet: HTMLElement;

beforeAll(async () => {
    history.replaceState(null, '', '/');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
});

describe('the layout chain', () => {
    it('mounts the layouts of the first route, outermost first', async () => {
        expect(outlet.querySelector('pdx-l-root'), 'the route declared a layout and got none')
            .not.toBeNull();
        expect(mounts['pdx-l-root']).toBe(1);
    });

    it('renders the page inside the innermost layout slot, not beside it', async () => {
        navigate('/admin/users');
        await tick();

        const page = document.querySelector('pdx-lp-users')!;
        expect(page, 'the page did not render').not.toBeNull();
        expect(page.closest('pdx-l-admin'), 'the page rendered outside its own layout')
            .not.toBeNull();
        // In the slot, through the outlet's page host: the host is what stays put when a
        // `.pdx` layout projects its slot away.
        expect(page.parentElement!.hasAttribute('data-pdx-layout-host'), 'the page is not in the layout\'s host').toBe(true);
        expect(page.closest('slot'), 'the page is beside the slot, not in it').not.toBeNull();
    });

    it('nests the child layout inside the parent one', () => {
        const admin = document.querySelector('pdx-l-admin')!;
        expect(admin.closest('pdx-l-root'), 'the chain was flattened').not.toBeNull();
    });

    it('reuses the shared prefix when only the leaf differs', async () => {
        const rootMounts = mounts['pdx-l-root'];
        const adminMounts = mounts['pdx-l-admin'];

        navigate('/admin/roles');
        await tick();

        expect(mounts['pdx-l-root'], 'the shell was rebuilt for a sibling page').toBe(rootMounts);
        expect(mounts['pdx-l-admin'], 'the section layout was rebuilt for a sibling page')
            .toBe(adminMounts);
        expect(document.querySelector('pdx-lp-roles')).not.toBeNull();
    });

    it('swaps only the divergent leaf when the chains fork', async () => {
        const rootMounts = mounts['pdx-l-root'];

        navigate('/settings');
        await tick();

        expect(document.querySelector('pdx-l-admin'), 'the old section layout stayed mounted')
            .toBeNull();
        expect(document.querySelector('pdx-l-settings')).not.toBeNull();
        expect(mounts['pdx-l-root'], 'the shared root was torn down and rebuilt').toBe(rootMounts);
    });

    it('tears the whole stack down for a route that declares none', async () => {
        navigate('/bare');
        await tick();

        expect(document.querySelector('pdx-l-root'), 'a layout survived a route without one')
            .toBeNull();
        expect(document.querySelector('pdx-lp-bare')!.parentElement,
            'the page did not fall back to the outlet itself').toBe(outlet);
    });

    it('builds the stack again on the way back', async () => {
        navigate('/admin/users');
        await tick();

        expect(document.querySelector('pdx-l-root')).not.toBeNull();
        expect(document.querySelector('pdx-l-admin')).not.toBeNull();
        expect(document.querySelector('pdx-lp-users')!.closest('pdx-l-admin')).not.toBeNull();
    });

    it('leaves no orphan page from the previous route', () => {
        expect(document.querySelectorAll('pdx-lp-roles')).toHaveLength(0);
        expect(document.querySelectorAll('pdx-lp-prefs')).toHaveLength(0);
        expect(document.querySelectorAll('pdx-lp-users'), 'the page was mounted twice')
            .toHaveLength(1);
    });
});
