// Compile-time scaling baseline (audit P1/P2).
// Characterizes how compilation scales with component size and guards against
// regression in the realistic range (≤ ~200 declarations per component).
//
// Scaling note: setup-body rewriting is now a single TypeScript parse + one AST walk
// (rewriteAst), so signal/callable rewriting is ~O(n) in source size rather than the old
// per-signal regex passes. This test guards against re-introducing super-linear behaviour.

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/plugin';

function genComponent(n: number): string {
    const sigs: string[] = [];
    const tpl: string[] = [];
    for (let i = 0; i < n; i++) {
        sigs.push(`  let s${i} = $signal(${i});`);
        sigs.push(`  const d${i} = $derived(s${i} * 2);`);
        sigs.push(`  function inc${i}() { s${i}++; }`);
        tpl.push(`    <span class="v${i}">{{ s${i} }} {{ d${i} }}</span>`);
    }
    return `<template>\n  <div>\n${tpl.join('\n')}\n  </div>\n</template>\n<script setup>\n@prop title: string = 'x';\n${sigs.join('\n')}\n</script>`;
}

function timeCompile(src: string, iterations = 5): number {
    for (let i = 0; i < 2; i++) compile(src, 'scale.pdx'); // warm
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        compile(src, 'scale.pdx');
        times.push(performance.now() - start);
    }
    return Math.min(...times);
}

describe('compile-time scaling (P1)', () => {
    // The AST rewriter (one parse + one walk) keeps compilation ~O(n): a 500-declaration
    // component compiles in a few ms. This test guards linearity — super-linear behaviour
    // would make per-declaration cost grow with N.
    it('scales ~linearly with declaration count (no O(n²))', () => {
        let ms500 = 0;
        for (const n of [50, 250, 500]) {
            const ms = timeCompile(genComponent(n));
            if (n === 500) ms500 = ms;
            console.log(`  ⏱ ${n} decls (×3 each): best=${ms.toFixed(2)}ms (${(ms / n * 1000).toFixed(1)}µs/decl)`);
        }
        // Absolute guard (robust under v8 coverage instrumentation, which distorts
        // per-decl ratios): linear compilation of 500 declarations is ~15ms (≤150ms
        // even instrumented). A return to O(n²) was ~1230ms — this cleanly catches it.
        expect(ms500).toBeLessThan(600);
    });
});
