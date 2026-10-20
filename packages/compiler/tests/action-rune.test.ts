// `@action name(param[: Type][, { signal }]) [when expr] [with { options }] { body }` — a declared
// write, compiled to `mutation()` (#501). The body may span lines; `when` becomes `enabled`; the
// options are `mutation()`'s, and an unknown one — or a `concurrency` outside the four — is
// PDX_ACTION_UNKNOWN_OPTION on the declaration.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const file = (script: string, template = '<pdx-button @click="save.execute(draft)">Save</pdx-button>') =>
    `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
const run = (script: string, template?: string) => compile(file(script, template), 'editor.pdx');
const codes = (script: string) => run(script).warnings.map((w) => w.code);

describe('@action — compiled to mutation()', () => {
    it('a one-line action is a mutation() whose fn runs the body, and the template reaches it', () => {
        const { code, warnings } = run("import { api } from './api';\nlet draft = $signal('');\n@action save(dto: string) { await api.save(dto); }");
        expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
        expect(warnings.map((w) => w.code)).not.toContain('PDX_UNDECLARED_REF');
        // The parameter's type is erased to spaces, which keep the columns.
        expect(code).toMatch(/const save = mutation\(\{ fn: async \(dto\s*\) => \{ await api\.save\(dto\); \}/);
        expect(code).toMatch(/import\s*\{[^}]*\bmutation\b[^}]*\}\s*from '@pdxui\/core'/);
    });

    it('a body over several lines is read to its closing brace, and signal writes in it are rewritten', () => {
        const { code } = run("let draft = $signal('');\nlet saved = $signal(0);\n@action save(dto: string) {\n  await Promise.resolve(dto);\n  saved++;\n}\nconst after = 1;");
        expect(code).toContain('__saved.set(');
        expect(code).toMatch(/const after = 1/);
    });

    it('{ signal } is the second parameter of fn, as written', () => {
        const { code } = run("let draft = $signal('');\n@action save(dto: string, { signal }) { await fetch('/x', { signal }); }");
        expect(code).toMatch(/fn: async \(dto\s*, \{ signal \}\) =>/);
    });

    it('when cond is enabled: () => cond, read as the rest of the script reads it', () => {
        const { code } = run("let draft = $signal('');\nlet ok = $signal(true);\n@action save(dto: string) when ok { await Promise.resolve(dto); }");
        expect(code).toMatch(/enabled: \(\) => \(__ok\(\)\)/);
    });

    it("with { invalidate: ['GET:/api/users'] } passes the matcher unchanged", () => {
        const { code, warnings } = run("let draft = $signal('');\n@action save(dto: string) with { invalidate: ['GET:/api/users'], concurrency: 'drop' } { await Promise.resolve(dto); }");
        expect(warnings.map((w) => w.code)).not.toContain('PDX_ACTION_UNKNOWN_OPTION');
        expect(code).toContain("invalidate: ['GET:/api/users']");
        expect(code).toContain("concurrency: 'drop'");
    });

    it('an unknown option is PDX_ACTION_UNKNOWN_OPTION on the declaration, with the options as its hint', () => {
        const [w, ...rest] = run("let draft = $signal('');\n@action save(dto: string) with { retries: 2 } { await Promise.resolve(dto); }")
            .warnings.filter((x) => x.code === 'PDX_ACTION_UNKNOWN_OPTION');
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 4 });
        expect(w.message).toContain('retries');
        expect(w.hint).toContain('invalidate');
    });

    it("so is a concurrency outside 'queue' | 'drop' | 'coalesce' | 'parallel'", () => {
        expect(codes("let draft = $signal('');\n@action save(dto: string) with { concurrency: 'later' } { await Promise.resolve(dto); }"))
            .toContain('PDX_ACTION_UNKNOWN_OPTION');
    });

    it('control — an action with no options raises nothing', () => {
        expect(codes("let draft = $signal('');\n@action save(dto: string) { await Promise.resolve(dto); }")
            .filter((c) => c.startsWith('PDX_ACTION') || c === 'PDX_UNKNOWN_DECLARATION')).toEqual([]);
    });
});
