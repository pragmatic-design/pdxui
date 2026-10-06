// Performance benchmarks — measure throughput and timing.
// These run as part of the test suite to catch performance regressions.
// Results are printed to stdout for comparison tracking.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, computed, effect, batch } from '../../src/reactivity/signal';
import { html } from '../../src/renderer/template';
import { each } from '../../src/renderer/helpers';
import { component } from '../../src/component/component';
import type { Signal } from '../../src/utils/types';

function measure(label: string, fn: () => void): number {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    console.log(`  ⏱ ${label}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
}

describe('benchmarks', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('signal: 100k updates/reads', () => {
        const s = signal(0);
        const ms = measure('100k signal set+read', () => {
            for (let i = 0; i < 100_000; i++) {
                s.set(i);
                s();
            }
        });
        expect(s()).toBe(99_999);
        expect(ms).toBeLessThan(500); // should be <100ms typically
    });

    it('computed: 10k reads with dependency chain depth 5', () => {
        const base = signal(0);
        const c1 = computed(() => base() + 1);
        const c2 = computed(() => c1() + 1);
        const c3 = computed(() => c2() + 1);
        const c4 = computed(() => c3() + 1);
        const c5 = computed(() => c4() + 1);

        const ms = measure('10k computed chain reads', () => {
            for (let i = 0; i < 10_000; i++) {
                base.set(i);
                c5(); // forces recompute through chain
            }
        });
        expect(c5()).toBe(10_004);
        expect(ms).toBeLessThan(500);
    });

    it('effect: 10k updates with 50 subscribers', () => {
        const s = signal(0);
        let totalRuns = 0;
        for (let i = 0; i < 50; i++) {
            effect(() => { s(); totalRuns++; });
        }
        expect(totalRuns).toBe(50); // initial runs

        const ms = measure('10k updates × 50 effects', () => {
            for (let i = 0; i < 10_000; i++) {
                s.set(i);
            }
        });
        // First set(0) is skipped (same value), so 9,999 actual updates × 50 effects + 50 initial
        expect(totalRuns).toBe(50 + 9_999 * 50);
        expect(ms).toBeLessThan(2000);
    });

    it('batch: 10k updates with 50 subscribers → 1 flush', () => {
        const s = signal(0);
        let totalRuns = 0;
        for (let i = 0; i < 50; i++) {
            effect(() => { s(); totalRuns++; });
        }
        totalRuns = 0;

        const ms = measure('batch 10k updates × 50 effects', () => {
            batch(() => {
                for (let i = 0; i < 10_000; i++) {
                    s.set(i);
                }
            });
        });
        expect(totalRuns).toBe(50); // only 1 flush × 50 effects
        expect(ms).toBeLessThan(100);
    });

    it('DOM: render 1000 items', () => {
        const items = signal(
            Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `Item ${i}` }))
        );

        const ms = measure('render 1000 items', () => {
            const frag = html`<ul>${each(() => items(), 'id', (item) =>
                html`<li class="item">${item.text}</li>`
            )}</ul>`;
            document.body.appendChild(frag);
        });

        expect(document.body.querySelectorAll('.item').length).toBe(1000);
        expect(ms).toBeLessThan(2000);
    });

    it('DOM: update 1000-item list (replace all)', () => {
        const items = signal(
            Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `Old ${i}` }))
        );

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.text}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        const ms = measure('replace 1000 items', () => {
            items.set(Array.from({ length: 1000 }, (_, i) => ({ id: i + 1000, text: `New ${i}` })));
        });

        expect(document.body.querySelectorAll('li').length).toBe(1000);
        expect(document.body.querySelector('li')?.textContent).toBe('New 0');
        expect(ms).toBeLessThan(2000);
    });

    it('DOM: partial update — swap 2 items in 1000 list', () => {
        const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `Item ${i}` }));
        const items = signal(data);

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.text}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        const ms = measure('swap 2 items in 1000 list', () => {
            const next = [...items()];
            [next[0], next[999]] = [next[999], next[0]];
            items.set(next);
        });

        expect(ms).toBeLessThan(500);
    });

    it('template caching: 1000 instantiations of same template', () => {
        const ms = measure('1000 template clones', () => {
            for (let i = 0; i < 1000; i++) {
                const frag = html`<div class="cached"><span>${i}</span></div>`;
                document.body.appendChild(frag);
            }
        });

        expect(document.body.querySelectorAll('.cached').length).toBe(1000);
        expect(ms).toBeLessThan(2000);
    });

    it('component: mount 100 instances', () => {
        let tagId = 900;
        const tag = `bench-comp-${tagId++}`;
        component(tag, {
            props: { n: { type: Number, default: 0 } },
            setup(ctx) {
                const count = signal((ctx.n as Signal<number>).peek());
                return { count, inc: () => count.set((v: number) => v + 1) };
            },
            render: (ctx) => html`<span>${ctx.count as Signal<number>}</span>`,
        });

        const ms = measure('mount 100 components', () => {
            for (let i = 0; i < 100; i++) {
                const el = document.createElement(tag);
                el.setAttribute('n', String(i));
                document.body.appendChild(el);
            }
        });

        expect(document.body.querySelectorAll(tag).length).toBe(100);
        expect(ms).toBeLessThan(2000);
    });

    it('signal: create 10,000 signals', () => {
        const ms = measure('create 10k signals', () => {
            const sigs: any[] = [];
            for (let i = 0; i < 10_000; i++) {
                sigs.push(signal(i));
            }
        });
        expect(ms).toBeLessThan(200);
    });

    it('computed: chain 10 deep × 1000 wide', () => {
        const ms = measure('1000 computed chains depth 10', () => {
            for (let w = 0; w < 1000; w++) {
                let s: any = signal(w);
                for (let d = 0; d < 10; d++) {
                    const prev = s;
                    s = computed(() => prev() + 1);
                }
                s(); // force evaluation
            }
        });
        expect(ms).toBeLessThan(1000);
    });
});
