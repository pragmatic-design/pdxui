// `pdx-button-group`'s selection modes are removed: selecting among buttons is `pdx-toggle-group`
// (#286, decision 51).
//
// `pdx migrate` rewrites `<pdx-button-group mode="single|multiple">` whose children are plain buttons
// — a `<pdx-button>` or a native `<button>` holding text — to `<pdx-toggle-group type="…">` with
// `pdx-toggle` items, each keeping its value or taking its text as one. The group's `variant` follows
// decision 53: an outline or ghost group keeps it, any other is `solid`. A `@pdx-change` handler moves
// to `@value-change`, whose detail is `{ value }` where it was the value itself. Anything else is
// flagged. `mode="none"`, the action group, only loses the attribute. In a .pdx `mode` on the group is
// PDX_REMOVED_FORM.

import { describe, it, expect } from 'vitest';
import { buttonGroupModes } from '../src/language/button-group-modes';
import { languageChanges } from '../src/language/changes';
import { compile } from '../src/plugin';

const fix = buttonGroupModes.fix as (text: string) => string;

describe('button-group-modes: the mechanical rewrite', () => {
    it('a single group of pdx-buttons with values becomes a toggle group, solid, its handler on value-change', () => {
        const source = [
            '<pdx-button-group mode="single" label="Text alignment" :value="align" @pdx-change="e => align = e.detail">',
            '  <pdx-button value="left">Left</pdx-button>',
            '  <pdx-button value="right">Right</pdx-button>',
            '</pdx-button-group>',
        ].join('\n');
        expect(fix(source)).toBe([
            '<pdx-toggle-group type="single" variant="solid" label="Text alignment" :value="align" @value-change="e => align = e.detail.value">',
            '  <pdx-toggle value="left">Left</pdx-toggle>',
            '  <pdx-toggle value="right">Right</pdx-toggle>',
            '</pdx-toggle-group>',
        ].join('\n'));
    });

    it('a multiple group of native buttons: each takes its text as its value; an outline variant is kept', () => {
        const source = '<pdx-button-group mode="multiple" variant="outline" size="sm"><button>Bold</button><button disabled>Italic</button></pdx-button-group>';
        expect(fix(source)).toBe('<pdx-toggle-group type="multiple" variant="outline" size="sm"><pdx-toggle value="Bold">Bold</pdx-toggle><pdx-toggle disabled value="Italic">Italic</pdx-toggle></pdx-toggle-group>');
    });

    it('a variant other than outline or ghost is solid; $event.detail reads the value', () => {
        const source = '<pdx-button-group mode="single" variant="primary" @pdx-change="save($event.detail)"><pdx-button value="a">A</pdx-button></pdx-button-group>';
        expect(fix(source)).toBe('<pdx-toggle-group type="single" variant="solid" @value-change="save($event.detail.value)"><pdx-toggle value="a">A</pdx-toggle></pdx-toggle-group>');
    });

    it('mode="none", the action group, only loses the attribute', () => {
        const source = '<pdx-button-group mode="none" label="Edit"><pdx-button>Cut</pdx-button></pdx-button-group>';
        expect(fix(source)).toBe('<pdx-button-group label="Edit"><pdx-button>Cut</pdx-button></pdx-button-group>');
    });

    it('a second run changes nothing, and finds nothing', () => {
        const once = fix('<pdx-button-group mode="multiple"><pdx-button value="b">B</pdx-button></pdx-button-group>');
        expect(buttonGroupModes.detect(once)).toEqual([]);
        expect(fix(once)).toBe(once);
    });
});

describe('button-group-modes: what a person must rewrite is flagged and left as written', () => {
    const left = [
        // a child that is not a plain button
        '<pdx-button-group mode="single"><pdx-button value="a"><pdx-icon name="x"></pdx-icon></pdx-button></pdx-button-group>',
        // a handler that is a reference: it reads the detail as the value
        '<pdx-button-group mode="single" @pdx-change="onPick"><pdx-button value="a">A</pdx-button></pdx-button-group>',
        // a bound mode
        '<pdx-button-group :mode="m"><pdx-button value="a">A</pdx-button></pdx-button-group>',
        // a bound variant
        '<pdx-button-group mode="single" :variant="v"><pdx-button value="a">A</pdx-button></pdx-button-group>',
        // a child with a binding
        '<pdx-button-group mode="single"><pdx-button :value="x">A</pdx-button></pdx-button-group>',
    ];

    for (const source of left) {
        it(`flags, and leaves: ${source.slice(0, 80)}…`, () => {
            const found = buttonGroupModes.detect(source);
            expect(found).toHaveLength(1);
            // The finding says why it was not rewritten, so a person knows what to change.
            expect(found[0].note).toMatch(/^Not rewritten: /);
            expect(fix(source)).toBe(source);
        });
    }

    it('says why, per group', () => {
        const why = (source: string) => buttonGroupModes.detect(source)[0].note;
        expect(why(left[0])).toContain('not a plain button');
        expect(why(left[1])).toContain('`@pdx-change` handler is a reference');
        expect(why(left[2])).toContain('mode is bound');
        expect(why(left[3])).toContain('variant is bound');
        expect(why(left[4])).toContain('`:value`');
    });

    it('a group it rewrites carries no note', () => {
        expect(buttonGroupModes.detect('<pdx-button-group mode="single"><pdx-button value="a">A</pdx-button></pdx-button-group>')[0].note).toBeUndefined();
    });

    it('reports every group at its line', () => {
        const source = `<template>\n  ${left[0]}\n  ${left[1]}\n</template>`;
        expect(buttonGroupModes.detect(source).map((f) => f.line)).toEqual([2, 3]);
    });

    it('a group without a mode is the action group: not reported', () => {
        expect(buttonGroupModes.detect('<pdx-button-group label="Edit"><pdx-button>Cut</pdx-button></pdx-button-group>')).toEqual([]);
    });
});

describe('button-group-modes in the compiler and the registry', () => {
    it('`mode` on the group is PDX_REMOVED_FORM, naming pdx-toggle-group', () => {
        const r = compile('<template>\n  <pdx-button-group mode="single"><pdx-button value="a">A</pdx-button></pdx-button-group>\n</template>\n', 'f.pdx');
        const removed = r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(removed).toHaveLength(1);
        expect(removed[0].line).toBe(2);
        expect(removed[0].message).toContain('<pdx-toggle-group');
    });

    it('is registered', () => {
        expect(languageChanges().map((c) => c.id)).toContain(buttonGroupModes.id);
    });
});
