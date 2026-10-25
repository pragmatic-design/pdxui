// `.peek()` on a $derived or a prop reads it untracked, as it does on a $signal (#676).
//
// The rewrite turned `shown.peek()` into `shown().peek()`: the value read, then `.peek` asked of the
// value, which throws. Core's computed and a prop's signal both have their own `peek`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';
import * as core from '../../core/src/index';

const ast = (code: string, signals: string[], callables: string[]) =>
    rewriteAst(code, new Set(signals), new Set(callables), 'f.pdx');

type Options = { setup: (ctx: Record<string, unknown>) => Record<string, unknown> };

/** Compiles `script` into a component and runs its setup against the real core. */
function run(script: string, props: Record<string, unknown>) {
    const src = `<template><p></p></template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, 'peek-probe.pdx', [], undefined, {});
    let options: Options | undefined;
    const fake = { ...core, component: (_tag: string, o: Options) => { options = o; } };
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(fake);
    const propSignals = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, core.signal(v)]));
    const exposed = options!.setup({ ...propSignals, el: null, track: core.effect });
    return { exposed, props: propSignals, code };
}

describe('.peek() on a $derived or a prop', () => {
    it('is the signal\'s own method, not a method of its value', () => {
        expect(ast('const v = shown.peek();', ['items'], ['shown'])).toBe('const v = shown.peek();');
        expect(ast('const v = label.peek();', [], ['label'])).toBe('const v = label.peek();');
    });

    it('control — another member is still read through the value', () => {
        expect(ast('const n = shown.length;', [], ['shown'])).toBe('const n = shown().length;');
        expect(ast('const v = count.peek();', ['count'], [])).toBe('const v = __count.peek();');
    });

    it('reads the value without subscribing the effect it is in', () => {
        const { exposed, props, code } = run([
            '@prop label: string = "";',
            'let items = $signal([1, 2, 3]);',
            'const shown = $derived(items.filter(n => n > 1));',
            'let runs = 0;',
            'let seen = "";',
            '$effect(() => { runs++; seen = shown.peek().join(",") + "|" + label.peek(); });',
            'function grow() { items = [...items, 4]; }',
            'function stats() { return { runs, seen }; }',
        ].join('\n'), { label: 'a' });
        expect(code).toContain('shown.peek()');
        const stats = exposed.stats as () => { runs: number; seen: string };
        expect(stats()).toEqual({ runs: 1, seen: '2,3|a' });
        (exposed.grow as () => void)();
        (props.label as core.Signal<string>).set('b');
        expect(stats().runs, 'the effect re-ran: .peek() subscribed it').toBe(1);
    });

    it('control — the same effect reading shown without .peek() runs again when it changes', () => {
        const { exposed } = run([
            'let items = $signal([1, 2, 3]);',
            'const shown = $derived(items.filter(n => n > 1));',
            'let runs = 0;',
            '$effect(() => { runs++; shown.join(","); });',
            'function grow() { items = [...items, 4]; }',
            'function stats() { return runs; }',
        ].join('\n'), {});
        (exposed.grow as () => void)();
        expect((exposed.stats as () => number)()).toBe(2);
    });
});
