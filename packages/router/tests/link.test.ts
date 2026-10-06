// Router R2 — <pdx-link> active-class must be boundary-aware (no prefix false-positives).

import { describe, it, expect, beforeAll } from 'vitest';
import { createRouter, navigate, destroyRouter } from '../src/runtime';
import '../src/link'; // registers <pdx-link>

const tick = () => new Promise(r => setTimeout(r, 0));

function link(attrs: Record<string, string>): HTMLElement {
    const el = document.createElement('pdx-link');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el); // connect → active-class effect
    return el;
}

describe('pdx-link active-class', () => {
    beforeAll(() => {
        history.replaceState(null, '', '/');
        destroyRouter();
        createRouter([
            { path: '/dash', component: () => document.createElement('div') },
            { path: '/dashboard', component: () => document.createElement('div') },
            { path: '/dash/settings', component: () => document.createElement('div') },
        ]);
    });

    it('does NOT light up on a longer sibling path (the bug)', async () => {
        const el = link({ to: '/dash', 'active-class': 'on' });
        navigate('/dashboard');
        await tick();
        expect(el.classList.contains('on')).toBe(false);
    });

    it('lights up on exact match and on child segments', async () => {
        const el = link({ to: '/dash', 'active-class': 'on' });
        navigate('/dash');
        await tick();
        expect(el.classList.contains('on')).toBe(true);
        navigate('/dash/settings');
        await tick();
        expect(el.classList.contains('on')).toBe(true);
    });

    it('exact mode matches only the exact path', async () => {
        const el = link({ to: '/dash', 'active-class': 'on', exact: '' });
        navigate('/dash/settings');
        await tick();
        expect(el.classList.contains('on')).toBe(false);
        navigate('/dash');
        await tick();
        expect(el.classList.contains('on')).toBe(true);
    });
});

describe('pdx-link href safety', () => {
    const hrefOf = (el: HTMLElement) => (el.querySelector('a') as HTMLAnchorElement).getAttribute('href');

    it('passes a safe `to` through to the inner anchor', () => {
        expect(hrefOf(link({ to: '/users/1' }))).toBe('/users/1');
    });

    it('drops a dangerous `to` to # at mount', () => {
        expect(hrefOf(link({ to: 'javascript:alert(1)' }))).toBe('#');
    });

    it('re-sanitises when `to` is updated after mount (attributeChangedCallback)', async () => {
        const el = link({ to: '/safe' });
        expect(hrefOf(el)).toBe('/safe');
        el.setAttribute('to', 'javascript:alert(1)');
        await tick();
        expect(hrefOf(el)).toBe('#');
    });
});
