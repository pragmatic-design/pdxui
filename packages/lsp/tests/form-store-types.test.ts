// The editor sees an `@form` as the form it compiles to, and an `@store` name as what it is.
//
// The projection declared both `any` (#58). `@form profile: { name: string }` compiles to
// `createForm({ initialValues: { name: '' } })`, so `profile.values.name` — a member Form does not
// have — read `undefined` at runtime with no word from the editor. `@store prefs;` names a store
// MODULE: it makes no `prefs` variable (the module exports `usePrefs()`), so a script reading
// `prefs` throws a ReferenceError, and `var prefs: any` hid it.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
// Inside an application, as a real .pdx is: a flat form is typed as core's own Form, resolved from
// the file's place, and the repository root has no @pdxui/core to resolve.
const URI = pathToFileURL(join(ROOT, 'packages', 'showcase', 'src', 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

/** The TS diagnostics of a .pdx made of `script` and `template`, as the server computes them. */
function diagnose(script: string, template = ''): string[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, template ? parseTemplate(template, 1) : [], template || null, template ? '<template>'.length : -1);
    return getTsDiagnostics(svc, URI, vf, source).map(d => d.message.split('\n')[0]);
}

const PROFILE = '@form profile: { name: string { required }, age: number, admin: boolean, skills: string[] };\n';

// The language service's cold start — the lenient program and the strict one that checks the template
// (#468) — paid here with a timeout of its own, not by the first `it` against vitest's 5s.
beforeAll(() => { diagnose('let x = 1;', '<p>{{ x }}</p>'); }, 60_000);

// #613: a section's inherited form is core's Form of the values its declaration names.
describe('an inherited @form (from parent)', () => {
    const SECTION = 'type Values = { email: string; address: { city: string } };\n@form f: Values from parent;\n';

    it('a field the values do not declare is an error', () => {
        const d = diagnose(SECTION, '<p>{{ f.emial.value() }}</p>');
        expect(d.some(m => /emial/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it("control — the declared fields read, a nested one by its path, and the form's own members", () => {
        expect(diagnose(SECTION, "<p>{{ f.email.value() }} {{ f['address.city'].error() }} {{ f.valid() }}</p>")).toEqual([]);
    });
});

describe('an inline @form', () => {
    it('a member Form does not have is an error', () => {
        const d = diagnose(PROFILE, '<p>{{ profile.values.name }}</p>');
        expect(d.some(m => /values/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('a field that is not declared is an error', () => {
        const d = diagnose(PROFILE + 'function f() { return profile.nmae.value(); }');
        expect(d.some(m => /nmae/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('each field has the type it was declared with', () => {
        const d = diagnose(PROFILE + 'function f() { const s: string = profile.age.value(); return s; }');
        expect(d.some(m => /number/.test(m) && /string/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('control — the surface a page uses is clean', () => {
        const uses = [
            'function f() {',
            '  const n: string = profile.name.value();',
            '  const a: number = profile.age.value();',
            '  const b: boolean = profile.admin.value();',
            '  const k: string[] = profile.skills.value();',
            '  profile.name.onChange("x"); profile.name.error(); profile.name.touched();',
            '  profile.valid(); profile.dirty(); profile.submitting(); profile.state(); profile.errors().name;',
            '  const v = profile.getValues(); const s: string = v.name;',
            '  profile.reset({ age: 3 }); profile.setValues({ name: "y" });',
            '  return [n, a, b, k, s];',
            '}',
            'const save = profile.handleSubmit(async (values) => { const x: number = values.age; });',
        ].join('\n');
        expect(diagnose(PROFILE + uses)).toEqual([]);
    });

    it('can be handed to a helper typed with core\'s Form, as four showcase pages do', () => {
        // A look-alike interface was not assignable to core's Form: TypeScript cannot relate
        // `array()`'s conditional return across two value types. A flat form IS core's Form.
        const helper = "import type { Form } from '@pdxui/core';\nfunction keep(form: Form<Record<string, unknown>>) { return form; }\n";
        expect(diagnose(helper + PROFILE + 'keep(profile);')).toEqual([]);
    });

    it('a nested form can be handed to a helper typed with core\'s Form of its values (#470)', () => {
        // Core's Form keys its fields as createForm flattens them, as the editor does: the two agree.
        const helper = "import type { Form } from '@pdxui/core';\n"
            + 'function keep(form: Form<{ name: string; address: { street: string }; lines: { qty: number }[] }>) { return form; }\n';
        const form = '@form o: { name: string, address: { street: string }, lines: [{ qty: number }] };\n';
        expect(diagnose(helper + form + 'keep(o);')).toEqual([]);
    });

    it('a nested object: dotted fields, nested values', () => {
        const form = '@form f: { address: { street: string, zip: number } };\n';
        expect(diagnose(form + 'function g() { const s: string = f["address.street"].value(); const z: number = f.getValues().address.zip; return [s, z]; }'))
            .toEqual([]);
        // `createForm` flattens it: there is no field called `address`.
        const d = diagnose(form + 'function g() { return f.address; }');
        expect(d.some(m => /address/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('rows: the array field, each row\'s dotted fields, and form.array()', () => {
        const form = '@form o: { customer: string, lines: [{ product: string, qty: number }] };\n';
        const uses = [
            'function g() {',
            '  const rows = o.getValues().lines; const p: string = rows[0].product;',
            '  const q: number = o["lines.0.qty"].value();',
            '  o.array("lines").append({ product: "a", qty: 1 }); o.array("lines").items();',
            '  return [p, q];',
            '}',
        ].join('\n');
        expect(diagnose(form + uses)).toEqual([]);
    });

    it('with options after the fields', () => {
        const form = "@form f: { starts: string, ends: string } { validate: (v) => (v.ends < v.starts ? { ends: 'x' } : {}) };\n";
        expect(diagnose(form + 'function g() { return f.ends.value(); }')).toEqual([]);
    });
});

describe('an @form on an external schema', () => {
    it('is a form whose fields are not known, not any', () => {
        const form = "import { formField } from '@pdxui/core';\nconst UserSchema = {};\n@form user: UserSchema;\n";
        // Its fields are not members the type knows: a name is read with formField (#128).
        expect(diagnose(form + "function g() { user.valid(); return formField(user, 'anything')?.value(); }")).toEqual([]);
        const d = diagnose(form + 'function g() { return user.nonsense; }');
        expect(d.some(m => /nonsense/.test(m)), JSON.stringify(d)).toBe(true);
    });
});

describe('@store', () => {
    it('names a store module, not a variable: reading the name is an error', () => {
        const d = diagnose("@store prefs;\nlet state = $store({ dark: false });\nfunction f() { return prefs.dark; }");
        expect(d.some(m => /prefs/.test(m)), `prefs still reads as a declared name — ${JSON.stringify(d)}`).toBe(true);
    });

    it('control — the store module itself is clean', () => {
        expect(diagnose("@store prefs { persist: 'local' };\nlet state = $store({ dark: false });\nfunction toggle() { state.dark = !state.dark; }"))
            .toEqual([]);
    });
});

describe('PdxForm follows core\'s Form', () => {
    /** The member names of `interface <name><…> { … }` in a source text. */
    function members(source: string, name: string): string[] {
        const at = new RegExp(`^([ \\t]*)(?:export\\s+)?interface ${name}<`, 'm').exec(source);
        expect(at, `interface ${name} not found`).not.toBeNull();
        const start = at!.index;
        // To ITS closing brace, at its own indentation: the next interface's members are not its.
        const body = source.slice(source.indexOf('{', start) + 1, source.indexOf(`\n${at![1]}}`, start));
        // Match: `readonly fields:` / `reset(…)` / `array<K …>(…)` at the start of a member line.   Groups: [1]=name
        return [...new Set([...body.matchAll(/^\s*(?:readonly\s+)?(\w+)\s*[(:<]/gm)].map(m => m[1]))];
    }
    const globals = readFileSync(join(ROOT, 'packages/lsp/src/utils/pdx-globals.ts'), 'utf-8');

    for (const [core, file, editor] of [
        ['FormMembers', 'packages/core/src/form/form.ts', 'PdxFormMembers'],
        ['FormField', 'packages/core/src/form/form.ts', 'PdxFormField'],
        ['FieldArray', 'packages/core/src/form/field-array.ts', 'PdxFieldArray'],
    ] as const) {
        it(`every member of ${core} is declared for the editor`, () => {
            const want = members(readFileSync(join(ROOT, file), 'utf-8'), core);
            expect(want.length).toBeGreaterThan(3);
            const have = members(globals, editor);
            expect(want.filter(m => !have.includes(m)), `members of ${core} the editor does not know`).toEqual([]);
        });
    }
});
