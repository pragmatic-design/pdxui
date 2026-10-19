// Silent script misreadings become errors (#278; decisions 12 and 14; docs/language/beta/script.md →
// «The script and its rewrite», data.md → «@store, $store — one rule added»).
//
// - A `$` rune outside its position was left as written — `$signal` names nothing when the function
//   runs — or, an `$effect` inside an `if`, lifted out of the block and run unconditionally. It is
//   PDX_RUNE_POSITION at the call, naming the core function for that place.
// - `@store` read any word as `persist` and kept the store in sessionStorage for anything but
//   'local'. A value other than 'local' or 'session' is PDX_UNKNOWN_DECLARATION.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { positionWarnings } from '../src/compiler/position-warnings';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { runePosition, storePersist } from '../src/language/script-misreadings';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
const findings = (source: string, code: string) => compile(source, 'm.pdx').warnings.filter((w) => w.code === code);
/** The 1-based line of the first line of `source` that contains `text`. */
const lineOf = (source: string, text: string) => source.split('\n').findIndex((l) => l.includes(text)) + 1;

describe('PDX_RUNE_POSITION', () => {
    const cases: [string, string, string, string][] = [
        ['$signal inside a function body', "function reset() {\n  let draft = $signal('');\n  return draft;\n}", "$signal('')", 'signal(…)'],
        ['$derived inside an arrow callback', 'const items = [1, 2].map((n) => $derived(n * 2));', '$derived(n * 2)', 'computed(…)'],
        ['$effect inside an if block', "let on = $signal(true);\nif (on) {\n  $effect(() => { console.log(on); });\n}", '$effect(', 'effect(…)'],
        ['$watch inside a handler', 'const handler = () => { $watch(() => 1, () => {}); };', '$watch(', 'watch(…)'],
        ['$store wrapped in a call', 'const state = Object.freeze($store({ a: 1 }));', '$store(', 'store(…)'],
    ];
    for (const [what, script, call, fn] of cases) {
        it(`${what} is an error at the call, naming ${fn}`, () => {
            const source = pdx(script);
            const [w, ...rest] = findings(source, 'PDX_RUNE_POSITION');
            expect(w, 'not reported').toBeDefined();
            expect(rest).toEqual([]);
            expect(w.severity).toBe('error');
            expect(w.line).toBe(lineOf(source, call));
            expect(source.split('\n')[w.line! - 1].slice(w.column! - 1).startsWith(call.slice(0, call.indexOf('(')))).toBe(true);
            expect(w.hint).toContain(fn);
            expect(w.hint).toContain('@pdxui/core');
            // The only finding: no PDX_UNKNOWN_DECLARATION for the same call besides.
            expect(compile(source, 'm.pdx').warnings.filter((x) => x.severity === 'error').map((x) => x.code)).toEqual(['PDX_RUNE_POSITION']);
        });
    }

    it('the $effect inside an if is not lifted out of it', () => {
        const { code } = compile(pdx("let on = $signal(true);\nif (on) {\n  $effect(() => { console.log(on); });\n}"), 'm.pdx');
        expect(code).not.toMatch(/^\s*effect\(/m);
    });

    it('control — every rune in its position reports nothing', () => {
        const source = pdx("let a = $signal(1), b = $signal<number>(2);\nconst d = $derived((a + b) * 2);\nlet s = $store({ items: [] });\n$effect(() => { console.log(d); });\n$watch(() => a, () => {});\nfunction f() { return a + 1; }");
        expect(compile(source, 'm.pdx').warnings.filter((w) => w.severity !== 'info').map((w) => w.code)).toEqual([]);
    });

    it('control — a rune inside a declaration block or a string is not a call', () => {
        const source = pdx("@raw { const x = $signal(1); }\nconst note = 'write $signal(0) at the top';");
        expect(findings(source, 'PDX_RUNE_POSITION')).toEqual([]);
    });
});

describe('@store persist', () => {
    it("a value other than 'local' or 'session' is PDX_UNKNOWN_DECLARATION, at the declaration", () => {
        const source = pdx("@store cart { persist: 'locale' };\nlet state = $store({ items: [] });");
        const [w, ...rest] = positionWarnings(source, findings(source, 'PDX_UNKNOWN_DECLARATION'));
        expect(rest).toEqual([]);
        expect(w.severity).toBe('error');
        expect(w.hint).toContain("'local' or 'session'");
        expect(w.line).toBe(lineOf(source, '@store cart'));
    });

    it('the store is not cast to a storage it did not ask for', () => {
        expect(analyzeScript("@store cart { persist: 'locale' };\nlet state = $store({ items: [] });", 'cart.pdx').globalStore?.persist).toBeUndefined();
    });

    it("control — 'local' and 'session' report nothing", () => {
        for (const p of ['local', 'session']) {
            const r = compile(pdx(`@store cart { persist: '${p}' };\nlet state = $store({ items: [] });`), 'cart.pdx');
            expect(r.warnings.filter((w) => w.severity !== 'info').map((w) => w.code), p).toEqual([]);
        }
    });
});

describe('pdx migrate', () => {
    it('lists both, and rewrites neither: the author chooses', () => {
        const source = pdx("@store cart { persist: 'locale' };\nfunction reset() {\n  let draft = $signal('');\n}");
        expect(runePosition.fix).toBe('flag');
        expect(storePersist.fix).toBe('flag');
        expect(runePosition.detect(source)).toEqual([{ line: lineOf(source, '$signal'), found: "$signal('')" }]);
        expect(storePersist.detect(source)).toEqual([{ line: lineOf(source, '@store'), found: "@store cart { persist: 'locale' }" }]);
    });
});
