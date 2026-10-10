// `@params` and `@search` say so when they cannot read a field (#105). Both parsers skipped what
// they did not recognise, in silence: a type written in quotes, `@params { id: 'number' }`, declared
// nothing, and the rune list the editor shows taught exactly that form. A block written over several
// lines was not read at all, since both runes were read on their first line only.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { RUNES } from '../src/compiler/runes';
import type { ValidationWarning } from '../src/compiler/validate';

function pdx(script: string): string {
    return `<template>\n  <p>x</p>\n</template>\n<script setup>\n@page '/users/:id';\n${script}\n</script>\n`;
}

function run(script: string) {
    const source = pdx(script);
    const out = compile(source, 'route-probe.pdx');
    return { source, code: out.code, warnings: out.warnings };
}

function applyFix(source: string, edits: { start: number; end: number; newText: string }[]): string {
    let out = source;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    return out;
}

const invalid = (warnings: ValidationWarning[]) => warnings.filter((w) => w.code === 'PDX_ROUTE_FIELD_INVALID');

describe('@params and @search fields', () => {
    it('a quoted type in @params is an error, with the unquoted form as its fix', () => {
        const { source, warnings } = run("@params { id: 'number' };");
        const [w] = invalid(warnings);
        expect(w, 'no PDX_ROUTE_FIELD_INVALID').toBeDefined();
        expect(w.severity).toBe('error');
        expect(w.fix, 'no fix proposed').toBeDefined();
        expect(applyFix(source, w.fix!.edits)).toBe(pdx('@params { id: number };'));
    });

    it('a quoted type in @search is an error, with the unquoted form as its fix', () => {
        const { source, warnings } = run('@search { q: "string" };');
        const [w] = invalid(warnings);
        expect(w).toBeDefined();
        expect(applyFix(source, w.fix!.edits)).toBe(pdx('@search { q: string };'));
    });

    it('a type @search cannot read is an error with no fix', () => {
        const [w] = invalid(run('@search { when: Date };').warnings);
        expect(w).toBeDefined();
        expect(w.fix).toBeUndefined();
    });

    it('the unquoted forms are read, with no finding', () => {
        const { code, warnings } = run('@params { id: number };\n@search { q?: string, page: number = 1 };');
        expect(invalid(warnings)).toEqual([]);
        expect(code).toContain('Number(__routeParams()?.id ?? 0)');
        expect(code).toContain("__sp.get('q')");
        expect(code).toContain("__sp.get('page')");
    });

    it('reads a @search block written over several lines', () => {
        const { code, warnings } = run('@search {\n    page: number = 1,\n    q?: string\n};');
        expect(invalid(warnings)).toEqual([]);
        expect(code).toContain("__sp.get('page')");
        expect(code).toContain("__sp.get('q')");
    });

    it('reads a @params block written over several lines', () => {
        const { code, warnings } = run('@params {\n    id: number\n};');
        expect(invalid(warnings)).toEqual([]);
        expect(code).toContain('Number(__routeParams()?.id ?? 0)');
    });

    it('the rune list teaches forms that compile with no finding', () => {
        for (const name of ['params', 'search']) {
            const rune = RUNES.find((r) => r.name === name)!;
            expect(rune.shape, `${name}: the shape still quotes its type`).not.toMatch(/:\s*['"]/);
            expect(invalid(run(`${rune.shape};`).warnings), `${name}: ${rune.shape}`).toEqual([]);
        }
    });
});
