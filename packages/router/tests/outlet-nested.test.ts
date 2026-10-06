// Nested routes: a child rendering into its parent's outlet, the parent staying put.
//
// Without nesting, master-detail — a list that stays and a detail that changes, both in the URL —
// has to be one flat route with the split done by hand. That loses the child's own @guard, @loader,
// keepAlive and transition, because those are per route and there is only one route.
//
// Named outlets are not this: `@outlet 'sidebar'` fills a PARALLEL region at the same URL
// (`_handleNamedOutletChange`).
//
// The shape: a route is a PARENT when its path is a segment prefix of the matched one AND its page
// renders a child outlet. Both halves are needed, and the second one is not a detail — inferring a
// parent from the prefix alone is wrong, because `/owners` is a prefix of `/owners/new` and they
// are siblings. The compiler sets `hasOutlet` from the template, so the
// declaration is the thing the feature already asks you to write: a <pdx-router-outlet> in the
// parent. Each outlet then renders the level of the chain at its own nesting depth.
//
// One route table per file: `__pdx_routes` is read once, at the outlet's first connect.

import { describe, it, expect, beforeAll } from 'vitest';

/** Every page counts its own mounts: "the parent did not remount" is a number, not a feeling. */
const mounts: Record<string, number> = {};

/** A page that holds a child outlet — the parent of a nested pair. */
function defineParent(tag: string): void {
    mounts[tag] = 0;
    customElements.define(tag, class extends HTMLElement {
        /** State the remount test reads: it survives only if the element itself survives. */
        stamp = 0;
        connectedCallback() {
            mounts[tag]++;
            this.stamp = mounts[tag];
            if (!this.querySelector('pdx-router-outlet')) {
                this.appendChild(document.createElement('pdx-router-outlet'));
            }
        }
    });
}

function definePage(tag: string): void {
    mounts[tag] = 0;
    customElements.define(tag, class extends HTMLElement {
        connectedCallback() { mounts[tag]++; }
    });
}

