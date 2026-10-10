// `@transition`, `@stagger`, `@mode` and `@move` on an `@if` or a `@for` reach the runtime on both
// render paths: the template path (dev, and a build with `inlineBindings: false`) and the inline path
// (a production build, by default). The inline path dropped them, so an animation that played in dev
// did not play in the shipped app (#85). Each form is compiled both ways, and the options object the
// template path passes to `when` / `each` / `eachRow` must be in the inline output too.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT = '<script setup>\nlet on = $signal(true);\nlet list = $signal([1, 2]);\n</script>\n';

function both(template: string): { tpl: string; inline: string } {
    const src = `<template>${template}</template>\n${SCRIPT}`;
    return {
        tpl: compile(src, 'transition-probe.pdx', [], undefined, {}).code,
        inline: compile(src, 'transition-probe.pdx', [], undefined, { production: true, inlineBindings: true }).code,
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

describe('transitions on both render paths', () => {
    for (const [name, template, expected] of FORMS) {
        it(name, () => {
            const { tpl, inline } = both(template);
            expect(options(tpl), 'the template path is the reference').toBe(expected);
            expect(options(inline), 'the inline path dropped the transition').toBe(expected);
        });
    }

    it('a block with no transition passes no options on either path', () => {
        const { tpl, inline } = both('@if (on) { <p>x</p> }');
        expect(options(tpl)).toBeUndefined();
        expect(options(inline)).toBeUndefined();
    });
});
