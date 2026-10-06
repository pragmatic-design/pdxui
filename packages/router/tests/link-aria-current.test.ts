// The active link says so to a screen reader, not only to the eye.
//
// A CLASS on the link the visitor is on is not enough: a screen reader would hear every entry of a
// navigation the same. WAI-ARIA's `aria-current` is the
// attribute for it, on the anchor, which is what the reader lands on:
//   - `page` on the link to the page itself;
//   - `true` on a link that is active because the page is BELOW it (a section's parent), which is
//     not the current page and must not claim to be.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate } from '../src/runtime';
import '../src/link';

const settle = () => new Promise((r) => setTimeout(r, 20));

const ROUTES = [
    { path: '/', component: () => document.createElement('div') },
    { path: '/employees/1/personal', component: () => document.createElement('div') },
    { path: '/employees/1/contracts', component: () => document.createElement('div') },
];

function link(to: string): HTMLElement {
    const el = document.createElement('pdx-link');
    el.setAttribute('active-class', 'here');
    el.setAttribute('to', to);
    el.textContent = to;
    document.body.appendChild(el);
    return el;
}

const current = (el: HTMLElement) => el.querySelector('a')!.getAttribute('aria-current');

describe('aria-current on an active pdx-link', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        history.replaceState(null, '', '/');
        createRouter(ROUTES, {});
    });

    it('the link to the page itself is aria-current="page"', async () => {
        navigate('/employees/1/personal');
        await settle();
        const here = link('/employees/1/personal');
        await settle();
        expect(current(here)).toBe('page');
    });

    it('a link active because the page is below it is aria-current="true", not "page"', async () => {
        navigate('/employees/1/personal');
        await settle();
        const parent = link('/employees/1');
        await settle();
        expect(current(parent)).toBe('true');
    });

    it('and it moves with a navigation', async () => {
        navigate('/employees/1/personal');
        await settle();
        const personal = link('/employees/1/personal');
        const contracts = link('/employees/1/contracts');
        await settle();

        navigate('/employees/1/contracts');
        await settle();
        expect(current(contracts)).toBe('page');
        expect(current(personal), 'the link that was current still says so').toBeNull();
    });

    it('control — a link that is not active carries no aria-current', async () => {
        navigate('/employees/1/personal');
        await settle();
        const other = link('/employees/1/contracts');
        await settle();
        expect(current(other)).toBeNull();
    });
});
