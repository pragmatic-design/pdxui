// A section of a form, written as its own .pdx, gets its named controls wired.
//
// `<pdx-form :form>` wires every named control of the SAME template: the pass walks one file's HTML
// (form-binding-boundary.test.ts holds that side). A section split into its own component is not
// seen by that pass, and wiring each control by hand through `useForm()` is the boilerplate rule 1
// says is a framework bug. A `.pdx` that calls `useForm()` or `tryUseForm()` declares "I am a
// section of the form above me", and the same pass runs over its template against that form,
// looked up by the binding itself (`tryUseForm(ctx.el)`), which tolerates a section that sets up
// before its `<pdx-form>`.
//
// The runtime half — the recipe's probe, `{ here: 'A', deep: 'A' }` — is
// packages/ui/tests/unit/form-section-runtime.test.ts.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (script: string, template: string) =>
    `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

const FIELD = '<pdx-form-field name="deep" label="Deep"><pdx-input name="deep"></pdx-input></pdx-form-field>';

describe('a section that calls useForm() is wired to the form above it', () => {
    it('useForm(): the named control and its field are bound through the injected form', () => {
        const { code } = compile(sfc("import { useForm } from '@pdxui/core';\nconst form = useForm();", FIELD), 'section.pdx');
        parses(code);
        expect(code, 'the control was not wired').toContain('tryUseForm(ctx.el)?.fields.deep?.onChange(');
        expect(code).toContain('tryUseForm(ctx.el)?.fields.deep?.onBlur()');
        expect(code, 'the field lost its error').toContain('tryUseForm(ctx.el)?.fields.deep?.error()');
        expect(code, 'tryUseForm is used but not imported').toMatch(/import \{[^}]*\btryUseForm\b[^}]*\} from '@pdxui\/core'/);
    });

    it('the production build\'s inline path emits the same lookup, as valid JS', () => {
        const { code } = compile(sfc("import { useForm } from '@pdxui/core';\nconst form = useForm();", FIELD),
            'section.pdx', [], undefined, { production: true, inlineBindings: true });
        parses(code);
        expect(code).toContain('tryUseForm(ctx.el)?.fields.deep?.onChange(');
        expect(code).toMatch(/import \{[^}]*\btryUseForm\b[^}]*\} from '@pdxui\/core'/);
    });

    it('tryUseForm() declares it too', () => {
        const { code } = compile(sfc("import { tryUseForm } from '@pdxui/core';\nconst form = tryUseForm();", FIELD), 'section.pdx');
        parses(code);
        expect(code).toContain('tryUseForm(ctx.el)?.fields.deep?.onChange(');
    });

    it('a field group inside the section prefixes the path, as in the form\'s own file', () => {
        const { code } = compile(sfc(
            "import { useForm } from '@pdxui/core';\nconst form = useForm();",
            '<pdx-field-group name="address"><pdx-input name="city"></pdx-input></pdx-field-group>',
        ), 'section.pdx');
        expect(code).toContain("tryUseForm(ctx.el)?.fields['address.city']?.onChange(");
    });

    it('a form drawn INSIDE the section keeps its own controls, and after it the section\'s form is back', () => {
        const { code } = compile(sfc(
            "import { useForm, createForm } from '@pdxui/core';\nconst form = useForm();\nconst inner = createForm({ initialValues: { x: '' } });",
            '<pdx-form :form="inner"><pdx-input name="x"></pdx-input></pdx-form><pdx-input name="after"></pdx-input>',
        ), 'section.pdx');
        expect(code, 'the inner form lost its control').toContain('ctx.inner.fields.x?.onChange(');
        expect(code, 'after the inner form, the section\'s form did not come back').toContain('tryUseForm(ctx.el)?.fields.after?.onChange(');
    });

    it('an explicit binding is kept, as in the form\'s own file', () => {
        const { code } = compile(sfc(
            "import { useForm } from '@pdxui/core';\nconst form = useForm();\nfunction mine(e) {}",
            '<pdx-input name="deep" @pdx-input="mine"></pdx-input>',
        ), 'section.pdx');
        expect(code).not.toContain('tryUseForm(ctx.el)?.fields.deep?.onChange(');
    });
});

describe('control — a file that does not declare it is unchanged', () => {
    it('no useForm(): a named control outside a <pdx-form> is not wired', () => {
        const { code } = compile(sfc('let n = $signal(0);', FIELD), 'plain.pdx');
        expect(code).not.toContain('tryUseForm(ctx.el)');
        expect(code).not.toContain('fields.deep');
    });

    it('useForm named in a comment is not a call', () => {
        const { code } = compile(sfc('// this section could call useForm() one day\nlet n = $signal(0);', FIELD), 'plain.pdx');
        expect(code).not.toContain('tryUseForm(ctx.el)');
    });

    it('useFormCoordinator() is another function', () => {
        const { code } = compile(sfc("import { useFormCoordinator } from '@pdxui/core';\nconst c = useFormCoordinator();", FIELD), 'plain.pdx');
        expect(code).not.toContain('tryUseForm(ctx.el)');
    });

    it('the form\'s own file compiles exactly as before: no injected lookup', () => {
        const { code } = compile(sfc(
            "import { createForm } from '@pdxui/core';\nconst f = createForm({ initialValues: { here: '' } });",
            '<pdx-form :form="f"><pdx-input name="here"></pdx-input></pdx-form>',
        ), 'owner.pdx');
        expect(code).toContain('ctx.f.fields.here?.onChange(');
        expect(code).not.toContain('tryUseForm(ctx.el)');
    });
});
