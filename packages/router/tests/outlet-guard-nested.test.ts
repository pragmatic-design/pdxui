// A guard that denies a CHILD route refuses the child, not the page it lives in.
//
// `runtime.ts` walks the chain outermost first. Clearing the whole route on the first denial is
// right at the TOP of the chain — there is nothing left to show — and too much below it: the levels
// that were allowed are still allowed. Clearing it would mean that clicking a Billing tab the role
// cannot see takes the ticket's header, its tabs and its attachments panel down with it, leaving a
// 403 whose only way back is the browser's Back button.
//
// So the refusal renders in the outlet of the level that was denied, and the allowed prefix stays
// on screen. There is no per-route `@guard 'x' { fallback: … }`: it would be public syntax for a
// choice that has one right answer.
//
// One route table per file: `__pdx_routes` is read once, at the outlet's first connect.

import { describe, it, expect, beforeAll } from 'vitest';

const mounts: Record<string, number> = {};

/** A page that holds a child outlet — the parent of a nested pair. */
function defineParent(tag: string): void {
    mounts[tag] = 0;
    customElements.define(tag, class extends HTMLElement {
        /** Read by the "same node" assertion: it survives only if the element itself survives. */
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

defineParent('pdx-g-ticket');
definePage('pdx-g-billing');
definePage('pdx-g-notes');
definePage('pdx-g-home');
definePage('pdx-g-admin');

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-g-home' },
    { path: '/t/:id', tag: 'pdx-g-ticket', hasOutlet: true },
    // The denied child: a permission the role does not have, on a tab of a page it may see.
    { path: '/t/:id/billing', tag: 'pdx-g-billing', guard: 'billing' },
    { path: '/t/:id/notes', tag: 'pdx-g-notes' },
    // The control: a guard at the TOP of the chain, where taking the whole page down is right.
    { path: '/admin', tag: 'pdx-g-admin', guard: 'admin' },
];

import { navigate, registerGuardChecker } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

const ticket = () => document.querySelector('pdx-g-ticket') as (HTMLElement & { stamp: number }) | null;
const childOutlet = () => ticket()?.querySelector('pdx-router-outlet') ?? null;
/** The router's own error page: a div[role=alert] whose h1 is the code. */
const errorPage = (root: ParentNode | null) =>
    root?.querySelector('[role="alert"]') as HTMLElement | null;
const errorCode = (root: ParentNode | null) => errorPage(root)?.querySelector('h1')?.textContent ?? null;

beforeAll(async () => {
    // Everything is allowed except `billing` and `admin`.
    registerGuardChecker((permission: string) => permission !== 'billing' && permission !== 'admin');
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

describe('a guard on a child route', () => {
    it('the control: the same pair renders normally when the guard allows it', async () => {
        navigate('/t/7/notes');
        await tick();
        expect(ticket(), 'the parent did not render').not.toBeNull();
        expect(document.querySelector('pdx-g-notes'), 'the allowed child did not render').not.toBeNull();
        expect(errorPage(document.body), 'an error page rendered for an allowed route').toBeNull();
    });

    it('leaves the parent on screen, as the same element', async () => {
        const before = ticket()!;
        const stamp = before.stamp;

        navigate('/t/7/billing');
        await tick();

        expect(ticket(), 'the parent went down with the denied child').not.toBeNull();
        expect(ticket(), 'the parent was rebuilt rather than kept').toBe(before);
        expect(ticket()!.stamp, 'the parent remounted').toBe(stamp);
    });

    it('renders the refusal in the outlet the denied child would have used', async () => {
        expect(document.querySelector('pdx-g-billing'), 'the denied page rendered anyway').toBeNull();
        expect(errorCode(childOutlet()), 'the 403 is not in the parent’s outlet').toBe('403');
        // And nowhere else: an error page at the root would be the whole-page behaviour again,
        // hidden behind a second one that happens to be in the right place.
        expect(document.body.querySelectorAll('[role="alert"]').length,
            'the refusal rendered in more than one place').toBe(1);
    });

    it('recovers: an allowed sibling renders again, in the same parent', async () => {
        const before = ticket()!;
        navigate('/t/7/notes');
        await tick();

        expect(document.querySelector('pdx-g-notes'), 'the sibling did not render after a refusal').not.toBeNull();
        expect(errorPage(document.body), 'the error page outlived the refusal').toBeNull();
        expect(ticket(), 'the parent was rebuilt on the way back').toBe(before);
    });

    it('the control: a guard at the TOP of the chain still takes the whole page', async () => {
        // The other half of the decision. Without this, "render it in the parent's outlet" could be
        // satisfied by never showing a full-page 403 again — and a denial with no allowed prefix
        // has nothing to render into.
        navigate('/admin');
        await tick();

        expect(document.querySelector('pdx-g-admin'), 'the denied page rendered').toBeNull();
        expect(ticket(), 'an unrelated page survived a top-level denial').toBeNull();
        expect(errorCode(document.body), 'a top-level denial did not render its 403').toBe('403');
    });
});
