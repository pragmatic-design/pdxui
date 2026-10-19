// A top-level const or let with a type annotation reaches the template, like one without (#44).
//
// The declaration rule matched `const NAME =` only, so `const BASE_SORT: SortDescriptor[] = […]`
// was never in the setup's return. The template path then bound `ctx.BASE_SORT` — undefined, in
// silence: the showcase's ticket grid never received its base sort. The inline path, the production
// default, read it as a signal and threw at mount (`e.BASE_SORT is not a function`), which is how it
// was found: the showcase's /tickets rendered nothing once it was built the default way.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (decl: string) =>
    `<template>\n  <i :a="NAME"></i>\n</template>\n<script lang="ts">\n${decl}\n</script>`;

const build = (decl: string) =>
    compile(src(decl), 'C:/x/typed.pdx', [], undefined, { production: true }).code;

describe('a typed top-level declaration is returned to the template', () => {
    for (const decl of [
        "const NAME: string[] = ['x'];",
        "let NAME: number = 1;",
        "const NAME: Record<string, (a: number) => void> = {};",
    ]) {
        it(`${decl} — in the setup's return`, () => {
            expect(build(decl)).toMatch(/return \{[^}]*\bNAME\b/);
        });

        it(`${decl} — read as a value in the render, not called`, () => {
            const code = build(decl);
            expect(code).toContain('ctx.NAME;');
            expect(code).not.toContain('ctx.NAME()');
        });
    }

    it('control — an untyped const was already returned', () => {
        expect(build("const NAME = ['x'];")).toMatch(/return \{[^}]*\bNAME\b/);
    });
});
