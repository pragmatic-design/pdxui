// A member call on a rune name is not a rune, and says so (#1404).
//
// `$derived.by(() => …)` (Svelte 5's form) and `$effect.pre(…)` compiled with no diagnostic and
// reached the module as written: `$derived` names nothing at mount, and the component threw a
// ReferenceError. misplacedRunes read a call only when its callee was an identifier. Moving
// pdx-entity-grid to .pdx (#1210) found it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
const findings = (source: string, code: string) => compile(source, 'm.pdx').warnings.filter((w) => w.code === code);
/** The 1-based line of the first line of `source` that contains `text`. */
const lineOf = (source: string, text: string) => source.split('\n').findIndex((l) => l.includes(text)) + 1;

describe('PDX_RUNE_MEMBER', () => {
    const cases: [string, string, string, RegExp][] = [
        ['$derived.by as a declaration', '@prop n: number = 1;\nconst doubled = $derived.by(() => n * 2);', '$derived.by(', /\$derived\(\(\) => \{/],
        ['$effect.pre as a top-level statement', "let on = $signal(true);\n$effect.pre(() => { console.log(on); });", '$effect.pre(', /\$effect\(/],
        ['$signal.something inside a function', 'function f() { return $signal.raw(1); }', '$signal.raw(', /\$signal\(/],
        ['$watch.x', '$watch.immediate(() => 1, () => {});', '$watch.immediate(', /\$watch\(/],
        ['$store.x', 'const s = $store.frozen({ a: 1 });', '$store.frozen(', /\$store\(/],
    ];
    for (const [what, script, call, form] of cases) {
        it(`${what} is an error at the call, naming the PDX form`, () => {
            const source = pdx(script, '<p>{{ 1 }}</p>');
            const [w, ...rest] = findings(source, 'PDX_RUNE_MEMBER');
            expect(w, 'not reported').toBeDefined();
            expect(rest).toEqual([]);
            expect(w.severity).toBe('error');
            expect(w.line).toBe(lineOf(source, call));
            expect(source.split('\n')[w.line! - 1].slice(w.column! - 1).startsWith(call)).toBe(true);
            expect(w.message).toContain(call.slice(0, -1));
            expect(`${w.message} ${w.hint}`).toMatch(form);
            // Not also reported as a rune out of its position: it is not a rune at all.
            expect(findings(source, 'PDX_RUNE_POSITION')).toEqual([]);
        });
    }
});

describe('controls', () => {
    it('the runes in their position raise nothing', () => {
        const source = pdx("@prop n: number = 1;\nconst doubled = $derived(() => { return n * 2; });\nlet on = $signal(true);\n$effect(() => { console.log(on); });", '<p>{{ doubled }}</p>');
        expect(compile(source, 'm.pdx').warnings.filter((w) => w.severity === 'error')).toEqual([]);
    });

    it('a member read that is not called, and a rune name inside a string, raise nothing', () => {
        const source = pdx("const doc = 'use $derived.by(fn) in Svelte';\nconst other = { $derived: { by: (f: () => number) => f() } };\nconst v = other.$derived.by(() => 1);");
        expect(findings(source, 'PDX_RUNE_MEMBER')).toEqual([]);
    });
});
