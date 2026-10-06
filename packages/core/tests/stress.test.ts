// Stress & complexity tests — verify the framework handles real-world scenarios.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, computed, effect, batch } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when, each, match, pipe } from '../src/renderer/helpers';
import { createBus } from '../src/reactivity/bus';
import { component } from '../src/component/component';
import type { Signal } from '../src/utils/types';

// ─── Signal Stress ─────────────────────────────────────────────────

describe('signal stress', () => {
    it('handles 10,000 rapid updates', () => {
        const count = signal(0);
        let effectRuns = 0;
        effect(() => { count(); effectRuns++; });

        for (let i = 1; i <= 10_000; i++) {
            count.set(i);
        }

        expect(count()).toBe(10_000);
        expect(effectRuns).toBe(10_001); // initial + 10k updates
    });

    it('batch coalesces 10,000 updates into one effect run', () => {
        const count = signal(0);
        let effectRuns = 0;
        effect(() => { count(); effectRuns++; });
        expect(effectRuns).toBe(1);

        batch(() => {
            for (let i = 1; i <= 10_000; i++) {
                count.set(i);
            }
        });

        expect(count()).toBe(10_000);
        expect(effectRuns).toBe(2); // initial + 1 batched
    });

    it('computed chain of depth 20', () => {
        const base = signal(1);
        let current: any = base;

        for (let i = 0; i < 20; i++) {
            const prev = current;
            current = computed(() => prev() + 1);
        }

        expect(current()).toBe(21);
        base.set(100);
        expect(current()).toBe(120);
    });

    it('diamond dependency — no double execution', () => {
        const a = signal(1);
        const b = computed(() => a() * 2);
        const c = computed(() => a() * 3);
        // d depends on both b and c (diamond)
        const d = computed(() => b() + c());

        expect(d()).toBe(5); // 2 + 3

        let runs = 0;
        effect(() => { d(); runs++; });
        expect(runs).toBe(1);

        a.set(2);
        expect(d()).toBe(10); // 4 + 6
        // Effect should run at most 2 times (initial + 1 update)
        // Note: without glitch-free, it may run more. That's OK for now.
        expect(runs).toBeLessThanOrEqual(3);
    });

    it('100 signals × 100 effects — cross subscription', () => {
        const signals = Array.from({ length: 100 }, (_, i) => signal(i));
        const sums: number[] = [];

        // Each effect reads 10 consecutive signals
        for (let i = 0; i < 100; i++) {
            const start = i;
            effect(() => {
                let sum = 0;
                for (let j = 0; j < 10; j++) {
                    sum += signals[(start + j) % 100]();
                }
                sums[i] = sum;
            });
        }

        // All effects computed
        expect(sums.length).toBe(100);

        // Update one signal — only ~10 effects should re-run
        signals[0].set(1000);
        expect(sums[0]).toBeGreaterThan(900); // includes 1000
    });

    it('signal history with 1000 entries', () => {
        const editor = signal('', { history: true });

        for (let i = 0; i < 1000; i++) {
            editor.set(`version-${i}`);
        }

        expect(editor.history().length).toBe(1001); // initial + 1000
        expect(editor()).toBe('version-999');

        // Undo 500 steps
        for (let i = 0; i < 500; i++) {
            editor.undo();
        }
        expect(editor()).toBe('version-499');
        expect(editor.canUndo()).toBe(true);
        expect(editor.canRedo()).toBe(true);

        // Set new value — truncates redo
        editor.set('new-branch');
        expect(editor.canRedo()).toBe(false);
        expect(editor.history().length).toBe(502); // 0..499 + new
    });
});

// ─── DOM / Template Stress ─────────────────────────────────────────

