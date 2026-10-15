// `@transition`, `@stagger`, `@mode` and `@move` on an `@if` or a `@for` reach the runtime from both
// generators: the inline one — every .pdx's render since #107, and a scoped slot's body since #364 —
// and the template one, called directly (the legacy mode still renders through it). The inline path
// dropped them once, so an animation that played in dev did not play in the shipped app (#85). The
// options object the template generator passes to `when` / `each` / `eachRow` must be in the inline
// output too, at the top level and in a slot.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { templateGenerator } from './template-generator';

const SCRIPT = '<script setup>\nlet on = $signal(true);\nlet list = $signal([1, 2]);\n</script>\n';

function both(template: string): { tpl: string; inline: string; slot: string } {
    const src = (body: string) => `<template>${body}</template>\n${SCRIPT}`;
    return {
        tpl: templateGenerator(template, ['on', 'list'], { production: true }),
        inline: compile(src(template), 'transition-probe.pdx', [], undefined, { production: true }).code,
        slot: compile(src(`<pdx-list><slot name="item" let:row>${template}</slot></pdx-list>`), 'transition-probe.pdx', [], undefined, { production: true }).code,
    };
}

/** The options object `generateTransition` writes: `{ enter: 'fade', … }`. */
function options(code: string): string | undefined {
    // Match: an object literal whose first key is one of the transition options.
    return code.match(/\{ (?:enter|exit|stagger|mode|move): [^}]*\}/)?.[0];
}

const FORMS: Array<[string, string, string]> = [
    ['@if with enter and exit', `@if (on) @transition('fade', 'out') { <p>x</p> }`, "{ enter: 'fade', exit: 'out' }"],
    ['@if with @mode', `@if (on) @transition('fade') @mode('out-in') { <p>x</p> } @else { <p>y</p> }`, "{ enter: 'fade', exit: 'fade', mode: 'out-in' }"],
    ['@for with @stagger', `@for (list as x; track x) @transition('fade') @stagger(50) { <p>{{ x }}</p> }`, "{ enter: 'fade', exit: 'fade', stagger: 50 }"],
    ['@for with @move alone', `@for (list as x; track x) @move(200) { <p>{{ x }}</p> }`, "{ move: '200' }"],
    ['@for with @empty', `@for (list as x; track x) @transition('fade') { <p>{{ x }}</p> } @empty { <p>none</p> }`, "{ enter: 'fade', exit: 'fade' }"],
    ['@for over a destructured row', `@for (list as { id }; track id) @transition('fade') { <p>{{ id }}</p> }`, "{ enter: 'fade', exit: 'fade' }"],
];

describe('transitions on both generators', () => {
    for (const [name, template, expected] of FORMS) {
        it(name, () => {
            const { tpl, inline, slot } = both(template);
            expect(options(tpl), 'the template path is the reference').toBe(expected);
            expect(options(inline), 'the inline path dropped the transition').toBe(expected);
            expect(options(slot), 'a scoped slot body dropped the transition').toBe(expected);
        });
    }

    it('a block with no transition passes no options on either path', () => {
        const { tpl, inline, slot } = both('@if (on) { <p>x</p> }');
        expect(options(tpl)).toBeUndefined();
        expect(options(inline)).toBeUndefined();
        expect(options(slot)).toBeUndefined();
    });
});
