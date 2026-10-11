// `@fetch` options and `@form` rules get what the rest of the script gets (#203).
//
// - `@fetch … { enabled: () => ready }` copied the options as written: `ready` was a bare name the
//   module does not have, a ReferenceError at run time.
// - `@form` imported every rule name from @pdxui/core — a custom rule too, which core does not export
//   — and none of the rules of an object's sub-fields.
// - A schema or a `validate` declared as a `const` in the script was read by `createForm` before it was
//   initialised: forms were emitted before the body.
// - A `@fetch` whose options block went on to the next line lost it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
const coreImports = (code: string): string[] =>
    (code.match(/^import \{([^}]*)\} from '@pdxui\/core';$/m)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);
/** Does the emitted module parse? Imports stripped: illegal in a function body, and not the point. */
function parses(code: string): boolean {
    new Function(code.replace(/^\s*import\b.*$/gm, ''));
    return true;
}

describe('@fetch options', () => {
    it('read signals and props like any script expression', () => {
        const { code } = compile(pdx("@prop live: boolean = true;\nlet ready = $signal(false);\n@fetch users: 'GET /api/users' as string[] { enabled: () => ready && live, staleTime: 0 };"), 'f.pdx');
        expect(code).toContain('enabled: () => __ready() && live()');
    });

    it('a signal read only in the options is not reported unused', () => {
        const r = compile(pdx("let ready = $signal(false);\n@fetch users: 'GET /api/users' as string[] { enabled: () => ready };", '<p>{{ users.data() }}</p>'), 'f3.pdx');
        expect(r.warnings.filter((w) => w.message.includes("'ready'")).map((w) => w.code)).toEqual([]);
    });

    it('a declaration whose options go on to the next lines keeps them', () => {
        const r = compile(pdx("let ready = $signal(false);\n@fetch users: 'GET /api/users' as string[] {\n  enabled: () => ready,\n  staleTime: 0,\n};\nfunction go() { ready = true; }"), 'f2.pdx');
        expect(codes(r)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain('enabled: () => __ready()');
        expect(r.code).toContain('staleTime: 0');
    });
});

describe('@form rules', () => {
    it('a rule core exports is imported from core', () => {
        const { code } = compile(pdx('@form f: { name: string { required, minLength: 2 } };\nfunction send() { f.handleSubmit(() => {}); }'), 'r1.pdx');
        expect(coreImports(code)).toEqual(expect.arrayContaining(['required', 'minLength']));
    });

    it('a rule the script declares is called, not imported from core', () => {
        const r = compile(pdx("@form f: { name: string { required, shout } };\nfunction shout() { return (v) => (String(v).toUpperCase() === v ? null : 'shout it'); }\nfunction send() { f.handleSubmit(() => {}); }"), 'r2.pdx');
        expect(coreImports(r.code)).not.toContain('shout');
        expect(r.code).toContain('shout()');
        expect(codes(r)).not.toContain('PDX_FORM_UNKNOWN_RULE');
    });

    it('a rule neither core nor the script has is PDX_FORM_UNKNOWN_RULE', () => {
        const r = compile(pdx('@form f: { name: string { required, shout } };\nfunction send() { f.handleSubmit(() => {}); }'), 'r3.pdx');
        expect(codes(r)).toContain('PDX_FORM_UNKNOWN_RULE');
        expect(coreImports(r.code)).not.toContain('shout');
    });

    it("a script function named like a core rule replaces it, and core's is not imported", () => {
        const { code } = compile(pdx("@form f: { mail: string { email } };\nfunction email() { return (v) => (String(v).endsWith('.it') ? null : 'Italian only'); }\nfunction send() { f.handleSubmit(() => {}); }"), 'r5.pdx');
        expect(coreImports(code)).not.toContain('email');
        expect(parses(code)).toBe(true);
    });

    it("an object's sub-field rules are imported", () => {
        const { code } = compile(pdx('@form f: { address: { city: string { minLength: 2 } } };\nfunction send() { f.handleSubmit(() => {}); }'), 'r4.pdx');
        expect(coreImports(code)).toContain('minLength');
    });
});

describe('a form is created after what it reads', () => {
    const at = (code: string, s: string) => { const i = code.indexOf(s); expect(i, `${s} is not in the module`).toBeGreaterThan(-1); return i; };

    it('a schema declared above the @form', () => {
        const { code } = compile(pdx("const Schema = { '~standard': { version: 1, vendor: 'x', validate: (v) => ({ value: v }) } };\n@form f: Schema;\nfunction send() { f.handleSubmit(() => {}); }"), 's1.pdx');
        expect(at(code, 'const f = createForm(')).toBeGreaterThan(at(code, 'const Schema ='));
    });

    it('a schema declared below the @form', () => {
        const { code } = compile(pdx("@form f: Schema;\nconst Schema = { '~standard': { version: 1, vendor: 'x', validate: (v) => ({ value: v }) } };\nfunction send() { f.handleSubmit(() => {}); }"), 's2.pdx');
        expect(at(code, 'const f = createForm(')).toBeGreaterThan(at(code, 'const Schema ='));
    });

    it('a validate rule declared as a const', () => {
        const { code } = compile(pdx("@form f: { a: string, b: string } { validate: same }\nconst same = (v) => (v.a === v.b ? {} : { b: 'differs' });\nfunction send() { f.handleSubmit(() => {}); }"), 's3.pdx');
        expect(at(code, 'const f = createForm(')).toBeGreaterThan(at(code, 'const same ='));
    });

    it('a custom rule declared as a const', () => {
        const { code } = compile(pdx("@form f: { name: string { shout } };\nconst shout = () => (v) => null;\nfunction send() { f.handleSubmit(() => {}); }"), 's4.pdx');
        expect(at(code, 'const f = createForm(')).toBeGreaterThan(at(code, 'const shout ='));
    });

    it('control — a form that reads nothing of the script stays ahead of the body', () => {
        const { code } = compile(pdx("@form f: { name: string { required } };\nconst label = 'x';\nfunction send() { f.handleSubmit(() => {}); }"), 's5.pdx');
        expect(at(code, 'const f = createForm(')).toBeLessThan(at(code, 'const label ='));
    });
});
