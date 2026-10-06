// A lazy page takes the focus when it ARRIVES, and its placeholder never does.
//
// Focusing once the activation returns is too early: for a lazy page that is while the chunk is
// still in flight, so the element focused would be the «Loading...» placeholder. Two symptoms in a
// production build: Chromium draws its focus-visible ring round the placeholder (a blue rule at the
// placeholder's bottom edge, the other three edges off-screen), and when the page replaces the
// placeholder the focus falls to <body> — a lazy page, i.e. every page of a built app, never
// receives the focus WCAG 2.4.3 moves to it.

import { describe, it, expect, beforeAll } from 'vitest';

let gateResolve!: () => void;
(globalThis as Record<string, unknown>).__lazyGate = new Promise<void>(res => { gateResolve = res; });

customElements.define('pdx-lf-home', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-lf-home' },
    { path: '/lazy', tag: 'pdx-lazypage', lazy: true, file: '../tests/fixtures/lazy-page.ts' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise(r => setTimeout(r, 0));

let outlet: Element;
let focusedWhileLoading: Element | null = null;

describe('a lazy page and the focus', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        outlet = document.querySelector('pdx-router-outlet')!;
        await tick();

        navigate('/lazy');
        await tick();
        await tick();
        expect(outlet.textContent, 'the lazy branch never started').toContain('Loading');
        focusedWhileLoading = document.activeElement;

        gateResolve();
        for (let i = 0; i < 200 && !outlet.querySelector('pdx-lazypage'); i++) await tick();
        await tick();
    });

    it('the placeholder is never focused', () => {
        expect(focusedWhileLoading?.textContent ?? '', 'the placeholder took the focus').not.toContain('Loading');
    });

    it('the page takes the focus when it arrives', () => {
        const page = outlet.querySelector('pdx-lazypage');
        expect(page, 'the page never mounted').not.toBeNull();
        expect(document.activeElement, 'the focus fell to <body>').toBe(page);
        expect(page!.getAttribute('tabindex')).toBe('-1');
    });
});