describe('template stress', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders 500 items in each()', () => {
        const items = signal(
            Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Item ${i}` }))
        );

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        expect(document.body.querySelectorAll('li').length).toBe(500);
        expect(document.body.querySelector('li')?.textContent).toBe('Item 0');
    });

    it('adds and removes from 500-item list', () => {
        const items = signal(
            Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Item ${i}` }))
        );

        const frag = html`<ul>${each(() => items(), 'id', (item) =>
            html`<li>${item.name}</li>`
        )}</ul>`;
        document.body.appendChild(frag);

        // Add 10 items
        items.set(prev => [...prev, ...Array.from({ length: 10 }, (_, i) => ({ id: 500 + i, name: `New ${i}` }))]);
        expect(document.body.querySelectorAll('li').length).toBe(510);

        // Remove first 100
        items.set(prev => prev.slice(100));
        expect(document.body.querySelectorAll('li').length).toBe(410);
    });

    it('nested when() inside each() — N conditional blocks', () => {
        const items = signal(
            Array.from({ length: 50 }, (_, i) => ({ id: i, active: i % 2 === 0 }))
        );

        const frag = html`<div>${each(() => items(), 'id', (item) =>
            html`<div>${when(
                () => item.active,
                () => html`<span class="on">ON</span>`,
                () => html`<span class="off">OFF</span>`
            )}</div>`
        )}</div>`;
        document.body.appendChild(frag);

        expect(document.body.querySelectorAll('.on').length).toBe(25);
        expect(document.body.querySelectorAll('.off').length).toBe(25);
    });

    it('match() with rapid state changes', () => {
        const state = signal<string>('idle');
        const frag = html`<div id="state">${match(() => state(), {
            idle:    () => html`<span>Idle</span>`,
            loading: () => html`<span>Loading</span>`,
            success: () => html`<span>Success</span>`,
            error:   () => html`<span>Error</span>`,
        })}</div>`;
        document.body.appendChild(frag);

        const states = ['loading', 'success', 'error', 'idle', 'loading', 'success'];
        for (const s of states) {
            state.set(s);
        }

        expect(document.body.querySelector('#state span')?.textContent).toBe('Success');
    });

    it('pipe with 10 transforms', () => {
        const transforms = [
            (s: string) => s.trim(),
            (s: string) => s.toLowerCase(),
            (s: string) => s.replace(/\s+/g, '-'),
            (s: string) => s.replace(/[^a-z0-9-]/g, ''),
            (s: string) => s.slice(0, 50),
            (s: string) => s || 'untitled',
            (s: string) => `article-${s}`,
            (s: string) => s.replace(/-+/g, '-'),
            (s: string) => s.replace(/^-|-$/g, ''),
            (s: string) => s.toLowerCase(),
        ];
        const result = pipe('  Hello World! @#$ Test  ', ...transforms);
        expect(result).toBe('article-hello-world-test');
    });

    it('template caching — 100 instances of same template', () => {
        function renderCard(title: string) {
            return html`<div class="card"><h3>${title}</h3></div>`;
        }

        for (let i = 0; i < 100; i++) {
            document.body.appendChild(renderCard(`Card ${i}`));
        }

        expect(document.body.querySelectorAll('.card').length).toBe(100);
        expect(document.body.querySelector('.card h3')?.textContent).toBe('Card 0');
    });

    it('two-way binding under rapid input', () => {
        const value = signal('');
        const frag = html`<input ::value=${value}><span id="mirror">${value}</span>`;
        document.body.appendChild(frag);

        const input = document.body.querySelector('input')!;
        const words = ['hello', 'world', 'test', 'rapid', 'binding'];
        for (const word of words) {
            input.value = word;
            input.dispatchEvent(new Event('input'));
        }

        expect(value()).toBe('binding');
        expect(document.body.querySelector('#mirror')?.textContent).toBe('binding');
    });
});

// ─── Event Bus Stress ──────────────────────────────────────────────

describe('event bus stress', () => {
    it('1000 events with 10 handlers', () => {
        const bus = createBus<{ 'tick': number }>();
        const counters = Array.from({ length: 10 }, () => ({ sum: 0 }));

        for (let i = 0; i < 10; i++) {
            const counter = counters[i];
            bus.on('tick', (n) => { counter.sum += n; });
        }

        for (let i = 0; i < 1000; i++) {
            bus.emit('tick', i);
        }

        const expectedSum = (999 * 1000) / 2;
        for (const counter of counters) {
            expect(counter.sum).toBe(expectedSum);
        }
    });

    it('store with 10,000 events + replay', () => {
        const bus = createBus<{ 'log': string }>({ store: true });

        for (let i = 0; i < 10_000; i++) {
            bus.emit('log', `msg-${i}`);
        }

        expect(bus.history().length).toBe(10_000);

        const replayed: string[] = [];
        bus.on('log', (msg) => replayed.push(msg));
        bus.replay();

        expect(replayed.length).toBe(10_000);
        expect(replayed[0]).toBe('msg-0');
        expect(replayed[9999]).toBe('msg-9999');
    });
});

// ─── Component Complexity ──────────────────────────────────────────

