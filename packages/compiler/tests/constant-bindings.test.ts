// A binding that can never change is written once, with no effect (#110).
//
// Two kinds are constant: an expression of literals only, and — inside a `@for` — exactly the loop's
// `track` expression, since a row with a different key is a different row. Everything else keeps its
// effect. A constant property or attribute is the assignment without its effect; a constant
// interpolation calls core's `bindInterpolation(anchor, value, true)`, which writes once by the same
// rule as the reactive one.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(template: string, script = "let rows = $signal([]);\nlet label = $signal('x');"): string {
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const { code } = compile(src, 'constant.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
}

const ROWS = '<table><tbody>@for (rows as row; track row.id) {<tr><td>{{ row.id }}</td><td>{{ row.label }}</td></tr>}</tbody></table>';

describe('the track key of a @for row is written once', () => {
    it('{{ row.id }} under track row.id is a constant interpolation; {{ row.label }} keeps its effect', () => {
        const out = render(ROWS);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>row\(\)\.id,true\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>row\(\)\.label\)/);
    });

    it('a property bound to the key is assigned once, with no effect', () => {
        const out = render('@for (rows as row; track row.id) {<p :data-id="row.id" :title="row.label"></p>}');
        expect(out).not.toMatch(/effect\(\(\) => \{ const __b = row\(\)\.id;/);
        expect(out).toMatch(/__el\d+\.setAttribute\("data-id"/);
        // The control: the label is not the key, and keeps its effect.
        expect(out).toMatch(/effect\(\(\) => \{ const __b = row\(\)\.label;/);
    });

    it('the key with literals is constant too; the key with anything else is not', () => {
        const out = render('@for (rows as row; track row.id) {<p :data-test="\'row-\' + row.id" :title="row.id + row.label"></p>}');
        expect(out).not.toMatch(/effect\(\(\) => \{ const __b = 'row-' \+ row\(\)\.id;/);
        expect(out).toMatch(/effect\(\(\) => \{ const __b = row\(\)\.id \+ row\(\)\.label;/);
    });

    it('track item: the item itself is the key', () => {
        const out = render('@for (rows as name; track name) {<b>{{ name }}</b>}');
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>name\(\),true\)/);
    });

    it('a nested loop that reuses the name does not inherit the outer key', () => {
        const out = render('@for (rows as row; track row.id) {@for (row.kids as row; track row.name) {<i>{{ row.id }}</i>}}');
        expect(out, 'the inner row.id is not the inner key').not.toMatch(/bindInterpolation\(__t\d+,\(\)=>row\(\)\.id,true\)/);
    });

    it('outside the loop, the same text is not constant', () => {
        const out = render('<p>{{ label }}</p>');
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.label\(\)\)/);
    });
});

describe('an expression of literals is written once', () => {
    it(':title="\'x\'" is an assignment, not an effect', () => {
        const out = render('<p :title="\'x\'"></p>');
        expect(out).not.toContain('effect(');
        expect(out).toMatch(/__el\d+\.setAttribute\("title"|__el\d+\["title"\]/);
    });

    it('{{ 1 + 2 }} and {{ \'a\' }} are constant interpolations', () => {
        const out = render('<p>{{ 1 + 2 }} {{ \'a\' }}</p>');
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>1 \+ 2,true\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>'a',true\)/);
    });

    it('a script const whose value is literals counts as one; a let, a call and a loop name do not', () => {
        const script = "let rows = $signal([]);\nconst MAX = 10;\nlet limit = 5;\nconst made = String(3);";
        const out = render('<p>{{ MAX }} {{ limit }} {{ made }}</p>@for (rows as MAX; track MAX.id) {<i>{{ MAX }}</i>}', script);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.MAX,true\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.limit\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.made\)/);
        // Inside the loop MAX is the row, not the const.
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>MAX\(\)\)/);
    });

    it('a word inside a string is not a name; a name inside a template literal\'s ${} is', () => {
        const out = render('<p :title="\'label\'" :lang="`${label}`"></p>');
        expect(out).not.toMatch(/effect\(\(\) => \{ const __b = 'label';/);
        expect(out).toMatch(/let __el\d+w_lang = \{\}; effect\(/);
    });

    it('a call is never constant, even of literals: it may read a signal ($t reads the locale)', () => {
        const out = render('<p>{{ $t(\'x\') }}</p>');
        expect(out).not.toMatch(/,true\)/);
    });

    it('a pipe is never constant: the pipe may read a signal', () => {
        const out = render('<p>{{ \'a\' | upper }}</p>', "let rows = $signal([]);\nconst upper = (v) => v.toUpperCase();");
        expect(out).not.toMatch(/,true\)/);
    });
});
