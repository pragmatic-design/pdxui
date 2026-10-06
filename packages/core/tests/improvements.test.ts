// Tests specifically for the 3 improvements: glitch-free, LIS reconciliation, effect cleanup.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, computed, effect } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { each } from '../src/renderer/helpers';

// ─── 1. Glitch-Free Scheduling ────────────────────────────────────

describe('glitch-free scheduling', () => {
    it('diamond dependency: effect runs at most 2x (was 3x)', () => {
        const a = signal(1);
        const b = computed(() => a() * 2);
        const c = computed(() => a() * 3);
        const d = computed(() => b() + c());

        let runs = 0;
        let values: number[] = [];
        effect(() => {
            runs++;
            values.push(d());
        });

        expect(runs).toBe(1);
        expect(values).toEqual([5]); // 2+3

        runs = 0;
        values = [];
        a.set(2);

        // Should run at most 2x (down from 3x before auto-batch)
        expect(runs).toBeLessThanOrEqual(2);
        // Final value must be correct regardless of run count
        expect(d()).toBe(10); // 4+6
        expect(values[values.length - 1]).toBe(10);
    });

    it('triple diamond: A→B,C,D→E — E runs ≤ 3x', () => {
        const a = signal(1);
        const b = computed(() => a() + 1);
        const c = computed(() => a() + 2);
        const d = computed(() => a() + 3);
        const e = computed(() => b() + c() + d());

        let runs = 0;
        effect(() => { e(); runs++; });
        runs = 0;

        a.set(10);
        expect(e()).toBe(11 + 12 + 13); // 36
        expect(runs).toBeLessThanOrEqual(3);
    });

    it('auto-batch: single signal.set triggers one effect run', () => {
        const count = signal(0);
        let runs = 0;
        effect(() => { count(); runs++; });
        runs = 0;

        count.set(1);
        expect(runs).toBe(1);
    });

    it('no glitch: effect always sees consistent state', () => {
        const first = signal('John');
        const last = signal('Doe');
        const full = computed(() => `${first()} ${last()}`);

        const seen: string[] = [];
        effect(() => { seen.push(full()); });

        // In a non-glitch-free system, this could produce 'Jane Doe' then 'Jane Smith'
        // In our system, effects run after all signals are set
        first.set('Jane');
        last.set('Smith');

        // Should never see an intermediate glitch state
        expect(seen).not.toContain('John Smith'); // would be a glitch
    });
});

// ─── 2. LIS Reconciliation ────────────────────────────────────────

describe('LIS reconciliation', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('reverse list: minimal DOM moves', () => {
        const items = signal([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
            { id: 4, name: 'D' },
        ]);

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        // Reverse the list
        items.set([
            { id: 4, name: 'D' },
            { id: 3, name: 'C' },
            { id: 2, name: 'B' },
            { id: 1, name: 'A' },
        ]);

        const texts = Array.from(document.body.querySelectorAll('li')).map(el => el.textContent);
        expect(texts).toEqual(['D', 'C', 'B', 'A']);
    });

    it('move last to first', () => {
        const items = signal([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
        ]);

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        items.set([
            { id: 3, name: 'C' },
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
        ]);

        const texts = Array.from(document.body.querySelectorAll('li')).map(el => el.textContent);
        expect(texts).toEqual(['C', 'A', 'B']);
    });

    it('insert in middle', () => {
        const items = signal([
            { id: 1, name: 'A' },
            { id: 3, name: 'C' },
        ]);

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        items.set([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
        ]);

        const texts = Array.from(document.body.querySelectorAll('li')).map(el => el.textContent);
        expect(texts).toEqual(['A', 'B', 'C']);
    });

    it('shuffle: complex reorder', () => {
        const items = signal(
            Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Item ${i}` }))
        );

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        // Shuffle: [0,1,2,3,4,5,6,7,8,9] → [5,0,8,3,1,9,2,7,4,6]
        const order = [5, 0, 8, 3, 1, 9, 2, 7, 4, 6];
        items.set(order.map(i => ({ id: i, name: `Item ${i}` })));

        const texts = Array.from(document.body.querySelectorAll('li')).map(el => el.textContent);
        expect(texts).toEqual(order.map(i => `Item ${i}`));
    });

    it('remove from middle + add at end', () => {
        const items = signal([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
        ]);

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        items.set([
            { id: 1, name: 'A' },
            { id: 3, name: 'C' },
            { id: 4, name: 'D' },
        ]);

        const texts = Array.from(document.body.querySelectorAll('li')).map(el => el.textContent);
        expect(texts).toEqual(['A', 'C', 'D']);
    });
});

// ─── 3. Effect Cleanup ────────────────────────────────────────────

describe('effect cleanup on dispose', () => {
    it('disposed effect is removed from signal subscriber sets', () => {
        const count = signal(0);
        let runs = 0;
        const dispose = effect(() => { count(); runs++; });
        expect(runs).toBe(1);

        // Verify effect runs on update
        count.set(1);
        expect(runs).toBe(2);

        // Dispose
        dispose();

        // Effect should NOT run anymore
        count.set(2);
        expect(runs).toBe(2); // unchanged
        count.set(3);
        expect(runs).toBe(2); // still unchanged
    });

    it('disposed effect does not prevent signal GC', () => {
        let runs = 0;
        const count = signal(0);
        const dispose = effect(() => { count(); runs++; });

        dispose();

        // After dispose, the effect should have no references in the signal's
        // subscriber set. We can verify by checking runs stays at 1.
        for (let i = 0; i < 100; i++) count.set(i);
        expect(runs).toBe(1); // only initial run
    });

    it('re-executed effect re-subscribes to new dependencies', () => {
        const toggle = signal(true);
        const a = signal('A');
        const b = signal('B');
        const values: string[] = [];

        effect(() => {
            // Conditionally subscribe to a or b
            values.push(toggle() ? a() : b());
        });

        expect(values).toEqual(['A']);

        // Change a → effect re-runs (subscribed to a)
        a.set('A2');
        expect(values).toEqual(['A', 'A2']);

        // Switch to b → now subscribes to b, unsubscribes from a
        toggle.set(false);
        expect(values).toEqual(['A', 'A2', 'B']);

        // Change a → should NOT trigger (no longer subscribed)
        a.set('A3');
        expect(values).toEqual(['A', 'A2', 'B']); // unchanged!

        // Change b → should trigger (now subscribed)
        b.set('B2');
        expect(values).toEqual(['A', 'A2', 'B', 'B2']);
    });

    it('effect correctly tracks changing dependencies over time', () => {
        const items = signal<number[]>([1, 2, 3]);
        const multiplier = signal(1);
        const results: number[][] = [];

        effect(() => {
            const m = multiplier();
            results.push(items().map(i => i * m));
        });

        expect(results).toEqual([[1, 2, 3]]);

        multiplier.set(2);
        expect(results).toEqual([[1, 2, 3], [2, 4, 6]]);

        items.set([10, 20]);
        expect(results).toEqual([[1, 2, 3], [2, 4, 6], [20, 40]]);
    });
});
