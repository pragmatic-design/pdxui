// Production-mode compile speed, kept apart from `production.test.ts`.
//
// The last assertion here is a wall-clock RATIO between two benchmarks taken in the same process.
// It is a real guard — it catches production mode acquiring a pathologically expensive pass — and
// it is meaningless when the machine is compiling six packages in parallel underneath it, because a
// ratio only survives that if both halves are slowed by the same amount. So it lives outside the
// default run: `pnpm test:perf`, alone. Nothing here is asserted by `pnpm test`.

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/plugin';


describe('production compile speed benchmarks', () => {
    const counterSrc = `
<template>
  <div class="counter"><h3>{{ label }}</h3><span>{{ count }}</span>
  <button @click="inc">+</button>
  @if (count > 10) { <div>High!</div> }</div>
</template>
<script setup>
  @prop label: string = 'Counter';
  let count = $signal(0);
  function inc() { count++; }
</script>`;

    function bench(label: string, fn: () => void, n = 50): { avg: number; ops: number } {
        for (let i = 0; i < 5; i++) fn(); // warmup
        const times: number[] = [];
        for (let i = 0; i < n; i++) {
            const s = performance.now();
            fn();
            times.push(performance.now() - s);
        }
        const avg = times.reduce((a, b) => a + b) / n;
        const ops = Math.round(1000 / avg);
        console.log(`  ⏱ ${label}: avg=${avg.toFixed(3)}ms (${ops} ops/sec)`);
        return { avg, ops };
    }

    it('dev mode compile speed', () => {
        const { ops } = bench('dev mode', () => {
            compile(counterSrc, 'counter.pdx', [], undefined, { production: false });
        });
        expect(ops).toBeGreaterThan(100);
    });

    it('production mode compile speed', () => {
        const { ops } = bench('prod mode', () => {
            compile(counterSrc, 'counter.pdx', [], undefined, { production: true });
        });
        expect(ops).toBeGreaterThan(100);
    });

    it('inline bindings compile speed', () => {
        const { ops } = bench('inline mode', () => {
            compile(counterSrc, 'counter.pdx', [], undefined, { production: true, inlineBindings: true });
        });
        expect(ops).toBeGreaterThan(100);
    });

    it('production mode is not significantly slower than dev', () => {
        const dev = bench('dev (compare)', () => {
            compile(counterSrc, 'counter.pdx', [], undefined, { production: false });
        });
        const prod = bench('prod (compare)', () => {
            compile(counterSrc, 'counter.pdx', [], undefined, { production: true });
        });
        // Prod may be slightly slower due to extra passes, but should be within 3x
        expect(prod.avg).toBeLessThan(dev.avg * 3);
    });
});