defineParent('pdx-n-ticket');
definePage('pdx-n-intervention');
definePage('pdx-n-notes');
definePage('pdx-n-home');
definePage('pdx-n-other');

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-n-home' },
    // `hasOutlet` is what makes this a PARENT rather than a route that merely shares a prefix. The
    // compiler sets it from the template (a <pdx-router-outlet> in it); here it is written by hand
    // because the test registers its routes by hand.
    { path: '/tickets/:id', tag: 'pdx-n-ticket', hasOutlet: true },
    { path: '/tickets/:id/interventions/:n', tag: 'pdx-n-intervention' },
    { path: '/tickets/:id/notes', tag: 'pdx-n-notes' },
    { path: '/other', tag: 'pdx-n-other' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
let outlet: HTMLElement;

const ticket = () => document.querySelector('pdx-n-ticket') as (HTMLElement & { stamp: number }) | null;
const childOutlet = () => ticket()?.querySelector('pdx-router-outlet') ?? null;

beforeAll(async () => {
    history.replaceState(null, '', '/');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
});

describe('a child route renders inside its parent', () => {
    it('the flat routes still behave as they did', async () => {
        expect(document.querySelector('pdx-n-home'), 'the root route did not render').not.toBeNull();
        navigate('/other');
        await tick();
        expect(document.querySelector('pdx-n-other')).not.toBeNull();
        expect(document.querySelector('pdx-n-home'), 'the previous page was left behind').toBeNull();
    });

    it('a parent route on its own renders the parent, and nothing in its outlet', async () => {
        navigate('/tickets/7');
        await tick();

        expect(ticket(), 'the parent page did not render').not.toBeNull();
        expect(childOutlet(), 'the parent did not get its outlet').not.toBeNull();
        expect(childOutlet()!.children.length, 'something rendered into the outlet of a bare parent').toBe(0);
    });

    it('a child route renders the parent, with the child inside the parent’s outlet', async () => {
        navigate('/tickets/7/interventions/2');
        await tick();

        const child = document.querySelector('pdx-n-intervention');
        expect(child, 'the child page did not render at all').not.toBeNull();
        expect(ticket(), 'the child replaced its parent instead of nesting inside it').not.toBeNull();
        expect(child!.closest('pdx-n-ticket'), 'the child rendered outside its parent').not.toBeNull();
        expect(child!.parentElement, 'the child did not go into the parent’s outlet').toBe(childOutlet());
    });

    it('both levels of params reach the page', async () => {
        const child = document.querySelector('pdx-n-intervention')!;
        expect(child.getAttribute('id'), 'the parent’s param is missing from the child').toBe('7');
        expect(child.getAttribute('n'), 'the child’s own param is missing').toBe('2');
        expect(ticket()!.getAttribute('id'), 'the parent did not get its own param').toBe('7');
    });
});

describe('moving between children leaves the parent alone', () => {
    it('the parent element is the SAME node, with its state intact', async () => {
        navigate('/tickets/7/interventions/2');
        await tick();
        const before = ticket()!;
        const stampBefore = before.stamp;
        const mountsBefore = mounts['pdx-n-ticket'];

        navigate('/tickets/7/interventions/3');
        await tick();

        expect(ticket(), 'the parent was replaced by another element').toBe(before);
        expect(ticket()!.stamp, 'the parent’s own state was rebuilt').toBe(stampBefore);
        expect(mounts['pdx-n-ticket'], 'the parent remounted for a child change').toBe(mountsBefore);
        expect(document.querySelector('pdx-n-intervention')!.getAttribute('n'),
            'the child did not follow the new param').toBe('3');
    });

    it('a different child under the same parent swaps only the child', async () => {
        const before = ticket()!;
        const mountsBefore = mounts['pdx-n-ticket'];

        navigate('/tickets/7/notes');
        await tick();

        expect(ticket(), 'the parent was replaced when only the child changed').toBe(before);
        expect(mounts['pdx-n-ticket']).toBe(mountsBefore);
        expect(document.querySelector('pdx-n-notes'), 'the second child did not render').not.toBeNull();
        expect(document.querySelector('pdx-n-intervention'), 'the first child was left behind').toBeNull();
    });

    // A different `:id` is the SAME route with different params, one level up — and the router's
    // rule for that has always been "keep the element, tell it the params changed". Nesting does not
    // get its own rule: `/tickets/7/notes` → `/tickets/9/notes` keeps the ticket shell and re-reads
    // its param, which is also what a master-detail wants.
    it('a different :id keeps the parent and changes its params', async () => {
        const before = ticket()!;
        const mountsBefore = mounts['pdx-n-ticket'];
        navigate('/tickets/9/notes');
        await tick();

        expect(ticket(), 'a param change remounted the parent').toBe(before);
        expect(mounts['pdx-n-ticket']).toBe(mountsBefore);
        expect(ticket()!.getAttribute('id'), 'the parent kept the id it mounted with').toBe('9');
    });

    it('leaving the nest for a flat route takes the whole thing down', async () => {
        navigate('/other');
        await tick();

        expect(document.querySelector('pdx-n-ticket'), 'the parent outlived the navigation').toBeNull();
        expect(document.querySelector('pdx-n-notes'), 'the child outlived the navigation').toBeNull();
        expect(document.querySelector('pdx-n-other')).not.toBeNull();
    });

    it('and coming back rebuilds both levels', async () => {
        navigate('/tickets/1/interventions/5');
        await tick();

        expect(ticket(), 'the parent did not come back').not.toBeNull();
        const child = document.querySelector('pdx-n-intervention');
        expect(child, 'the child did not come back').not.toBeNull();
        expect(child!.closest('pdx-n-ticket'), 'the child came back outside its parent').not.toBeNull();
    });

    it('and going up to the bare parent empties its outlet', async () => {
        const before = ticket()!;
        navigate('/tickets/1');
        await tick();

        expect(ticket(), 'going up to the parent remounted it').toBe(before);
        expect(childOutlet()!.children.length, 'the child stayed after navigating up to the parent').toBe(0);
    });
});
