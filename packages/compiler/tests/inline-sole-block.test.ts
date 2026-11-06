// A block that is one control-flow node alone returns the node (#685, src/compiler/inline-sole-block.ts).
//
// An `@else if` branch, and a `@for` row that is one `@if` chain, cloned a static markup holding a
// single marker, walked to it, and replaced it with the node: a clone, a walk and a replaceWith per
// row that placed nothing of their own. What such a block renders is the same; core's render parity
// table holds the DOM (`an @if chain as a @for row`).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const render = (template: string) => compile(
    `<template>${template}</template>\n<script>\nlet rows = $signal([{ k: 1, a: true, b: false }]);\nlet on = $signal(true);\n</script>\n`,
    'p.pdx', [], undefined, { production: true },
).code;

/** The static blocks whose whole markup is markers and whitespace: what such a block cloned. */
const markerOnlyBlocks = (code: string) => [...code.matchAll(/staticMarkup\('((?:\s|<!---->)*)'\)/g)].map((m) => m[1]);

describe('a block that is one control-flow node alone', () => {
    it('an @else if branch and a row that is one @if chain clone no marker block', () => {
        const code = render('<ul>@for (rows as r; track r.k) { @if (r.a) { <li>a</li> } @else if (r.b) { <li>b</li> } @else { <li>c</li> } }</ul>');
        expect(markerOnlyBlocks(code)).toEqual([]);
        expect(code, 'the row is not the @if itself').toMatch(/eachRow\([^]*?\(r\)=>\{const __cf\d+=whenChain\(/);
    });

    it('returns the node itself: the whitespace around it is the block\'s edge, which keeps none (#907)', () => {
        const code = render('<p>@if (on) { <b>x</b> } @else { @if (!on) { <i>y</i> } }</p>');
        expect(markerOnlyBlocks(code)).toEqual([]);
        expect(code).toMatch(/\(\)=>\{const __cf\d+=when\([^]*?\);return __cf\d+;\}/);
        expect(code).not.toMatch(/__frag\.append\(/);
    });

    it('control: a block with content of its own beside the node still clones its markup', () => {
        const code = render('<ul>@for (rows as r; track r.k) { <li>{{ r.k }}</li> @if (r.a) { <i>a</i> } }</ul>');
        expect(code).toMatch(/staticMarkup\('<li><!----><\/li> <!---->'\)/);
    });
});
