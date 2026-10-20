// An `export` in a component's script (#551). The script is the body of `setup(ctx)`, run once per
// instance, where an `export` is a syntax error: the module failed to load in the browser, far from
// the line, and the compiler said nothing. It is PDX_SCRIPT_EXPORT on its line, and no `export` reaches
// the setup. A type export is erased like any type, and a @store module lifts its exports
// (PDX_STORE_EXPORT): neither is reported.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const file = (script: string) => `<template><p>{{ n }}</p></template>\n<script>\n${script}\n</script>\n`;
const run = (script: string) => compile(file(script), 'probe.pdx');
const reported = (script: string) => run(script).warnings.filter((w) => w.code === 'PDX_SCRIPT_EXPORT');

/** The setup function's body as emitted. */
const setupOf = (code: string): string => code.slice(code.indexOf('setup(ctx)'), code.indexOf('render:'));

describe('an export in a component script', () => {
    it('is PDX_SCRIPT_EXPORT on its line, an error', () => {
        const [w, ...rest] = reported("let n = $signal(0);\nexport const answer = 42;");
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 4 });
        expect(w.hint).toContain('module');
    });

    it('does not reach the setup, where it is a syntax error', () => {
        const { code } = run("let n = $signal(0);\nexport const answer = 42;");
        expect(setupOf(code)).not.toMatch(/\bexport\b/);
    });

    it('every value form: a function, a class, a list, a default', () => {
        for (const line of ['export function f() { return 1; }', 'export class C {}', 'const a = 1;\nexport { a };', 'export default 1;']) {
            const script = `let n = $signal(0);\n${line}`;
            expect(reported(script), line).toHaveLength(1);
            expect(setupOf(run(script).code), line).not.toMatch(/\bexport\b/);
        }
    });

    it('control — the word in a string or a comment is not an export', () => {
        expect(reported("let n = $signal(0);\nconst s = 'export const x = 1';\n// export const y = 2;")).toEqual([]);
    });

    it('control — a type export is erased like any type, and not reported', () => {
        expect(reported('let n = $signal(0);\nexport interface Row { id: number }\nexport type Id = number;')).toEqual([]);
    });

    it('control — a .pdx.ts module is a module: its export stays, unreported', () => {
        const r = compile("let n = $signal(0);\nexport function bump() { n++; }\n", 'probe.pdx.ts');
        expect(r.warnings.filter((w) => w.code === 'PDX_SCRIPT_EXPORT')).toEqual([]);
        expect(r.code).toMatch(/^export function bump\(\)/m);
    });

    it('control — a @store module lifts its exports, and does not report them here', () => {
        const r = compile("<script>\n@store menu;\nlet s = $signal('a');\nexport const LABEL = 'Menu';\n</script>\n", 'menu.pdx');
        expect(r.warnings.filter((w) => w.code === 'PDX_SCRIPT_EXPORT')).toEqual([]);
    });
});
