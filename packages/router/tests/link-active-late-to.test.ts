// A link that learns where it points AFTER it is connected still knows it is the active one.
//
// `<pdx-link active-class="here">` computes its active state in an effect on `currentPath()`. A
// template binding writes `to` after the element is connected — that is the ordinary case, not an
// edge one — and on a DEEP LINK the path never changes afterwards, so the effect never re-runs.
// Left to the effect alone, the class is never applied and nothing is marked active on the page a
// visitor arrived at: the attribute right, the path right, the class absent. So
// `attributeChangedCallback` applies the active state as well as the `href` — the effect re-reads
// it only while the path is still moving.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate } from '../src/runtime';
import '../src/link';

const settle = () => new Promise((r) => setTimeout(r, 20));

const ROUTES = [
    { path: '/', component: () => document.createElement('div') },
    { path: '/tickets/1/interventions/2', component: () => document.createElement('div') },
];

describe('a link told where it points after it is connected', () => {
    beforeEach(async () => {
        document.body.innerHTML = '';
        history.replaceState(null, '', '/');
        createRouter(ROUTES, {});
    });

    it('lights up when the path already matches', async () => {
        navigate('/tickets/1/interventions/2');
        await settle();

        // Connected first, `to` after — which is what a `:to` binding does.
        const link = document.createElement('pdx-link');
        link.setAttribute('active-class', 'here');
        document.body.appendChild(link);
        link.setAttribute('to', '/tickets/1/interventions/2');
        await settle();

        expect(link.classList.contains('here'),
            'the link a visitor arrived at is not marked active').toBe(true);
    });

    it('and stops when it is told to point somewhere else', async () => {
        navigate('/tickets/1/interventions/2');
        await settle();

        const link = document.createElement('pdx-link');
        link.setAttribute('active-class', 'here');
        link.setAttribute('to', '/tickets/1/interventions/2');
        document.body.appendChild(link);
        await settle();
        expect(link.classList.contains('here')).toBe(true);

        // Not `/`: without `exact` a link to the root is a prefix of every path and is active
        // everywhere, which is the documented boundary rule and not what this row is about.
        link.setAttribute('to', '/somewhere-else');
        await settle();
        expect(link.classList.contains('here'),
            'the link kept the active class of a destination it no longer has').toBe(false);
    });

    it('control — a link that points elsewhere is not active', async () => {
        navigate('/tickets/1/interventions/2');
        await settle();

        const link = document.createElement('pdx-link');
        link.setAttribute('active-class', 'here');
        document.body.appendChild(link);
        link.setAttribute('to', '/');
        await settle();

        // `exact` is off, and `/` is a prefix of everything — which is its own trap, so the
        // control uses a path that is not one.
        link.setAttribute('to', '/somewhere-else');
        await settle();
        expect(link.classList.contains('here'),
            'every link is active, so the assertion above says nothing').toBe(false);
    });

    it('control — the class still follows a navigation, which is the case that already worked', async () => {
        const link = document.createElement('pdx-link');
        link.setAttribute('active-class', 'here');
        link.setAttribute('to', '/tickets/1/interventions/2');
        document.body.appendChild(link);
        await settle();
        expect(link.classList.contains('here')).toBe(false);

        navigate('/tickets/1/interventions/2');
        await settle();
        expect(link.classList.contains('here'), 'the effect on currentPath() was lost').toBe(true);
    });
});

describe('a link told to be EXACT by a property', () => {
    beforeEach(async () => {
        document.body.innerHTML = '';
        history.replaceState(null, '', '/');
        createRouter(ROUTES, {});
    });

    it('does not light up on every path, the way a prefix match would', async () => {
        // `<pdx-link :to="'/'" :exact="true">` — a template binding writes the PROPERTY, and the
        // element read `hasAttribute('exact')`. So the app's dashboard entry, a link to `/`, was
        // active on every screen: `/` is a prefix of everything. Seen in a browser, on the
        // showcase's rail, with `Cruscotto` highlighted on `/board`.
        const link = document.createElement('pdx-link') as HTMLElement & { to: string; exact: boolean };
        link.setAttribute('active-class', 'here');
        link.to = '/';
        link.exact = true;
        document.body.appendChild(link);
        await settle();

        navigate('/tickets/1/interventions/2');
        await settle();

        expect(link.classList.contains('here'),
            'an exact link to the root is active on a path that merely starts with it').toBe(false);
    });

    it('control — and it IS active on the path it names', async () => {
        const link = document.createElement('pdx-link') as HTMLElement & { to: string; exact: boolean };
        link.setAttribute('active-class', 'here');
        link.to = '/';
        link.exact = true;
        document.body.appendChild(link);
        await settle();

        expect(link.classList.contains('here'), 'exact stopped it matching its own path').toBe(true);
    });

    it('control — without exact, a prefix still matches, which is the documented rule', async () => {
        const link = document.createElement('pdx-link') as HTMLElement & { to: string };
        link.setAttribute('active-class', 'here');
        link.to = '/';
        document.body.appendChild(link);
        await settle();

        navigate('/tickets/1/interventions/2');
        await settle();
        expect(link.classList.contains('here')).toBe(true);
    });
});
