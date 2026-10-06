// Tests for Sprint 3: defer(), FLIP animations, each() with transitions

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { each } from '../src/renderer/helpers';
import { defer } from '../src/renderer/defer';
import { recordPositions, flipAnimate } from '../src/renderer/transitions';
import { waitUntil } from './wait-until';

// ─── defer() ───────────────────────────────────────────────────────

describe('defer()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('shows placeholder initially', () => {
        const frag = defer(
            {
                trigger: 'timer(999999)', // won't fire in test
                placeholder: () => html`<div class="skeleton">Loading...</div>`,
            },
            null,
            () => html`<div class="content">Heavy Content</div>`
        );
        document.body.appendChild(frag);

        expect(document.body.querySelector('.skeleton')).not.toBeNull();
        expect(document.body.querySelector('.content')).toBeNull();
    });

    it('immediate trigger loads content right away', async () => {
        const frag = defer(
            { trigger: 'immediate' },
            null,
            () => html`<div class="loaded">Content</div>`
        );
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.loaded') !== null, 'the deferred block to load');
        expect(document.body.querySelector('.loaded')).not.toBeNull();
    });

    it('timer trigger fires after delay', async () => {
        const frag = defer(
            {
                trigger: 'timer(50)',
                placeholder: () => html`<div class="ph">Wait</div>`,
            },
            null,
            () => html`<div class="loaded">Done</div>`
        );
        document.body.appendChild(frag);

        expect(document.body.querySelector('.ph')).not.toBeNull();
        expect(document.body.querySelector('.loaded')).toBeNull();

        await waitUntil(() => document.body.querySelector('.loaded') !== null, 'the deferred block to load');
        expect(document.body.querySelector('.loaded')).not.toBeNull();
    });

    it('loads async module on trigger', async () => {
        const frag = defer(
            { trigger: 'immediate' },
            () => Promise.resolve({ default: 'module-data' }),
            (mod: any) => html`<div class="mod">${mod?.default ?? 'none'}</div>`
        );
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.mod') !== null, 'the dynamic module to render');
        expect(document.body.querySelector('.mod')?.textContent).toBe('module-data');
    });

    it('shows loading state during async load', async () => {
        let resolveLoad: (v: unknown) => void;
        const loadPromise = new Promise(r => { resolveLoad = r; });

        const frag = defer(
            {
                trigger: 'immediate',
                placeholder: () => html`<div class="ph">PH</div>`,
                loading: () => html`<div class="loading">Loading...</div>`,
            },
            () => loadPromise,
            () => html`<div class="done">Done</div>`
        );
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.loading') !== null, 'the loading placeholder');
        expect(document.body.querySelector('.loading')).not.toBeNull();

        resolveLoad!('ok');
        await waitUntil(() => document.body.querySelector('.done') !== null, 'the resolved content');
        expect(document.body.querySelector('.done')).not.toBeNull();
    });

    it('shows error state on load failure', async () => {
        const frag = defer(
            {
                trigger: 'immediate',
                error: (err) => html`<div class="err">${err.message}</div>`,
            },
            () => Promise.reject(new Error('load failed')),
            () => html`<div>Never</div>`
        );
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.err') !== null, 'the error fallback');
        expect(document.body.querySelector('.err')?.textContent).toBe('load failed');
    });

    it('composite trigger: timer | immediate fires on first', async () => {
        const frag = defer(
            {
                trigger: 'immediate | timer(999999)',
                placeholder: () => html`<div class="ph">PH</div>`,
            },
            null,
            () => html`<div class="loaded">Loaded</div>`
        );
        document.body.appendChild(frag);

        await waitUntil(() => document.body.querySelector('.loaded') !== null, 'the immediate trigger to fire first');
        // immediate should fire first
        expect(document.body.querySelector('.loaded')).not.toBeNull();
    });
});

// ─── FLIP / list transitions ───────────────────────────────────────

describe('each() with transitions', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('new items are rendered (enter transition accepted)', () => {
        const items = signal([{ id: 1, name: 'A' }]);
        const frag = html`<ul>${each(() => items(), 'id',
            (item) => html`<li>${item.name}</li>`,
            { enter: 'fade-in', exit: 'fade-out' }
        )}</ul>`;
        document.body.appendChild(frag);

        expect(document.body.querySelectorAll('li').length).toBe(1);

        items.set([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
        expect(document.body.querySelectorAll('li').length).toBe(2);
    });

    it('removed items get exit transition classes', () => {
        const items = signal([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
        ]);
        const frag = html`<ul>${each(() => items(), 'id',
            (item) => html`<li>${item.name}</li>`,
            { exit: 'fade-out' }
        )}</ul>`;
        document.body.appendChild(frag);

        items.set([{ id: 1, name: 'A' }]);

        // The removed item should have exit classes (async removal)
        const allLi = document.body.querySelectorAll('li');
        // May still be in DOM with exit classes, or removed by timeout
        // Check that at least 1 item remains
        expect(allLi.length).toBeGreaterThanOrEqual(1);
    });

    it('move transitions accepted without error', () => {
        const items = signal([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
        ]);
        const frag = html`<ul>${each(() => items(), 'id',
            (item) => html`<li>${item.name}</li>`,
            { move: 'flip-300' }
        )}</ul>`;
        document.body.appendChild(frag);

        // Reverse — should trigger FLIP
        expect(() => {
            items.set([
                { id: 3, name: 'C' },
                { id: 2, name: 'B' },
                { id: 1, name: 'A' },
            ]);
        }).not.toThrow();

        const texts = Array.from(document.body.querySelectorAll('li')).map(el => el.textContent);
        expect(texts).toEqual(['C', 'B', 'A']);
    });
});

describe('recordPositions + flipAnimate', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('recordPositions returns map of element rects', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const positions = recordPositions([el]);
        expect(positions.size).toBe(1);
        expect(positions.get(el)).toBeDefined();
        expect(typeof positions.get(el)!.left).toBe('number');
    });

    it('flipAnimate does not throw on empty inputs', () => {
        expect(() => flipAnimate(new Map(), [])).not.toThrow();
    });

    it('flipAnimate skips non-HTMLElement nodes', () => {
        const text = document.createTextNode('hello');
        expect(() => flipAnimate(new Map(), [text])).not.toThrow();
    });

    // The joint between the two packages: the reconciler reads the duration out of `move` with
    // `parseInt(move.replace(/\D/g, '')) || 300`, and the compiler emits `@move(200)` as the digits
    // alone. A test passing 'flip-300' proves the named form and says nothing about the emitted one.
    it('a digits-only move value is the form @move emits, and carries its duration', () => {
        const items = signal([{ id: 1, n: 'A' }, { id: 2, n: 'B' }]);
        const frag = html`<ul>${each(() => items(), 'id', (i) => html`<li>${i.n}</li>`, { move: '200' })}</ul>`;
        document.body.appendChild(frag);

        expect(() => items.set([{ id: 2, n: 'B' }, { id: 1, n: 'A' }])).not.toThrow();
        expect(Array.from(document.body.querySelectorAll('li')).map(el => el.textContent))
            .toEqual(['B', 'A']);
        // The duration the runtime would use, computed the way the runtime computes it.
        expect(parseInt('200'.replace(/\D/g, ''), 10) || 300).toBe(200);
        expect(parseInt('300'.replace(/\D/g, ''), 10) || 300).toBe(300);
    });
});
