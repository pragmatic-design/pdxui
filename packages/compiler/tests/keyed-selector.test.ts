// `row.key === sig` inside a @for keyed by `row.key` compiles to a keyed selector (#117): a change of
// `sig` re-runs the two rows it concerns, not every row.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(template: string): string {
    const src = `<template>${template}</template>\n<script setup>\nlet rows = $signal([]);\nlet selected = $signal(null);\nlet other = $signal(0);\n</script>\n`;
    const { code } = compile(src, 'selector.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
}

const ROWS = (attrs: string, text = 'x') => `<ul>@for (rows as row; track row.id) {<li ${attrs}>${text}</li>}</ul>`;

describe('a keyed selector for `key === signal` in a @for', () => {
    it('the comparison becomes is(key), with one selector declared for the render', () => {
        const out = render(ROWS(':class="row.id === selected ? \'danger\' : \'\'"'));
        expect(out).toMatch(/const __sel_selected=selector\(\(\)=>ctx\.selected\(\)\);/);
        expect(out).toMatch(/__sel_selected\.is\(row\(\)\.id\)/);
        expect(out).not.toMatch(/row\(\)\.id === ctx\.selected\(\)/);
    });

    it('either side, and in a property binding or an interpolation', () => {
        const out = render(ROWS(':aria-selected="selected === row.id"', '{{ row.id === selected }}'));
        expect(out.match(/__sel_selected\.is\(row\(\)\.id\)/g)).toHaveLength(2);
        expect(out.match(/const __sel_selected=/g), 'one selector per signal, however many uses').toHaveLength(1);
    });

    it('only the track expression: another field compared with the signal is unchanged', () => {
        const out = render(ROWS(':title="row.label === selected"'));
        expect(out).not.toContain('selector(');
    });

    it('only a whole comparison: a key inside a larger operand is unchanged', () => {
        const out = render(ROWS(':title="row.id + 1 === selected"'));
        expect(out).not.toContain('selector(');
    });

    it('outside a @for, nothing changes', () => {
        const out = render('<p :title="other === selected">x</p>');
        expect(out).not.toContain('selector(');
    });
});
