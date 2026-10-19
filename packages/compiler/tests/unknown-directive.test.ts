// A template directive no plugin registers is reported, once per name (#296).
//
// `@tooltip ('Save') { … }` in an app that forgot the plugin providing `@tooltip` compiled with no
// diagnostic and put `@tooltip ('Save') {` on the page as text. The parser leaves an unmatched
// `@word (` as text on purpose, so literal `@`-text keeps working; what was missing is saying so
// where the registered directives are known.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { DIRECTIVES } from '../src/parser/template';
import { TEMPLATE_AT_DIRECTIVES } from '../src/parser/template-directives';
import type { CompilerPlugin } from '../src/plugin-system';
import type { ValidationWarning } from '../src/compiler/validate';

const sfc = (template: string) => `<template>\n${template}\n</template>\n<script>\nlet xs = $signal([1]);\n</script>\n`;
const unknownOf = (warnings: ValidationWarning[]) => warnings.filter(w => w.code === 'PDX_UNKNOWN_DIRECTIVE');

describe('PDX_UNKNOWN_DIRECTIVE', () => {
    it('is reported once per name, at the first one\'s line', () => {
        const { warnings } = compile(sfc("<p>@tooltip ('a') { x }</p>\n<p>@tooltip ('b') { y }</p>"), 'tip.pdx');
        const found = unknownOf(warnings);
        expect(found, `got ${JSON.stringify(found)}`).toHaveLength(1);
        expect(found[0].message).toContain('@tooltip');
        expect(found[0].severity).toBe('warn');
        expect(found[0].line, 'not the first occurrence\'s line').toBe(2);
    });

    it('control — a directive a plugin registers is not reported', () => {
        const tooltip: CompilerPlugin = {
            name: 'tooltip-plugin',
            templateDirectives: { tooltip: { generate: (_expr, body) => `\${${body}}` } },
        };
        const { warnings } = compile(sfc("<p>@tooltip ('a') { x }</p>"), 'tip.pdx', [tooltip]);
        expect(unknownOf(warnings)).toEqual([]);
    });

    it('`@@tooltip (a)` is text and reports nothing', () => {
        expect(unknownOf(compile(sfc('<p>@@tooltip (a) here</p>'), 'tip.pdx').warnings)).toEqual([]);
    });

    it('a near typo of a built-in still throws its suggestion', () => {
        expect(() => compile(sfc('@fro (xs as x; track x) { <i>{{ x }}</i> }'), 'typo.pdx')).toThrow(/Did you mean @for\?/);
    });

    it('`@media (…)` in a template\'s text is reported: its escape is @@, as for any @-word', () => {
        const found = unknownOf(compile(sfc('<p>@media (min-width: 1px) is CSS</p>'), 'media.pdx').warnings);
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('@media');
    });

    it('`@for (…) @transition(…) @stagger(50) { … }` reports nothing', () => {
        const { warnings } = compile(sfc("@for (xs as x; track x) @transition('fade') @stagger(50) { <i>{{ x }}</i> }"), 'stagger.pdx');
        expect(unknownOf(warnings)).toEqual([]);
    });

    it('inside a block body too', () => {
        const found = unknownOf(compile(sfc("@if (xs.length) { <p>@tooltip ('a') { x }</p> }"), 'nested.pdx').warnings);
        expect(found).toHaveLength(1);
    });
});

describe('one list of template @-words', () => {
    it('DIRECTIVES holds only words of TEMPLATE_AT_DIRECTIVES', () => {
        const all = new Set<string>(TEMPLATE_AT_DIRECTIVES);
        expect(DIRECTIVES.filter(d => !all.has(d))).toEqual([]);
        for (const w of ['transition', 'mode', 'stagger', 'move']) expect(all.has(w), w).toBe(true);
    });
});
