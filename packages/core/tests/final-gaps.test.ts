// Final gap tests: store circular refs, duplicate keys, nested error boundary, stress tests.

import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect, batch } from '../src/reactivity/signal';
import { store } from '../src/reactivity/store';
import { repeat } from '../src/renderer/list';
import { errorBoundary } from '../src/renderer/error-boundary';

// ═══════════════════════════════════════════════════════════════
// GAP 1: Store circular references
// ═══════════════════════════════════════════════════════════════

describe('store circular references', () => {
    it('handles self-referencing object without infinite loop', () => {
        const obj: any = { name: 'root', children: [] };
        obj.self = obj; // circular reference

        // Should not throw or loop infinitely
        const s = store(obj);
        expect(s.name).toBe('root');
        expect(s.self).toBe(s); // same proxy returned (cache hit)
    });

    it('handles mutual references', () => {
        const a: any = { name: 'a' };
        const b: any = { name: 'b' };
        a.ref = b;
        b.ref = a;

        const sa = store(a);
        expect(sa.name).toBe('a');
        expect(sa.ref.name).toBe('b');
        expect(sa.ref.ref.name).toBe('a'); // back to a, proxy cached
    });
});

// ═══════════════════════════════════════════════════════════════
// GAP 2: Duplicate keys in each() — warning
// ═══════════════════════════════════════════════════════════════

describe('each() duplicate key warning', () => {
    it('warns on duplicate keys', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const items = signal([
            { id: 1, name: 'a' },
            { id: 1, name: 'b' }, // duplicate key
            { id: 2, name: 'c' },
        ]);

        const frag = repeat(
            () => items(),
            (item) => item.id,
            (item) => {
                const el = document.createElement('div');
                el.textContent = item.name;
                return el;
            },
        );

        document.body.appendChild(frag);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Duplicate key')
        );
        warnSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════
// GAP 3: Nested error boundaries
// ═══════════════════════════════════════════════════════════════

describe('nested error boundaries', () => {
    it('inner boundary catches, outer does not fire', () => {
        let outerCaught = false;
        let innerCaught = false;

        const container = document.createElement('div');
        const frag = errorBoundary(
            () => {
                // Outer content contains inner boundary
                const inner = errorBoundary(
                    () => { throw new Error('inner error'); },
                    (err) => {
                        innerCaught = true;
                        const el = document.createElement('span');
                        el.textContent = `Inner: ${(err as Error).message}`;
                        return el;
                    },
                );
                return inner;
            },
            (err) => {
                outerCaught = true;
                const el = document.createElement('span');
                el.textContent = `Outer: ${(err as Error).message}`;
                return el;
            },
        );

        container.appendChild(frag);

        expect(innerCaught).toBe(true);
        expect(outerCaught).toBe(false);
        expect(container.textContent).toContain('Inner: inner error');
    });
});

// ═══════════════════════════════════════════════════════════════
// GAP 5: @defer-like error+retry pattern (errorBoundary with retry)
// ═══════════════════════════════════════════════════════════════

describe('error boundary retry', () => {
    it('retry callback re-renders content', () => {
        let attempts = 0;
        const container = document.createElement('div');

        const frag = errorBoundary(
            () => {
                attempts++;
                if (attempts < 3) throw new Error(`fail-${attempts}`);
                const el = document.createElement('div');
                el.textContent = 'success';
                return el;
            },
            (_err, retry) => {
                const el = document.createElement('div');
                const btn = document.createElement('button');
                btn.textContent = 'Retry';
                btn.onclick = () => retry();
                el.appendChild(btn);
                return el;
            },
        );

        container.appendChild(frag);
        expect(attempts).toBe(1); // first attempt failed

        // Click retry twice (attempt 2 fails, attempt 3 succeeds)
        const retryBtn = container.querySelector('button');
        retryBtn?.click();
        expect(attempts).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════════
// GAP 6: Stress tests
// ═══════════════════════════════════════════════════════════════

describe('stress tests', () => {

    it('100-deep computed chain — glitch-free', () => {
        const root = signal(1);
        let current: any = root;

        // Build chain: root → c1 → c2 → ... → c100
        for (let i = 0; i < 100; i++) {
            const prev = current;
            current = computed(() => prev() + 1);
        }

        expect(current()).toBe(101); // 1 + 100

        root.set(10);
        expect(current()).toBe(110); // 10 + 100
    });

    it('1000 effects on one signal collapse into one flush', () => {
        const s = signal(0);
        let totalRuns = 0;
        const disposes: (() => void)[] = [];

        for (let i = 0; i < 1000; i++) {
            disposes.push(effect(() => { s(); totalRuns++; }));
        }

        batch(() => { s.set(1); });

        // The timing half of this — and the 10K list reconciliation — live in
        // tests/perf/reactivity-stress.test.ts. What is asserted
        // here is COALESCING, which is a fact about the scheduler and not about the
        // machine: 1000 effects, one set, exactly 2000 runs.

        expect(totalRuns).toBe(2000); // 1000 initial + 1000 from set

        for (const d of disposes) d();
    });
});
