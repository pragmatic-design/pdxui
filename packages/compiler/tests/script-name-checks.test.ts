// Three name checks of a .pdx script, found writing pdx-scheduler (#1066):
// 1. a @part named like an import replaced the import, and the component threw at mount;
// 2. CD-S2 read a loop's `const b` as the `b` of a callback over a $derived elsewhere in the script;
// 3. a $derived with the name of a @prop — or of an import — compiled to a module that does not load.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (template: string, script: string) => `<template>${template}</template>\n<script>\n${script}\n</script>`;
const codes = (template: string, script: string) => compile(pdx(template, script), 'test.pdx').warnings.map((w) => w.code);

describe('a @part named like an import (#1066, 1)', () => {
    const script = "import { today } from '@pdxui/core';\n@part today;\nconst label = $derived(today());";

    it('keeps the import: its call calls the import, not a part signal', () => {
        const { code } = compile(pdx('<span data-part="today">{{ label }}</span>', script), 'test.pdx');
        expect(code, 'a part signal took the import\'s name').not.toMatch(/\b__today\b/);
        expect(code).toMatch(/\btoday\(\)/);
    });

    it('says so, as for a script declaration: PDX_PART_NAME_TAKEN', () => {
        expect(codes('<span data-part="today">{{ label }}</span>', script)).toContain('PDX_PART_NAME_TAKEN');
    });

    it('the control: a part with a name nothing declares is still the element\'s signal', () => {
        // Read by the script: a part nothing reads has no signal (#1268).
        const { code } = compile(pdx('<span data-part="badge">x</span>', '@part badge;\nfunction f() { return badge; }'), 'test.pdx');
        expect(code).toMatch(/\b__badge\b/);
    });
});

describe('a @part named like a @slot (#1112)', () => {
    const script = '@slot row?: (x: string);\n@part row;';
    const template = '<li data-part="row">@render row?.(\'a\') @else { a }</li>';

    it('keeps the snippet: the setup does not return the part\'s signal under its name', () => {
        const { code } = compile(pdx(template, script), 'test.pdx');
        expect(code, 'the part\'s signal took the slot\'s name').not.toMatch(/\brow: __row\b/);
        expect(code).not.toMatch(/\b__row\b/);
    });

    it('says so: PDX_PART_NAME_TAKEN', () => {
        expect(codes(template, script)).toContain('PDX_PART_NAME_TAKEN');
    });
});

describe('CD-S2 reads a name where it is declared (#1066, 2)', () => {
    const derived = "let source = $signal([{ id: 1, first: 0 }]);\nconst allDay = $derived({ bars: source });\n"
        + 'function barsAt(ci: number) { return allDay.bars.filter((b) => b.first === ci); }\n';

    it('a loop\'s own const b, which shadows a callback\'s b over a $derived, is not a write into it', () => {
        const script = derived + 'function focusAll(cell: HTMLElement) { for (const b of cell.querySelectorAll<HTMLElement>(\'button\')) b.tabIndex = 0; }';
        expect(codes('<p>{{ barsAt(0).length }}</p><i @click="focusAll($event.target)">x</i>', script)).not.toContain('PDX_DERIVED_WRITE');
    });

    it('the control: a write through the callback\'s own b is one', () => {
        const script = "let source = $signal([{ id: 1, first: 0 }]);\nconst allDay = $derived({ bars: source });\n"
            + 'function mark() { allDay.bars.forEach((b) => { b.first = 1; }); }';
        expect(codes('<i @click="mark()">x</i>', script)).toContain('PDX_DERIVED_WRITE');
    });

    it('and a local reached from the $derived, in the same scope, still is', () => {
        const script = "let source = $signal([{ id: 1, first: 0 }]);\nconst allDay = $derived({ bars: source });\n"
            + 'function mark() { const first = allDay.bars[0]; first.first = 2; }';
        expect(codes('<i @click="mark()">x</i>', script)).toContain('PDX_DERIVED_WRITE');
    });
});

describe('one name declared twice by a @prop or an import and the script (#1066, 3)', () => {
    it('a $derived with the name of a @prop is PDX_DUP_DECLARATION', () => {
        const script = '@prop agendaDays: number = 7;\nlet days = $signal([1]);\nconst agendaDays = $derived(days.length);';
        expect(codes('<p>{{ agendaDays }}</p>', script)).toContain('PDX_DUP_DECLARATION');
    });

    it('a declaration with the name of an import is PDX_DUP_DECLARATION, naming both lines', () => {
        const script = "import { today } from '@pdxui/core';\nconst today = $derived(1);";
        const w = compile(pdx('<p>{{ today }}</p>', script), 'test.pdx').warnings.find((x) => x.code === 'PDX_DUP_DECLARATION');
        expect(w?.severity).toBe('error');
        expect(w?.message).toMatch(/import on line \d+ and \$derived on line \d+/);
    });

    it('the control: an import and a declaration of different names are not', () => {
        expect(codes('<p>{{ now }}</p>', "import { today } from '@pdxui/core';\nconst now = $derived(today());")).not.toContain('PDX_DUP_DECLARATION');
    });
});
