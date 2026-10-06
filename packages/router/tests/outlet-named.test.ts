// Named outlets (parallel routes).
//
// A named outlet renders whatever the current route assigns to its name, and clears when the
// route assigns nothing. Its bookkeeping is per-instance (`_namedElement`) because several
// outlets are on screen at once — unlike the main outlet, which owns the single module-level
// `activeElement`.

import { describe, it, expect, beforeAll } from 'vitest';

for (const tag of ['pdx-no-page-a', 'pdx-no-page-b', 'pdx-no-page-c',
                   'pdx-no-side-x', 'pdx-no-side-y', 'pdx-no-aside']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-no-page-a', outlets: [{ name: 'side', tag: 'pdx-no-side-x' }] },
    { path: '/b', tag: 'pdx-no-page-b', outlets: [{ name: 'side', tag: 'pdx-no-side-y' },
                                                  { name: 'aside', tag: 'pdx-no-aside' }] },
    { path: '/c', tag: 'pdx-no-page-c' },
    { path: '/d', tag: 'pdx-no-page-a', outlets: [{ name: 'side', tag: 'pdx-no-side-y' }] },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
let main: HTMLElement;
let side: HTMLElement;
let aside: HTMLElement;

beforeAll(async () => {
    history.replaceState(null, '', '/');
    main = document.createElement('pdx-router-outlet');
    side = document.createElement('pdx-router-outlet');
    side.setAttribute('name', 'side');
    aside = document.createElement('pdx-router-outlet');
    aside.setAttribute('name', 'aside');
    document.body.append(main, side, aside);
    await tick();
});

describe('named outlets', () => {
    it('renders the component the route assigns to its name', () => {
        expect(side.querySelector('pdx-no-side-x'), 'the named outlet stayed empty').not.toBeNull();
        expect(main.querySelector('pdx-no-page-a'), 'the main outlet lost its page').not.toBeNull();
    });

    it('an outlet the route says nothing about stays empty', () => {
        expect(aside.children, 'an unassigned outlet rendered something').toHaveLength(0);
    });

    it('swaps its content when the assignment changes', async () => {
        navigate('/b');
        await tick();

        expect(side.querySelector('pdx-no-side-y')).not.toBeNull();
        expect(side.querySelector('pdx-no-side-x'), 'the previous assignment stayed on screen')
            .toBeNull();
        expect(side.children, 'the outlet accumulated one child per navigation').toHaveLength(1);
    });

    it('fills a second named outlet from the same route', () => {
        expect(aside.querySelector('pdx-no-aside')).not.toBeNull();
    });

    it('clears when the new route assigns nothing to it', async () => {
        navigate('/c');
        await tick();

        expect(side.children, 'the outlet kept the previous route content').toHaveLength(0);
        expect(aside.children).toHaveLength(0);
        expect(main.querySelector('pdx-no-page-c')).not.toBeNull();
    });

    it('fills again on the next route that assigns it', async () => {
        navigate('/d');
        await tick();
        expect(side.querySelector('pdx-no-side-y')).not.toBeNull();
        expect(side.children).toHaveLength(1);
    });

    it('does not rebuild when the next route assigns the same component', async () => {
        const before = side.firstElementChild;

        navigate('/b');
        await tick();

        expect(side.children).toHaveLength(1);
        expect(side.firstElementChild,
            'the same component was torn down and rebuilt across a navigation').toBe(before);
    });
});
