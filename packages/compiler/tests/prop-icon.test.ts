// `@prop(icon) emptyIcon: string = 'inbox';` (#1317): a prop whose value names an icon, the .pdx form
// of a TypeScript component's `prop('inbox', { iconName: true })`. The analyzer marks it; the library's
// manifest writes `iconName: true` from the mark (packages/ui/tests/unit/gen-manifest-internal.test.ts),
// and the compiler imports the icon a consumer names in it (icon-imports.ts), as for any library prop.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { scriptDocComments } from '../src/compiler/component-docs';
import { validateDeclarations } from '../src/compiler/validate-declarations';
import { parseSFC } from '../src/parser/sfc';
import { propRequired } from '../src/language/prop-required';

const pdx = (script: string) => `<template><p>{{ emptyIcon }}</p></template>\n<script>\n${script}\n</script>`;

describe('a prop that names an icon (#1317)', () => {
    it('@prop(icon) is a prop like any other, marked as naming an icon', () => {
        const a = analyzeScript("@prop(icon) emptyIcon: string = 'inbox';", 'test.pdx');
        expect(a.warnings).toEqual([]);
        expect(a.props).toEqual([expect.objectContaining({ name: 'emptyIcon', tsType: 'string', default: "'inbox'", icon: true })]);
    });

    it('a plain @prop is not marked', () => {
        const a = analyzeScript("@prop label: string = '';", 'test.pdx');
        expect(a.props[0]).not.toHaveProperty('icon');
    });

    it('an optional or required icon prop keeps its own meaning', () => {
        const a = analyzeScript('@prop(icon) lead?: string;\n@prop(icon) trail: string;', 'test.pdx');
        expect(a.props.map(p => [p.name, p.icon, p.required ?? false])).toEqual([['lead', true, false], ['trail', true, true]]);
    });

    it('compiles to the same descriptor as the plain prop: the mark is the manifest\'s, not the runtime\'s', () => {
        const marked = compile(pdx("@prop(icon) emptyIcon: string = 'inbox';"), 'test.pdx');
        const plain = compile(pdx("@prop emptyIcon: string = 'inbox';"), 'test.pdx');
        expect((marked.warnings ?? []).filter(w => w.severity === 'error')).toEqual([]);
        expect(marked.code).toBe(plain.code);
    });

    it('an option other than icon is an error, not a line of the script', () => {
        const a = analyzeScript("@prop(colour) tint: string = '';", 'test.pdx');
        expect(a.props).toEqual([]);
        expect(a.warnings).toEqual([expect.objectContaining({ code: 'PDX_UNKNOWN_DECLARATION', severity: 'error' })]);
        expect(a.warnings[0].message).toMatch(/\(icon\)/);
    });

    it('its doc comment describes it, as one above a plain @prop does', () => {
        // The first doc comment of a script is the component's own; the prop's comes after it.
        const docs = scriptDocComments("/** A list. */\n/** The empty state's icon. */\n@prop(icon) emptyIcon: string = 'inbox';");
        expect(docs.declarations).toEqual([expect.objectContaining({ kind: 'prop', name: 'emptyIcon' })]);
    });

    it('declared twice, beside another declaration of its name, is said like a plain @prop', () => {
        const source = pdx("@prop(icon) emptyIcon: string = 'inbox';\nfunction emptyIcon() {}");
        const found = validateDeclarations(parseSFC(source), source);
        expect(found).toEqual([expect.objectContaining({ code: 'PDX_DUP_DECLARATION' })]);
        expect(found[0].message).toMatch(/@prop on line/);
    });

    it('a bare one is found by the required-prop migration, and keeps its option when fixed', () => {
        const source = pdx('@prop(icon) lead: string;');
        expect(propRequired.detect(source)).toHaveLength(1);
        const fix = propRequired.fix;
        if (typeof fix !== 'function') throw new Error('prop-required fixes the source, it does not only flag it');
        expect(fix(source)).toContain('@prop(icon) lead?: string;');
    });

    it('a finding on it points at its line, as on a plain @prop', () => {
        const source = pdx("@prop(icon) lead: string = 'a';\n@prop(icon) lead: string = 'b';");
        const dup = (compile(source, 'x.pdx').warnings ?? []).find(w => w.code === 'PDX_DUP_PROP');
        const lines = source.split('\n');
        expect(dup?.line).toBe(lines.indexOf("@prop(icon) lead: string = 'b';") + 1);
    });

    it('a model takes no (icon): only a prop is set by the parent to an icon name', () => {
        const a = analyzeScript("@model(icon) value: string = '';", 'test.pdx');
        expect(a.props).toEqual([]);
        expect(a.warnings).toEqual([expect.objectContaining({ code: 'PDX_UNKNOWN_DECLARATION', severity: 'error' })]);
    });
});
