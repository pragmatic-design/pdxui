// C2 — Effect disposal on node removal.
// Structural helpers (when/match/each) remove DOM nodes when content changes,
// but must ALSO dispose the reactive effects created inside those subtrees.
// A leaked effect stays subscribed to its signals and re-runs on detached nodes
// forever → memory leak + wasted computation.
//
// These tests prove the leak (red) and lock the fix (green).

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when, each, match } from '../src/renderer/helpers';

describe('effect disposal (C2)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('when: disposes the removed branch inner effect', () => {
        const show = signal(true);
        const value = signal(0);
        let reads = 0;

        const frag = when(
            () => show(),
            () => html`<span>${() => { reads++; return value(); }}</span>`,
        );
        document.body.appendChild(frag);

        const baseline = reads; // reads from initial render
        expect(document.body.querySelector('span')).not.toBeNull();

        // Hide the branch — span removed from DOM.
        show.set(false);
        expect(document.body.querySelector('span')).toBeNull();

        // Mutate the signal the removed binding depended on.
        // A correctly disposed effect must NOT re-run.
        value.set(1);
        value.set(2);

        expect(reads).toBe(baseline);
    });

    it('each: disposes the effect of a removed list item', () => {
        const items = signal<{ id: number }[]>([{ id: 1 }, { id: 2 }]);
        const tick = signal(0);
        let reads = 0;

        const frag = each(
            () => items(),
            'id',
            (it) => html`<span>${() => { reads++; return it.id + tick(); }}</span>`,
        );
        document.body.appendChild(frag);

        // Remove item id:2 — its subtree effect must be disposed.
        items.set([{ id: 1 }]);

        const before = reads;
        tick.set(99);
        const delta = reads - before;

        // Only the surviving item (id:1) should re-run. Leak → delta === 2.
        expect(delta).toBe(1);
    });

    it('match: disposes the previous case inner effect', () => {
        const kind = signal<'a' | 'b'>('a');
        const value = signal(0);
        let reads = 0;

        const frag = match(() => kind(), {
            a: () => html`<span class="a">${() => { reads++; return value(); }}</span>`,
            b: () => html`<span class="b">b</span>`,
        });
        document.body.appendChild(frag);

        const baseline = reads;
        kind.set('b'); // case 'a' removed
        expect(document.body.querySelector('.a')).toBeNull();

        value.set(1);
        value.set(2);

        expect(reads).toBe(baseline);
    });
});

// computed() has to be disposed with its ownership scope

import { computed as computedF3, collectDisposers as collectF3 } from '../src/reactivity/signal';

describe('computed — disposed with the ownership scope', () => {
    it('a computed with equals, created in a scope that was unmounted, stops recomputing', () => {
        const source = signal(0);
        let computeCount = 0;

        const [, dispose] = collectF3(() => {
            const c = computedF3(() => { computeCount++; return source() * 2; }, { equals: (a, b) => a === b });
            c();
        });

        const before = computeCount;
        dispose();

        source.set(1);
        source.set(2);
        expect(computeCount).toBe(before);
    });

    it('a computed outside any scope goes on working', () => {
        const source = signal(1);
        const c = computedF3(() => source() * 10);
        expect(c()).toBe(10);
        source.set(2);
        expect(c()).toBe(20);
    });
});
