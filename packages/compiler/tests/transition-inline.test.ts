// `@transition`, `@stagger`, `@mode` and `@move` on an `@if` or a `@for` reach the runtime: every .pdx's
// render since #107, and a snippet's body. The inline path dropped them once, so an animation that
// played in dev did not play in the shipped app (#85). The options object must be passed to `when` /
// `each` / `eachRow`, at the top level and in a snippet. A list's also names the animation that runs
// them, core's listAnimation (#1246), which a list with no transition does not carry.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT = '<script>\nlet on = $signal(true);\nlet list = $signal([1, 2]);\n</script>\n';

function compiled(template: string): { inline: string; slot: string } {
    const src = (body: string) => `<template>${body}</template>\n${SCRIPT}`;
    return {
        inline: compile(src(template), 'transition-probe.pdx', [], undefined, { production: true }).code,
        slot: compile(src(`<pdx-list>@snippet item(row) { ${template} }</pdx-list>`), 'transition-probe.pdx', [], undefined, { production: true }).code,
    };
}

/** The options object `generateTransition` writes: `{ enter: 'fade', … }`. */
function options(code: string): string | undefined {
    // Match: an object literal whose first key is one of the transition options.
    return code.match(/\{ (?:enter|exit|stagger|mode|move): [^}]*\}/)?.[0];
}

const FORMS: Array<[string, string, string]> = [
    ['@if with enter and exit', `@if (on) @transition('fade', 'out') { <p>x</p> }`, "{ enter: 'fade', exit: 'out', block: blockAnimation }"],
    ['@if with @mode', `@if (on) @transition('fade') @mode('out-in') { <p>x</p> } @else { <p>y</p> }`, "{ enter: 'fade', exit: 'fade', mode: 'out-in', block: blockAnimation }"],
    ['@for with @stagger', `@for (list as x; track x) @transition('fade') @stagger(50) { <p>{{ x }}</p> }`, "{ enter: 'fade', exit: 'fade', stagger: 50, animate: listAnimation }"],
    ['@for with @move alone', `@for (list as x; track x) @move(200) { <p>{{ x }}</p> }`, "{ move: '200', animate: listAnimation }"],
    ['@for with @empty', `@for (list as x; track x) @transition('fade') { <p>{{ x }}</p> } @empty { <p>none</p> }`, "{ enter: 'fade', exit: 'fade', animate: listAnimation }"],
    ['@for over a destructured row', `@for (list as { id }; track id) @transition('fade') { <p>{{ id }}</p> }`, "{ enter: 'fade', exit: 'fade', animate: listAnimation }"],
];

describe('transitions reach the runtime', () => {
    for (const [name, template, expected] of FORMS) {
        it(name, () => {
            const { inline, slot } = compiled(template);
            expect(options(inline), 'the render dropped the transition').toBe(expected);
            expect(options(slot), 'a snippet body dropped the transition').toBe(expected);
        });
    }

    it('a @for with a transition imports listAnimation, and one without does not (#1246)', () => {
        const animated = compiled(`@for (list as x; track x) @transition('fade') { <p>{{ x }}</p> }`).inline;
        expect(/import \{[^}]*\blistAnimation\b[^}]*\} from '@pdxui\/core'/.test(animated)).toBe(true);
        const plain = compiled(`@for (list as x; track x) { <p>{{ x }}</p> }`).inline;
        expect(plain).not.toContain('listAnimation');
        // An @if's transition runs with blockAnimation, not the list's.
        expect(compiled(`@if (on) @transition('fade') { <p>x</p> }`).inline).not.toContain('listAnimation');
    });

    // An @if is core's whenBlock, which carries no animation of its own; one with a transition names
    // blockAnimation, which an app whose blocks have none does not carry (#1259).
    it('an @if is whenBlock: with a transition it imports blockAnimation, without one nothing', () => {
        const coreImport = (code: string) => code.match(/import \{([^}]*)\} from '@pdxui\/core'/)?.[1].split(',').map((s) => s.trim()) ?? [];
        const animated = compiled(`@if (on) @transition('fade') { <p>x</p> }`).inline;
        expect(coreImport(animated)).toEqual(expect.arrayContaining(['whenBlock', 'blockAnimation']));
        expect(animated).toMatch(/=whenBlock\(/);
        const plain = compiled('@if (on) { <p>x</p> }').inline;
        expect(coreImport(plain)).toContain('whenBlock');
        expect(coreImport(plain)).not.toContain('when');
        expect(coreImport(plain)).not.toContain('blockAnimation');
        // A chain with a transition falls back to nested blocks (if-chain.ts), each with the animation.
        const chain = compiled(`@if (on) @transition('fade') { <p>a</p> } @else if (list.length) { <p>b</p> } @else { <p>c</p> }`).inline;
        expect(chain).not.toMatch(/[=,(]when\(/);
        expect(coreImport(chain)).toContain('blockAnimation');
    });

    it('a block with no transition passes no options', () => {
        const { inline, slot } = compiled('@if (on) { <p>x</p> }');
        expect(options(inline)).toBeUndefined();
        expect(options(slot)).toBeUndefined();
    });
});
