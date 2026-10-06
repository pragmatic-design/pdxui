// The breadcrumb's trail, derived from the matched chain.
//
// A page that restates by hand a path the router already holds has a copy that goes stale the day a
// route is renamed — silently, because nothing connects the two. The router has the chain (`ResolvedRoute.chain`, outermost first), so the trail is not something to assemble:
// it is something to READ.
//
// Two things the chain does not give and this has to add:
//
//   1. **a name**. `/tickets/:id` is not a crumb a reader can use; "Ticket 42" is. The label is
//      declared on the route — `@page '/tickets' { label: 'Tickets' }` — and may be a function of
//      the resolved params, because the useful crumb is the record's own name;
//   2. **a usable href**. The chain holds patterns; a crumb has to be clickable, so `:id` is
//      filled in from the params of the route actually matched.
//
// The registry it writes into lives in core (`setRouteTrail`), because `@pdxui/ui` must not
// depend on the router — see `packages/core/tests/route-trail.test.ts`.

import { describe, it, expect, beforeAll } from 'vitest';

function definePage(tag: string, withOutlet = false): void {
    customElements.define(tag, class extends HTMLElement {
        connectedCallback() {
            if (withOutlet && !this.querySelector('pdx-router-outlet')) {
                this.appendChild(document.createElement('pdx-router-outlet'));
            }
        }
    });
}

definePage('pdx-t-home');
definePage('pdx-t-tickets', true);
definePage('pdx-t-ticket', true);
definePage('pdx-t-intervention');
definePage('pdx-t-unlabelled');
definePage('pdx-t-plain-parent');
definePage('pdx-t-plain-child');
definePage('pdx-t-thing');

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-t-home', label: 'Home' },
    { path: '/tickets', tag: 'pdx-t-tickets', hasOutlet: true, label: 'Tickets' },
    // The label that needs the params: a crumb reading "42" helps nobody.
    { path: '/tickets/:id', tag: 'pdx-t-ticket', hasOutlet: true, label: (p: Record<string, string>) => `Ticket ${p.id}` },
    { path: '/tickets/:id/interventions/:n', tag: 'pdx-t-intervention', label: (p: Record<string, string>) => `Intervention ${p.n}` },
    // No label at all: it must not invent one from the URL.
    { path: '/plain', tag: 'pdx-t-unlabelled' },
    // A parent that renders NO child outlet: not part of the render chain, still part of the trail.
    { path: '/plain-parent', tag: 'pdx-t-plain-parent', label: 'Parent' },
    { path: '/plain-parent/child', tag: 'pdx-t-plain-child', label: 'Child' },
    // The declarative form of a label that needs the record: a template, not a function.
    { path: '/things/:id', tag: 'pdx-t-thing', label: 'Thing :id' },
    // A dictionary key, on a parent that renders no outlet — the ancestor a deep link
    // never loads — and on its child, with a param the dictionary fills.
    { path: '/keyed', tag: 'pdx-t-keyed', labelKey: 'trail.keyed' },
    { path: '/keyed/:n', tag: 'pdx-t-keyed-child', labelKey: 'trail.child' },
];
definePage('pdx-t-keyed');
definePage('pdx-t-keyed-child');

import { navigate } from '../src/runtime';
import { routeTrail, loadTranslations, setLocale, initI18n } from '@pdxui/core';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

describe('the trail the router publishes', () => {
    it('is the whole chain, outermost first', async () => {
        navigate('/tickets/42/interventions/7');
        await tick();

        expect(routeTrail().map(c => c.label)).toEqual(['Tickets', 'Ticket 42', 'Intervention 7']);
    });

    it('fills the params into each href, so every crumb is a place you can go', async () => {
        navigate('/tickets/42/interventions/7');
        await tick();

        expect(routeTrail().map(c => c.href)).toEqual([
            '/tickets', '/tickets/42', '/tickets/42/interventions/7',
        ]);
    });

    it('marks the leaf, and only the leaf', async () => {
        navigate('/tickets/42/interventions/7');
        await tick();

        expect(routeTrail().map(c => c.current)).toEqual([false, false, true]);
    });

    it('follows the navigation: one level up is one crumb fewer', async () => {
        navigate('/tickets/42/interventions/7');
        await tick();
        expect(routeTrail()).toHaveLength(3);

        navigate('/tickets/42');
        await tick();

        expect(routeTrail().map(c => c.label)).toEqual(['Tickets', 'Ticket 42']);
        expect(routeTrail()[1].current).toBe(true);
    });

    it('a flat route is a trail of one', async () => {
        navigate('/');
        await tick();

        expect(routeTrail().map(c => c.label)).toEqual(['Home']);
    });

    it('includes an ancestor that does NOT nest, because a breadcrumb is navigation and not rendering', async () => {
        // `/plain-parent` renders no child outlet, so it is not in the RENDER chain — correctly:
        // `hasOutlet` is what stops `/owners` from being treated as the parent of `/owners/new`.
        // But a reader who went through it is still one click from it, and a trail that skipped it
        // would jump from the root to the leaf. The label is what makes a route a step: a route
        // without one contributes nothing, so nothing spurious can appear here.
        navigate('/plain-parent/child');
        await tick();

        expect(routeTrail().map(c => c.label)).toEqual(['Parent', 'Child']);
        expect(routeTrail().map(c => c.href)).toEqual(['/plain-parent', '/plain-parent/child']);
    });

    it('fills the params into a declared label, so a directive can say "Ticket :id"', async () => {
        // The declaration is a string — `@page '/x/:id' { label: 'Thing :id' }` — because a
        // function in a directive would be source for the compiler to evaluate rather than a value
        // to carry. A template covers the case the issue names ("Ticket 42" is the useful crumb,
        // "42" is not) with the substitution the href already does.
        navigate('/things/9');
        await tick();

        expect(routeTrail().map(c => c.label)).toEqual(['Thing 9']);
    });

    it('a dictionary key is translated, with the route\'s params, and follows the language',async () => {
        // `setLocale` resolves against the declared locales: without them 'it' falls back to 'en'.
        initI18n({ locales: ['en', 'it'], default: 'en' });
        loadTranslations('en', { trail: { keyed: 'Customers', child: 'Customer {n}' } });
        loadTranslations('it', { trail: { keyed: 'Clienti', child: 'Cliente {n}' } });
        setLocale('en');
        navigate('/keyed/3');
        await tick();
        expect(routeTrail().map(c => c.label), 'the key was not translated').toEqual(['Customers', 'Customer 3']);

        // No navigation: the language changes under a trail already drawn.
        setLocale('it');
        await tick();
        expect(routeTrail().map(c => c.label), 'the trail kept the language it was drawn in')
            .toEqual(['Clienti', 'Cliente 3']);
        setLocale('en');
    });

    it('a route with no label contributes no crumb, rather than a URL segment', async () => {
        // The control for "derive it from the path": a breadcrumb showing `plain` would be a
        // breadcrumb showing the URL, which is what a reader already has in the address bar.
        navigate('/plain');
        await tick();

        expect(routeTrail()).toEqual([]);
    });
});
