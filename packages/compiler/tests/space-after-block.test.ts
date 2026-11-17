// #1152: between a block and the node after it the space is content, one space, as between any two
// nodes (#907, docs/language/file.md). The parser skipped it to see whether the block's next clause
// came (`@else`, `@empty`, `@placeholder`…) and kept it skipped when none did: «10:30 AMCall» in
// pdx-scheduler's month, where the time is an @if before the title.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const build = (template: string) => compile(
    `<template>${template}</template>\n<script>\nlet on = $signal(true);\nlet rows = $signal([1]);\n</script>\n`,
    'space.pdx', [], undefined, { production: true },
).code;

/** The HTML of every static block of a module, in order. */
// Match: staticMarkup('…'), an escape or any character but a quote or a backslash inside.
const markups = (code: string) => [...code.matchAll(/staticMarkup\('((?:\\.|[^'\\])*)'\)/g)].map((m) => m[1]);
/** The markup of the `<p>` the block sits in: the block is a marker in it, the space after it text. */
const parent = (template: string) => markups(build(template)).find((m) => m.startsWith('<p>'));

describe('the space after a block', () => {
    it('stays after an @if with no @else', () => {
        expect(parent('<p>@if (on) { <b>x</b> }\n<i>y</i></p>')).toMatch(/ <i>y<\/i><\/p>$/);
    });

    it('stays after a @for with no @empty', () => {
        expect(parent('<p>@for (rows as r; track r) { <b>{{ r }}</b> }\n<i>y</i></p>')).toMatch(/ <i>y<\/i><\/p>$/);
    });

    it('stays after a @require with no @else', () => {
        expect(parent("<p>@require ('admin') { <b>x</b> }\n<i>y</i></p>")).toMatch(/ <i>y<\/i><\/p>$/);
    });

    it('stays after a @defer with no sub-block', () => {
        expect(parent('<p>@defer (idle) { <b>x</b> }\n<i>y</i></p>')).toMatch(/ <i>y<\/i><\/p>$/);
    });

    it('stays after an @await with no sub-block', () => {
        expect(parent('<p>@await (rows) { <b>x</b> }\n<i>y</i></p>')).toMatch(/ <i>y<\/i><\/p>$/);
    });

    it('control — before a clause the space is not content, and the clause is the block\'s', () => {
        const code = build('<p>@if (on) { <b>x</b> }\n@else { <i>y</i> }</p>');
        expect(markups(code)).toContain('<b>x</b>');
        expect(markups(code)).toContain('<i>y</i>');
        expect(parent('<p>@for (rows as r; track r) { <b>{{ r }}</b> }\n@empty { <i>none</i> }</p>')).not.toMatch(/ <\/p>$/);
    });
});
