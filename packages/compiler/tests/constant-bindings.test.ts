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
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
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
        expect(out).not.toMatch(/bind\w+\(__el\d+, "data-id"/);
        // In a row the assignment is spelled out, not core's call with its once flag: a write once a
        // row, where the call costs a few ns more and the module carries it once (#1270, onceCall).
        expect(out).toMatch(/__el\d+\.setAttribute\("data-id"/);
        // The control: the label is not the key, and keeps its binding.
        expect(out).toMatch(/bind\w+\(__el\d+, "title", "title", \(\)=>row\(\)\.label\)/);
    });

    it('the key with literals is constant too; the key with anything else is not', () => {
        const out = render('@for (rows as row; track row.id) {<p :data-test="\'row-\' + row.id" :title="row.id + row.label"></p>}');
        expect(out).not.toMatch(/bind\w+\(__el\d+, "data-test"/);
        expect(out).toMatch(/bind\w+\(__el\d+, "title", "title", \(\)=>row\(\)\.id \+ row\(\)\.label\)/);
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
        // Core's binding with its `once` flag (#1270): written once, no effect, by the same write.
        expect(out).toMatch(/bindAttributeOrProperty\(__el\d+, "title", "title", 'x', 1\)/);
    });

    it('{{ 1 + 2 }} and {{ \'a\' }} are constant interpolations', () => {
        const out = render('<p>{{ 1 + 2 }} {{ \'a\' }}</p>');
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>1 \+ 2,true\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>'a',true\)/);
    });

    it('a script const whose value is literals counts as one; a let, a call and a loop name do not', () => {
        const script = "let rows = $signal([]);\nconst MAX = 10;\nlet limit = 5;\nconst made = String(3);";
        // The row reads a member of its item, so it is not a static row (#1233): the binding shows
        // whether MAX is read as the row or as the const.
        const out = render('<p>{{ MAX }} {{ limit }} {{ made }}</p>@for (rows as MAX; track MAX.id) {<i>{{ MAX.label }}</i>}', script);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.MAX,true\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.limit\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.made\)/);
        // Inside the loop MAX is the row, not the const.
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>MAX\(\)\.label\)/);
    });

    it('a word inside a string is not a name; a name inside a template literal\'s ${} is', () => {
        const out = render('<p :title="\'label\'" :lang="`${label}`"></p>');
        expect(out, 'written once: the binding carries the once flag (#1270)').toMatch(/bind\w+\(__el\d+, "title"[^;]*, 1\);/);
        expect(out).toMatch(/bind\w+\(__el\d+, "lang", "lang", \(\)=>`\$\{ctx\.label\(\)\}`\)/);
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

// #1270: a value written once is core's binding with its `once` flag — no effect, the same write, and
// no import the binding does not already have; an instance constant whose value is certainly a
// primitive is one such value.
describe('a value written once is core\'s binding with its once flag (#1270)', () => {
    it(':id.once is one write, untracked, not the assignment spelled out inline', () => {
        const out = render('<div :id.once="label"></div><p :aria-label.once="label"></p>');
        expect(out).toMatch(/bindAttributeOrProperty\(__el\d+, "id", "id", untracked\(\(\)=>ctx\.label\(\)\), 1\)/);
        expect(out).toMatch(/bindAttribute\(__el\d+, "aria-label", untracked\(\(\)=>ctx\.label\(\)\), 1\)/);
        expect(out).not.toContain('const __b = untracked');
        expect(out).not.toContain('effect(');
    });

    it('a literal binding is one write too', () => {
        const out = render('<p :title="\'x\'" :style="\'color: red\'"></p>');
        expect(out).toMatch(/bindAttributeOrProperty\(__el\d+, "title", "title", 'x', 1\)/);
        expect(out).toMatch(/bindStyleText\(__el\d+, 'color: red', 1\)/);
    });

    it('an instance const that is certainly a primitive is written once: a template literal, a string concatenation', () => {
        const script = "let rows = $signal([]);\nconst uid = make();\nconst contentId = `${uid}-content`;\nconst errId = uid + '-error';";
        const out = render('<div :id="contentId" :aria-describedby="errId"></div><b>{{ contentId }}</b>', script);
        expect(out).toMatch(/bindAttributeOrProperty\(__el\d+, "id", "id", ctx\.contentId, 1\)/);
        expect(out).toMatch(/bindAttribute\(__el\d+, "aria-describedby", ctx\.errId, 1\)/);
        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.contentId,true\)/);
        // Every binding of the two is the written-once form: none without the flag.
        expect(out.match(/bind(?:Attribute|AttributeOrProperty)\(__el\d+, [^;]*;/g)?.every((c) => c.endsWith(', 1);'))).toBe(true);
    });

    it('a const whose value may be anything keeps its binding: a call, a name, a function, a $derived', () => {
        const script = "let rows = $signal([]);\nconst made = make();\nconst alias = made;\nconst f = () => rows;\nconst d = $derived(rows.length + 'x');";
        const out = render('<p :title="made" :lang="alias" :dir="f" :data-n="d"></p>', script);
        expect(out).toMatch(/bind\w+\(__el\d+, "title", "title", \(\)=>ctx\.made\)/);
        expect(out).toMatch(/bind\w+\(__el\d+, "lang", "lang", \(\)=>ctx\.alias\)/);
        expect(out).toMatch(/bind\w+\(__el\d+, "dir", "dir", \(\)=>ctx\.f\)/);
        expect(out).toMatch(/bindAttribute\(__el\d+, "data-n", \(\)=>ctx\.d\(\)\)/);
    });

    it('a primitive const shadowed by a loop name is the loop name inside the loop', () => {
        const script = "let rows = $signal([]);\nconst id = `${make()}-x`;";
        const out = render('@for (rows as id; track id.key) {<p :title="id.label"></p>}', script);
        expect(out).toMatch(/bind\w+\(__el\d+, "title", "title", \(\)=>id\(\)\.label\)/);
    });

    it('a component prop written once still goes through assignBoundProperty', () => {
        const out = render('<pdx-x :title.once="label" :open="true"></pdx-x>');
        expect(out).toMatch(/assignBoundProperty\(__el\d+, "title"/);
        expect(out).not.toMatch(/bind\w+\(__el\d+, "(title|open)"/);
    });
});
