// `pdx-button` loses its toggle mode: the on/off button is `pdx-toggle` (#291, the owner's decision of
// 2026-10-11). `pdx migrate` rewrites `<pdx-button toggle>` to `<pdx-toggle>`: `toggle` is dropped;
// `pressed` (static, `:pressed`, `::pressed`), `disabled`, `size` and `aria-label` are kept; `variant`
// primary and solid are `solid`, outline and ghost are kept, none is `variant="solid"` (the button's
// default was primary, the toggle's is outline); `label` becomes the text after the children; an
// `@pdx-toggle` handler is a `@pressed-change` handler, its `detail.pressed` read as `detail.value`. What
// pdx-toggle has no counterpart for is flagged and left. A `pressed` on a button without `toggle` never
// did anything: it is removed. In a .pdx, `toggle` or `pressed` on `<pdx-button>` is PDX_REMOVED_FORM.

import { describe, it, expect } from 'vitest';
import { buttonToggleRemoved } from '../src/language/button-toggle';
import { languageChanges } from '../src/language/changes';
import { compile } from '../src/plugin';

const fix = buttonToggleRemoved.fix as (text: string) => string;

describe('button-toggle-removed: the mechanical rewrite', () => {
    it('an outline toggle keeps its variant and size', () => {
        expect(fix('<pdx-button toggle variant="outline" size="sm">B</pdx-button>'))
            .toBe('<pdx-toggle variant="outline" size="sm">B</pdx-toggle>');
    });

    it('with no variant it is solid, as the button was filled; pressed is kept', () => {
        expect(fix('<pdx-button toggle pressed>Active</pdx-button>'))
            .toBe('<pdx-toggle variant="solid" pressed>Active</pdx-toggle>');
    });

    it('primary and solid are solid; ghost is kept', () => {
        expect(fix('<pdx-button variant="primary" toggle>A</pdx-button>')).toBe('<pdx-toggle variant="solid">A</pdx-toggle>');
        expect(fix('<pdx-button toggle variant="solid">A</pdx-button>')).toBe('<pdx-toggle variant="solid">A</pdx-toggle>');
        expect(fix('<pdx-button toggle variant="ghost">A</pdx-button>')).toBe('<pdx-toggle variant="ghost">A</pdx-toggle>');
    });

    it('a bound or two-way pressed, disabled and aria-label are kept as written', () => {
        expect(fix('<pdx-button toggle ::pressed="bold" disabled aria-label="Bold"><pdx-icon name="bold"></pdx-icon></pdx-button>'))
            .toBe('<pdx-toggle variant="solid" ::pressed="bold" disabled aria-label="Bold"><pdx-icon name="bold"></pdx-icon></pdx-toggle>');
        expect(fix('<pdx-button toggle :pressed="on">On</pdx-button>')).toBe('<pdx-toggle variant="solid" :pressed="on">On</pdx-toggle>');
    });

    it('label becomes the text after the children, where the button rendered it', () => {
        expect(fix('<pdx-button toggle label="Bold"><pdx-icon name="bold"></pdx-icon></pdx-button>'))
            .toBe('<pdx-toggle variant="solid"><pdx-icon name="bold"></pdx-icon>Bold</pdx-toggle>');
    });

    it('an @pdx-toggle handler moves to @pressed-change, its detail.pressed read as detail.value', () => {
        expect(fix('<pdx-button toggle @pdx-toggle="e => bold = e.detail.pressed">B</pdx-button>'))
            .toBe('<pdx-toggle variant="solid" @pressed-change="e => bold = e.detail.value">B</pdx-toggle>');
        expect(fix('<pdx-button toggle @pdx-toggle.stop="save($event.detail.pressed)">B</pdx-button>'))
            .toBe('<pdx-toggle variant="solid" @pressed-change.stop="save($event.detail.value)">B</pdx-toggle>');
    });

    it('a pressed on a button without toggle never had an effect: it is removed', () => {
        expect(fix('<pdx-button pressed variant="outline">Save</pdx-button>')).toBe('<pdx-button variant="outline">Save</pdx-button>');
        expect(fix('<pdx-button :pressed="x">Save</pdx-button>')).toBe('<pdx-button>Save</pdx-button>');
    });

    it('a second run changes nothing, and finds nothing', () => {
        const once = fix('<pdx-button toggle pressed label="B" @pdx-toggle="e => b = e.detail.pressed">X</pdx-button><pdx-button pressed>Y</pdx-button>');
        expect(buttonToggleRemoved.detect(once)).toEqual([]);
        expect(fix(once)).toBe(once);
    });

    it('control: a button with neither toggle nor pressed is not touched, nor reported', () => {
        const source = '<pdx-button variant="danger" loading>Delete</pdx-button>';
        expect(buttonToggleRemoved.detect(source)).toEqual([]);
        expect(fix(source)).toBe(source);
    });
});

