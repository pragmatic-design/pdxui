// Three script forms that compiled, with no diagnostic, into something other than what was written
// (#202).
//
// 1. `$derived(a * 2,)` — a trailing comma, valid JavaScript — became `computed(() => a * 2,, …)`,
//    a module that does not parse; the rewriter's PDX_REWRITE_FALLBACK went to the console only.
// 2. `@event pdx-change: number;` declared an event named `pdx`: the name was read as `\w+`.
// 3. `let state = $store({ … })` became `const state = store(…)`, and reassigning it threw.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateDerivedDeclarations } from '../src/compiler/signal-rewrite';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;

/** Does the emitted module parse? Imports stripped: illegal in a function body, and not the point. */
function parses(code: string): boolean {
    new Function(code.replace(/^\s*import\b.*$/gm, ''));
    return true;
}

describe('a $derived with a trailing comma', () => {
    it('compiles to a module that parses, reading the signal', () => {
        const { code } = compile(pdx('let a = $signal(1);\nconst d = $derived(a * 2,);', '<p>{{ d }}</p>'), 'trailing.pdx');
        expect(parses(code)).toBe(true);
        expect(code).toMatch(/computed\(\(\) => __a\(\) \* 2[,)]/);
    });

    it('a $signal and a $store with one too', () => {
        const { code } = compile(pdx('let a = $signal(1,);\nlet s = $store({ n: 1 },);', '<p>{{ a }} {{ s.n }}</p>'), 'trailing2.pdx');
        expect(parses(code)).toBe(true);
    });

    it('a derived the rewriter cannot read reports PDX_REWRITE_FALLBACK to the sink it is given', () => {
        const findings: { code: string }[] = [];
        generateDerivedDeclarations([{ name: 'd', expr: 'a * (' }], new Set(['a']), undefined, '', false, findings);
        expect(findings.map((f) => f.code)).toContain('PDX_REWRITE_FALLBACK');
    });
});

describe('an @event name that is not an identifier', () => {
    it('is PDX_MALFORMED_EVENT, not an event named after its first word', () => {
        const { code, warnings } = compile(pdx('@event pdx-change: number;'), 'evt.pdx');
        expect(warnings.map((w) => w.code)).toContain('PDX_MALFORMED_EVENT');
        expect(code).not.toContain("ctx.emit('pdx'");
    });

    it('the hint says the name is the function that dispatches it, and names no removed form (#138)', () => {
        const { warnings } = compile(pdx('@event pdx-change: number;'), 'evt3.pdx');
        const hint = warnings.find((w) => w.code === 'PDX_MALFORMED_EVENT')?.hint ?? '';
        expect(hint).toContain('change(value)');
        expect(hint).not.toContain('$emit');
    });

    it('control — an identifier name declares its emitter', () => {
        const { code, warnings } = compile(pdx('@event changed: number;'), 'evt2.pdx');
        expect(warnings.map((w) => w.code)).not.toContain('PDX_MALFORMED_EVENT');
        expect(code).toContain("ctx.emit('changed'");
    });
});

describe('a $store declared with let', () => {
    it('keeps let, so it can be assigned again', () => {
        const { code } = compile(pdx('let state = $store({ n: 1 });\nfunction reset() { state = { n: 0 }; }'), 'store-let.pdx');
        expect(code).toMatch(/\blet state = store\(/);
    });

    it('control — const stays const', () => {
        const { code } = compile(pdx('const state = $store({ n: 1 });'), 'store-const.pdx');
        expect(code).toMatch(/\bconst state = store\(/);
    });
});