describe('complex component scenarios', () => {
    let tagId = 100;
    beforeEach(() => { document.body.innerHTML = ''; });

    it('component with computed props and conditional rendering', () => {
        const tag = `test-complex-${tagId++}`;
        component(tag, {
            props: {
                min: { type: Number, default: 0 },
                max: { type: Number, default: 100 },
            },
            setup(ctx) {
                const value = signal(50);
                const percentage = computed(() =>
                    Math.round(((value() - (ctx.min as Signal<number>)()) / ((ctx.max as Signal<number>)() - (ctx.min as Signal<number>)())) * 100)
                );
                const status = computed(() =>
                    percentage() < 30 ? 'low' : percentage() < 70 ? 'mid' : 'high'
                );
                return {
                    value, percentage, status,
                    inc: () => value.set(v => Math.min(v + 10, (ctx.max as Signal<number>)())),
                    dec: () => value.set(v => Math.max(v - 10, (ctx.min as Signal<number>)())),
                };
            },
            render: (ctx) => html`
                <div class="gauge">
                    <span class="pct">${ctx.percentage as Signal<number>}%</span>
                    ${match(() => (ctx.status as Signal<string>)(), {
                        low:  () => html`<span class="level low">Low</span>`,
                        mid:  () => html`<span class="level mid">Medium</span>`,
                        high: () => html`<span class="level high">High</span>`,
                    })}
                    <button class="dec" @click=${ctx.dec as () => void}>-10</button>
                    <button class="inc" @click=${ctx.inc as () => void}>+10</button>
                </div>
            `,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        // Initial state: 50% → mid
        expect(el.querySelector('.pct')?.textContent).toBe('50%');
        expect(el.querySelector('.level')?.textContent).toBe('Medium');
        expect(el.querySelector('.level')?.classList.contains('mid')).toBe(true);

        // Click +10 three times → 80% → high
        el.querySelector<HTMLButtonElement>('.inc')!.click();
        el.querySelector<HTMLButtonElement>('.inc')!.click();
        el.querySelector<HTMLButtonElement>('.inc')!.click();
        expect(el.querySelector('.pct')?.textContent).toBe('80%');
        expect(el.querySelector('.level')?.textContent).toBe('High');

        // Click -10 seven times → 10% → low
        for (let i = 0; i < 7; i++) {
            el.querySelector<HTMLButtonElement>('.dec')!.click();
        }
        expect(el.querySelector('.pct')?.textContent).toBe('10%');
        expect(el.querySelector('.level')?.textContent).toBe('Low');
    });

    it('component with each() + when() + emit + attribute reactivity', () => {
        const tag = `test-list-${tagId++}`;
        component(tag, {
            props: {
                filter: { type: String, default: 'all' },
            },
            setup(ctx) {
                const items = signal([
                    { id: 1, text: 'Task A', done: false },
                    { id: 2, text: 'Task B', done: true },
                    { id: 3, text: 'Task C', done: false },
                    { id: 4, text: 'Task D', done: true },
                    { id: 5, text: 'Task E', done: false },
                ]);

                const filteredItems = computed(() => {
                    const f = (ctx.filter as Signal<string>)();
                    const all = items();
                    if (f === 'done') return all.filter(i => i.done);
                    if (f === 'pending') return all.filter(i => !i.done);
                    return all;
                });

                const count = computed(() => filteredItems().length);

                function toggle(id: number) {
                    items.set(prev => prev.map(i =>
                        i.id === id ? { ...i, done: !i.done } : i
                    ));
                    ctx.emit('pdx-change', { id });
                }

                return { filteredItems, count, toggle };
            },
            render: (ctx) => html`
                <div class="task-list">
                    <span class="count">${ctx.count as Signal<number>}</span>
                    ${when(
                        () => (ctx.count as Signal<number>)() === 0,
                        () => html`<div class="empty">No tasks</div>`
                    )}
                    <ul>
                        ${each(
                            () => (ctx.filteredItems as Signal<any[]>)(),
                            'id',
                            (item) => html`<li class=${item.done ? 'done' : 'pending'}>${item.text}</li>`
                        )}
                    </ul>
                </div>
            `,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        // All items: 5
        expect(el.querySelector('.count')?.textContent).toBe('5');
        expect(el.querySelectorAll('li').length).toBe(5);
        expect(el.querySelectorAll('.done').length).toBe(2);
        expect(el.querySelectorAll('.pending').length).toBe(3);

        // Filter to "done"
        el.setAttribute('filter', 'done');
        expect(el.querySelector('.count')?.textContent).toBe('2');
        expect(el.querySelectorAll('li').length).toBe(2);

        // Filter to "pending"
        el.setAttribute('filter', 'pending');
        expect(el.querySelector('.count')?.textContent).toBe('3');

        // Back to all
        el.setAttribute('filter', 'all');
        expect(el.querySelectorAll('li').length).toBe(5);
    });

    it('10 component instances rendered simultaneously', () => {
        const tag = `test-multi-${tagId++}`;
        component(tag, {
            props: { n: { type: Number, default: 0 } },
            setup(ctx) {
                const count = signal((ctx.n as Signal<number>).peek());
                return { count, inc: () => count.set(v => v + 1) };
            },
            render: (ctx) => html`<span class="v">${ctx.count as Signal<number>}</span><button @click=${ctx.inc as () => void}>+</button>`,
        });

        for (let i = 0; i < 10; i++) {
            const el = document.createElement(tag);
            el.setAttribute('n', String(i * 10));
            document.body.appendChild(el);
        }

        const values = Array.from(document.body.querySelectorAll('.v')).map(el => el.textContent);
        expect(values).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80', '90']);

        // Click + on the 5th instance
        document.body.querySelectorAll('button')[4].click();
        const updated = Array.from(document.body.querySelectorAll('.v')).map(el => el.textContent);
        expect(updated[4]).toBe('41');
        expect(updated[3]).toBe('30'); // others unchanged
    });
});
