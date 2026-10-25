// A $signal or $store initialiser that reads another $signal reads its value at setup time (#682).
//
// It was emitted as written: `let pinned = $signal(Array.from(picked))` became
// `signal(Array.from(picked), …)`, and `picked` lives in the module as `__picked`, so setup threw
// `picked is not defined`. A prop read there is `ctx.name.peek()`; a $signal read is now
// `__name.peek()`, its value at setup time, untracked.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import * as core from '../../core/src/index';

type Options = { setup: (ctx: Record<string, unknown>) => Record<string, unknown> };

/** Compiles `script` into a component and runs its setup against the real core. */
function run(script: string, props: Record<string, unknown> = {}) {
    const src = `<template><p></p></template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, 'init-probe.pdx', [], undefined, {});
    let options: Options | undefined;
    const fake = { ...core, component: (_tag: string, o: Options) => { options = o; } };
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(fake);
    const propSignals = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, core.signal(v)]));
    return { exposed: options!.setup({ ...propSignals, el: null, track: core.effect }), code };
}

describe('a $signal initialiser that reads another $signal', () => {
    it('reads its value at setup time', () => {
        const { exposed, code } = run([
            "let picked = $signal(new Set(['a']));",
            'let pinned = $signal(Array.from(picked));',
            'function read() { return pinned; }',
        ].join('\n'));
        expect(code).toContain('signal(Array.from(__picked.peek())');
        expect((exposed.read as () => string[])()).toEqual(['a']);
    });

    it('a $store initialiser too', () => {
        const { exposed } = run([
            'let first = $signal(3);',
            'let s = $store({ count: first });',
            'function read() { return s.count; }',
        ].join('\n'));
        expect((exposed.read as () => number)()).toBe(3);
    });

    it('a parameter of the same name inside it is the parameter', () => {
        // The rewrite is scope-aware: `picked` inside `picked => picked.id` is the arrow's own.
        const { exposed } = run([
            "let picked = $signal([{ id: 'a' }]);",
            'let ids = $signal(picked.map(picked => picked.id));',
            'function read() { return ids; }',
        ].join('\n'));
        expect((exposed.read as () => string[])()).toEqual(['a']);
    });

    it('control — a prop in the same position is still ctx.name.peek()', () => {
        const { code, exposed } = run('@prop start: number = 1;\nlet n = $signal(start + 1);\nfunction read() { return n; }', { start: 4 });
        expect(code).toContain('signal(ctx.start.peek() + 1');
        expect((exposed.read as () => number)()).toBe(5);
    });
});