describe('button-toggle-removed: what pdx-toggle has no counterpart for is flagged and left as written', () => {
    const left = [
        '<pdx-button toggle variant="danger">X</pdx-button>',
        '<pdx-button toggle loading>X</pdx-button>',
        '<pdx-button toggle type="submit">X</pdx-button>',
        '<pdx-button toggle full>X</pdx-button>',
        '<pdx-button toggle aria-labelledby="l">X</pdx-button>',
        '<pdx-button toggle :action="save">X</pdx-button>',
        '<pdx-button toggle :variant="v">X</pdx-button>',
        '<pdx-button :toggle="t">X</pdx-button>',
        '<pdx-button toggle @pdx-toggle="onToggle">X</pdx-button>',
    ];

    for (const source of left) {
        it(`flags, and leaves: ${source}`, () => {
            const found = buttonToggleRemoved.detect(source);
            expect(found).toHaveLength(1);
            expect(found[0].note).toMatch(/^Not rewritten: /);
            expect(fix(source)).toBe(source);
        });
    }

    it('says why', () => {
        const why = (source: string) => buttonToggleRemoved.detect(source)[0].note;
        expect(why(left[0])).toContain('`variant="danger"`');
        expect(why(left[1])).toContain('`loading`');
        expect(why(left[6])).toContain('bound');
        expect(why(left[8])).toContain('`@pdx-toggle`');
    });

    it('reports each button at its line', () => {
        const source = `<template>\n  ${left[0]}\n  <pdx-button toggle>Ok</pdx-button>\n  <pdx-button pressed>P</pdx-button>\n</template>`;
        expect(buttonToggleRemoved.detect(source).map((f) => f.line)).toEqual([2, 3, 4]);
    });
});

describe('button-toggle-removed in the compiler and the registry', () => {
    it('toggle on <pdx-button> is PDX_REMOVED_FORM, naming <pdx-toggle>', () => {
        const r = compile('<template>\n  <pdx-button toggle>B</pdx-button>\n</template>\n', 'f.pdx');
        const removed = r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(removed).toHaveLength(1);
        expect(removed[0].line).toBe(2);
        expect(removed[0].message).toContain('<pdx-toggle>');
    });

    it('pressed on <pdx-button> is PDX_REMOVED_FORM too', () => {
        const r = compile('<template>\n  <pdx-button :pressed="x">B</pdx-button>\n</template>\n', 'f.pdx');
        expect(r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM')).toHaveLength(1);
    });

    it('control: a plain pdx-button and a pdx-toggle raise nothing', () => {
        const r = compile('<template>\n  <pdx-button variant="outline">B</pdx-button>\n  <pdx-toggle pressed>T</pdx-toggle>\n</template>\n', 'f.pdx');
        expect(r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM')).toEqual([]);
    });

    it('is registered', () => {
        expect(languageChanges().map((c) => c.id)).toContain(buttonToggleRemoved.id);
    });
});
