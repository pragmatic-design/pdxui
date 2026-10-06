// Keep-alive resume, param changes on the same route, and swipe-back.
//
// Three behaviours that all hinge on NOT rebuilding: a frozen page comes back as the same
// element, a route whose params changed keeps its component and is told about the change, and a
// swipe is history navigation rather than a fresh mount.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { routeParams } from '../src/outlet';

let keptMounts = 0;
let keptTeardowns = 0;

class KeptPage extends HTMLElement {
    connectedCallback() { keptMounts++; }
    disconnectedCallback() { if (!this._keepAlive) keptTeardowns++; }
}
customElements.define('pdx-kp-kept', KeptPage);

const paramEvents: Record<string, string>[] = [];
class UserPage extends HTMLElement {
    constructor() {
        super();
        this.addEventListener('pdx-route-change', (e) => {
            paramEvents.push((e as CustomEvent).detail as Record<string, string>);
        });
    }
}
customElements.define('pdx-kp-user', UserPage);
customElements.define('pdx-kp-home', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-kp-home' },
    { path: '/kept', tag: 'pdx-kp-kept', keepAlive: true },
    { path: '/users/:id', tag: 'pdx-kp-user' },
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

describe('keep-alive freeze and resume', () => {
    it('freezes the page instead of destroying it on the way out', async () => {
        navigate('/kept');
        await tick();
        const first = document.querySelector('pdx-kp-kept')!;
        expect(first).not.toBeNull();
        expect(keptMounts).toBe(1);

        navigate('/');
        await tick();

        expect(document.querySelector('pdx-kp-kept'), 'the frozen page was left in the DOM')
            .toBeNull();
        expect(keptTeardowns, 'a keep-alive page was destroyed rather than frozen').toBe(0);
    });

    it('brings the same element back, not a new one', async () => {
        navigate('/kept');
        await tick();

        const second = document.querySelector('pdx-kp-kept')!;
        expect(second).not.toBeNull();
        expect(keptMounts, 'the frozen page was rebuilt on resume').toBe(2);
        expect(keptTeardowns).toBe(0);
    });

    it('a plain page is destroyed on the way out — the control', async () => {
        navigate('/');
        await tick();
        navigate('/users/7');
        await tick();

        expect(document.querySelector('pdx-kp-home'),
            'a page with no keepAlive stayed in the DOM').toBeNull();
    });
});

describe('a param change on the same route', () => {
    it('mounts the page with the param as an attribute', () => {
        const page = document.querySelector('pdx-kp-user')!;
        expect(page.getAttribute('id'), 'the route param never reached the page').toBe('7');
    });

    it('keeps the same element and tells it the params changed', async () => {
        const before = document.querySelector('pdx-kp-user');
        paramEvents.length = 0;

        navigate('/users/9');
        await tick();

        expect(document.querySelector('pdx-kp-user'),
            'a param change rebuilt the whole page').toBe(before);
        expect(paramEvents, 'the page was never told which params changed').toEqual([{ id: '9' }]);
    });

    it('updates the routeParams signal descendants read', () => {
        expect(routeParams()).toEqual({ id: '9' });
    });

    // The attribute follows too, not only the signal and the event. Applied only at activation, a
    // page that stays across a param change would keep the attribute it mounted with — `@prop id`
    // reading 7 while `currentParams()` says 9. With nested routes, moving between siblings IS the
    // gesture.
    it('and the attribute on the page, which a @prop reads', () => {
        expect(document.querySelector('pdx-kp-user')!.getAttribute('id'),
            'the page kept the param it mounted with').toBe('9');
    });

    it('says nothing when the params did not actually change', async () => {
        paramEvents.length = 0;
        navigate('/users/9');
        await tick();
        expect(paramEvents, 'an identical navigation woke the page').toHaveLength(0);
    });
});

describe('swipe back', () => {
    const swipe = (dx: number, dy = 0, holdMs = 0) => {
        outlet.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        const fire = () => outlet.dispatchEvent(
            new PointerEvent('pointerup', { clientX: 100 + dx, clientY: 100 + dy }),
        );
        if (holdMs) return new Promise((r) => setTimeout(() => { fire(); r(null); }, holdMs));
        fire();
        return Promise.resolve(null);
    };

    it('a fast rightward swipe goes back in history', async () => {
        const back = vi.spyOn(history, 'back').mockImplementation(() => {});
        await swipe(120);
        expect(back, 'the gesture did not navigate back').toHaveBeenCalledTimes(1);
        back.mockRestore();
    });

    it('a leftward swipe does not', async () => {
        const back = vi.spyOn(history, 'back').mockImplementation(() => {});
        await swipe(-120);
        expect(back).not.toHaveBeenCalled();
        back.mockRestore();
    });

    it('a mostly-vertical drag is a scroll, not a swipe', async () => {
        const back = vi.spyOn(history, 'back').mockImplementation(() => {});
        await swipe(100, 200);
        expect(back, 'scrolling the page navigated away from it').not.toHaveBeenCalled();
        back.mockRestore();
    });

    it('a short drag is not a swipe', async () => {
        const back = vi.spyOn(history, 'back').mockImplementation(() => {});
        await swipe(40);
        expect(back).not.toHaveBeenCalled();
        back.mockRestore();
    });

    it('a slow drag is not a swipe either', async () => {
        const back = vi.spyOn(history, 'back').mockImplementation(() => {});
        await swipe(120, 0, 320);
        expect(back, 'a 300ms+ drag was treated as a flick').not.toHaveBeenCalled();
        back.mockRestore();
    });
});
