// Required props, and `?` for optional ones (#130), with TypeScript's rule: `@prop id: string;` is
// required, `@prop label: string = '';` optional with a default, `@prop hint?: string;` optional and
// undefined when absent. A parent that uses the component without a required prop is
// PDX_PROP_REQUIRED, at the tag; `pdx migrate` adds `?` to every `@prop` without a default, which
// keeps what existing code meant.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { LANGUAGE_CHANGES } from '../src/language/changes';
import { ComponentResolver } from '../src/component-resolver';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const child = (script: string) => `<template><p>x</p></template>\n<script setup>\n${script}\n</script>\n`;

describe('the three forms', () => {
    const { props, warnings } = (() => {
        const a = analyzeScript("@prop id: string;\n@prop label: string = '';\n@prop hint?: string;", 'card.pdx');
        return { props: a.props, warnings: a.warnings ?? [] };
    })();
    it('parse, with no missing-type error for `?`', () => {
        expect(props.map(p => p.name)).toEqual(['id', 'label', 'hint']);
        expect(warnings.filter(w => w.code === 'PDX_PROP_NO_TYPE')).toEqual([]);
    });
    it('a prop with no default and no `?` is required; the others are not', () => {
        expect(props.map(p => [p.name, p.required === true])).toEqual([['id', true], ['label', false], ['hint', false]]);
        expect(props.find(p => p.name === 'hint')?.tsType).toBe('string');
    });
    it('the descriptor marks the required one, which core reports in development when it is not set', () => {
        const { code } = compile(child("@prop id: string;\n@prop hint?: string;"), 'card.pdx');
        expect(code).toMatch(/id: \{ type: String, required: true \}/);
        expect(code).toMatch(/hint: \{ type: String \}/);
    });
    it('the .d.ts makes the required one required', () => {
        const dts = generateDts({ tag: 'pdx-card', props, events: [], slots: [] });
        expect(dts).toContain('  id: string;');
        expect(dts).toContain('  label?: string;');
        expect(dts).toContain('  hint?: string;');
    });
});

describe('PDX_PROP_REQUIRED', () => {
    const required = (tag: string) => (tag === 'app-card' ? new Set(['id', 'userName']) : null);
    const parent = (template: string) => compile(
        `<template>\n${template}\n</template>\n<script setup>\nlet i = $signal('1');\n</script>\n`,
        'page.pdx', [], undefined, { requiredPropsOf: required });
    const findings = (template: string) => parent(template).warnings.filter(w => w.code === 'PDX_PROP_REQUIRED');

    it('a use without a required prop is an error naming it, at the tag', () => {
        const [w, ...rest] = findings('<div>\n  <app-card :id="i"></app-card>\n</div>');
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 3, column: 3 });
        expect(w.message).toContain("'userName'");
        expect(w.message).toContain('<app-card>');
    });
    it('an attribute, a binding, a kebab-case name and a one-time binding each set it', () => {
        expect(findings('<app-card id="1" :user-name="i"></app-card>')).toEqual([]);
        expect(findings('<app-card :id.once="i" user-name="Ann"></app-card>')).toEqual([]);
        expect(findings('<app-card :id :userName="i" />')).toEqual([]);
    });
    it('of two uses, the one missing it is the one reported, and the message says which', () => {
        const [w] = findings('<app-card :id="i" :user-name="i"></app-card>\n<app-card :user-name="i"></app-card>');
        expect(w.message).toContain("'id'");
        expect(w.message).toContain('2nd use');
        expect(w.line).toBe(3);
    });
    it('a component whose required props are not known raises nothing', () => {
        expect(findings('<other-card></other-card>')).toEqual([]);
    });
});

describe('the resolver knows the required props', () => {
    it('of a project .pdx, read from its @prop lines, again when the file changes', () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-required-'));
        try {
            const file = join(root, 'src', 'user-card.pdx');
            mkdirSync(join(root, 'src'), { recursive: true });
            writeFileSync(file, child("@prop user: string;\n@prop size: string = 'md';\n@prop note?: string;"));
            const r = new ComponentResolver();
            r.registerProjectComponents(root);
            expect([...r.requiredPropsOf('app-user-card')!]).toEqual(['user']);
            writeFileSync(file, child("@prop user?: string;"));
            utimesSync(file, new Date(), new Date(Date.now() + 5000));
            expect([...r.requiredPropsOf('app-user-card')!]).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('of a library component, from the fields its manifest marks required; null when it marks none', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(process.cwd());
        expect(r.has('pdx-input')).toBe(true);
        expect(r.requiredPropsOf('pdx-input')).toBeNull();
        expect(r.requiredPropsOf('pdx-not-a-component')).toBeNull();
    });
});

describe('pdx migrate', () => {
    const change = LANGUAGE_CHANGES.find(c => c.id === 'prop-required');
    it('is a changed entry with a mechanical rewrite', () => {
        expect(change?.kind).toBe('changed');
        expect(typeof change?.fix).toBe('function');
    });
    it('adds `?` to every @prop with no default, and the result compiles as before', () => {
        const src = child("@prop id: string;\n@prop items: Array<{ a: number }>;\n@prop label: string = '';\n@prop cb: (v: string) => void;\n@model value: string = '';");
        const out = (change!.fix as (t: string) => string)(src);
        expect(out).toContain('@prop id?: string;');
        expect(out).toContain('@prop items?: Array<{ a: number }>;');
        expect(out).toContain("@prop label: string = '';");
        expect(out).toContain('@prop cb?: (v: string) => void;');
        expect(out).toContain("@model value: string = '';");
        expect(change!.detect(src).map(f => f.found)).toEqual(['@prop id: string;', '@prop items: Array<{ a: number }>;', '@prop cb: (v: string) => void;']);
        const before = compile(src.replace(/required: true/g, ''), 'card.pdx').code.replace(/, required: true/g, '');
        expect(compile(out, 'card.pdx').code).toBe(before);
    });
});
