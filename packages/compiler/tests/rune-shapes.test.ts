// Every declaration form the editor teaches is one the compiler reads.
//
// `RUNES` holds each rune's `shape` — what hover shows and the analyzer's "Use:" hint quotes — and
// its completion `snippet`. `@store`'s were `@store name = { count: 0 };`, a form the analyzer does
// not recognise: completion wrote an error into the file (#58).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { RUNES } from '../src/compiler/runes';

/** The shape as code: the trailing `// …` note dropped. */
const code = (shape: string): string => shape.replace(/\s+\/\/.*$/, '').trim();

/** The snippet as code: `${1:name}` → `name`, `${1|a,b|}` → `a`, a bare `$1` → nothing. */
const expand = (snippet: string): string => snippet
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, '$1')
    .replace(/\$\d+/g, '');

/** The codes a script of just `line` produces, in a component with an empty template. */
function codesOf(line: string): string[] {
    try {
        const r = compile(`<template><p></p></template>\n<script setup>\n${line}\n</script>\n`, 'rune-shape.pdx');
        return (r.warnings ?? []).map((w) => w.code);
    } catch (e) {
        return [`THREW ${String(e)}`];
    }
}

const decorators = RUNES.filter((r) => r.kind === 'decorator');

describe('the declaration forms the editor teaches', () => {
    it('there are declarations to check', () => {
        expect(decorators.length).toBeGreaterThan(20);
    });

    for (const r of decorators) {
        it(`@${r.name}: its shape is a declaration the compiler reads`, () => {
            expect(codesOf(code(r.shape)), code(r.shape)).not.toContain('PDX_UNKNOWN_DECLARATION');
        });

        it(`@${r.name}: so is what its completion writes`, () => {
            expect(codesOf(expand(r.snippet)), expand(r.snippet)).not.toContain('PDX_UNKNOWN_DECLARATION');
        });
    }

    it('control — a form the compiler does not read is reported, so the checks above can fail', () => {
        expect(codesOf('@store prefs = { dark: false };')).toContain('PDX_UNKNOWN_DECLARATION');
    });
});
