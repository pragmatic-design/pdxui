// A legacy-mode template that reads a name its script does not provide says so (#41).
//
// `validate()` returned at once outside the new mode, so a plain `<script>` with `const title = 'Hi'`
// and `{{ title }}` compiled to `ctx.title` — undefined — with no word from the plugin or `pdx check`.
// In the legacy mode the template reads what `defineProps` declares and what the top-level
// `return { … }` hands over, and nothing else.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (template: string, script: string, setup = false): string =>
    `<template>\n  ${template}\n</template>\n<script${setup ? ' setup' : ''}>\n${script}\n</script>\n`;

const codes = (source: string): string[] => compile(source, 'legacy.pdx').warnings.map((w) => w.code);
const finding = (source: string) => compile(source, 'legacy.pdx').warnings.find((w) => w.code === 'PDX_TEMPLATE_NAME_NOT_PROVIDED');

describe('a legacy template reads only what the script provides', () => {
    it('a plain <script> that returns nothing: the name it reads is an error', () => {
        const w = finding(sfc('<h1>{{ title }}</h1>', "const title = 'Hi';"));
        expect(w, 'compiled to ctx.title — undefined — with no word').toBeDefined();
        expect(w!.severity).toBe('error');
        expect(w!.message).toContain("'title'");
        expect(w!.hint).toContain('<script setup>');
    });

    it('a name missing from the return is an error, and is located on its read', () => {
        const source = sfc('<p>{{ count }} {{ label }}</p>', 'const count = signal(0);\nconst label = "x";\nreturn { count };');
        const w = finding(source);
        expect(w).toBeDefined();
        expect(w!.message).toContain("'label'");
        expect(w!.line, 'the finding has no position').toBe(2);
    });

    it('control — a name the return hands over is not reported', () => {
        expect(codes(sfc('<p>{{ count }}</p>', 'const count = signal(0);\nreturn { count };')))
            .not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });

    it('control — a prop declared by defineProps is not reported', () => {
        expect(codes(sfc('<p>{{ label }}</p>', "const props = defineProps({ label: { type: String, default: '' } });\nreturn {};")))
            .not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });

    it('control — `key: value` and the shorthand both provide the key', () => {
        expect(codes(sfc('<p>{{ a }} {{ b }}</p>', 'const x = 1;\nconst b = 2;\nreturn { a: x, b };')))
            .not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });

    it('control — a spread in the return provides names nobody can list, so nothing is reported', () => {
        expect(codes(sfc('<p>{{ anything }}</p>', 'const more = { anything: 1 };\nreturn { ...more };')))
            .not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });

    it('control — loop variables and globals are the template\'s own', () => {
        expect(codes(sfc('@for (items as item; track item) { <p>{{ item }} {{ Math.max(1, 2) }}</p> }', 'const items = [1];\nreturn { items };')))
            .not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });

    it('control — the same const in <script setup> works, and is not reported', () => {
        expect(codes(sfc('<h1>{{ title }}</h1>', "const title = 'Hi';", true)))
            .not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });
});
