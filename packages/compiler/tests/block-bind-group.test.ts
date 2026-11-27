// The bindings of one block run in one effect (#1275).
//
// A block made an effect per binding, and that was the cost of a declarative template: pdx-fieldset
// written so made 13 at every mount and measured 1.4× its TypeScript version. The owner chose one effect
// per block (2026-11-27): the block gathers its bindings in a group, each one core's binding given the
// group, and `bindGroup` runs them. A block with one binding keeps the call as it was. An interpolation
// joins the group when it is text — a string, number or boolean prop, a primitive `$signal`, a literal,
// a template string — and keeps `bindInterpolation` when it may render nodes: in a group, an unrelated
// change would build them again.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT = [
    "@prop legend: string = '';",
    '@prop count: number = 0;',
    '@prop open: boolean = false;',
    "@prop items: string[] = [];",
    "let label = $signal('x');",
    'let node = $signal<Node | null>(null);',
].join('\n');

function full(template: string): string {
    return compile(`<template>${template}</template>\n<script>\n${SCRIPT}\n</script>\n`, 'group-probe.pdx', [], undefined, { production: true }).code;
}

function render(template: string): string {
    const code = full(template);
    return code.slice(code.indexOf('render:'));
}

/** The static markup of the render's first block, as the module writes it. */
const markup = (code: string): string => /staticMarkup\('([^']*)'\)/.exec(code)?.[1] ?? '';

/** The group names a render declares, in order. */
const groups = (code: string): string[] => [...code.matchAll(/const (__g)=\[\];/g)].map(m => m[1]);

describe('a block\'s bindings in one effect', () => {
    it('a block with several bindings gathers them in a group, run by bindGroup', () => {
        const code = render('<div :title="legend" :aria-expanded="open ? \'true\' : \'false\'" :style="open ? \'\' : \'display:none\'"></div>');
        const [g] = groups(code);
        expect(g, 'no group declared').toBeDefined();
        expect(code).toMatch(new RegExp(`bindAttributeOrProperty\\(__el\\d+, "title", "title", \\(\\)\\s*=>[^;]+, ${g}\\);`));
        expect(code).toMatch(new RegExp(`bindAttribute\\(__el\\d+, "aria-expanded", \\(\\)\\s*=>[^;]+, ${g}\\);`));
        expect(code).toMatch(new RegExp(`bindStyleText\\(__el\\d+, \\(\\)\\s*=>[^;]+, ${g}\\);`));
        expect(code.match(/bindGroup\(/g), 'one group, run once').toHaveLength(1);
        expect(code.indexOf(`bindGroup(${g}`), 'the group runs after its bindings').toBeGreaterThan(code.lastIndexOf(`, ${g});`));
    });

    it('a block with one binding keeps its own call, with no group', () => {
        const code = render('<div :title="legend"></div>');
        expect(groups(code)).toEqual([]);
        expect(code).not.toContain('bindGroup');
        expect(code).toMatch(/bindAttributeOrProperty\(__el\d+, "title", "title", \(\)\s*=>[^;]+\);/);
    });

    it('a value that cannot change is still written once, outside the group', () => {
        const code = render('<div :aria-label="\'fixed\'" :title="legend" :hidden="open"></div>');
        expect(code).toMatch(/bindAttribute\(__el\d+, "aria-label", 'fixed', 1\);/);
        expect(groups(code)).toHaveLength(1);
    });

    it('an interpolation of text joins the group: a typed prop, a primitive signal, a template string', () => {
        const code = render('<p :title="legend">{{ legend }} {{ count }} {{ open }} {{ label }} {{ `${legend}!` }}</p>');
        const [g] = groups(code);
        expect(code.match(new RegExp(`bindText\\(__t\\d+, ?\\(\\)\\s*=>[^;]+, ?${g}\\);`, 'g'))).toHaveLength(5);
        expect(code).not.toContain('bindInterpolation');
    });

    it('an interpolation that may render nodes keeps bindInterpolation, its own effect', () => {
        const code = render('<p :title="legend" :hidden="open">{{ node }} {{ items }} {{ legend }}</p>');
        expect(code.match(/bindInterpolation\(__t\d+,/g)).toHaveLength(2);
        expect(code.match(/bindText\(/g)).toHaveLength(1);
    });

    // With the props at their defaults most values are known at compile time: the markup holds them, and
    // bindGroup is given them, so the first run writes only what differs (codegen-mount-values).
    it('a value known at mount is in the markup and given to bindGroup: style, attribute, absent', () => {
        const code = full('<div :style="legend || open ? \'\' : \'display:none\'" :aria-expanded="open ? \'true\' : \'false\'" :aria-label="legend || null"></div>');
        expect(markup(code)).toContain('style="display:none"');
        expect(markup(code)).toContain('aria-expanded="false"');
        expect(markup(code), 'null is no attribute').not.toContain('aria-label=');
        expect(code).toMatch(/bindGroup\(__g,\[["']display:none["'],["']false["'],null\]\);/);
    });

    it('a value not known is a hole, and an attribute the tag writes itself is not written again', () => {
        const code = full('<div aria-label="fixed" :aria-label="legend || null" :aria-description="count + label" :hidden="open"></div>');
        // `count + label` reads a signal whose initial value is 'x': 0 + 'x' is '0x', known.
        expect(markup(code)).toContain('aria-description="0x"');
        expect(markup(code).match(/aria-label=/g), 'the static aria-label was written twice').toHaveLength(1);
        expect(code).toMatch(/bindGroup\(__g,\[,["']0x["'],false\]\);/);
    });

    it('a property that is not one of the boolean ones is not held: :title, null', () => {
        const code = full('<div :title="legend || null" :hidden="open"></div>');
        expect(code).toMatch(/bindGroup\(__g,\[,false\]\);/);
    });

    it('a property is held only as false, and only one that is false with no attribute', () => {
        const code = full('<input :disabled="open" :value="legend" />');
        expect(code).toMatch(/bindGroup\(__g,\[false\]\);/);
    });

    it('an interpolation is held when it renders no text: the markup holds an empty marker there', () => {
        const code = full('<p :aria-label="legend">{{ legend }} {{ count }}</p>');
        // aria-label '' is the empty attribute; {{ legend }} '' is held, {{ count }} 0 renders text: a hole.
        expect(markup(code)).toMatch(/<p aria-label(="")?>/);
        expect(code).toMatch(/bindGroup\(__g,\[(""|''),(""|'')\]\);/);
    });

    it('the control: a binding whose default is not known keeps a group with nothing given', () => {
        // A call is not evaluated: its value at mount is not known.
        const code = full('<div :aria-label="legend.trim()" :data-items="items.join(\',\')"></div>');
        expect(code).toMatch(/bindGroup\(__g\);/);
    });

    it('a :style beside a :style.x keeps its own effect: written last with the group, it would wipe that one', () => {
        const code = full('<div :style="legend" :style.color="label" :title="legend" :lang="label"></div>');
        expect(code).toMatch(/bindStyleText\(__el\d+, \(\)\s*=>[^;]+\);/);
        expect(code).not.toMatch(/bindStyleText\([^;]+__g\)/);
    });

    // In the group a getter is read again when anything the block reads changes. `[10, 20, 50]` given to
    // a component's prop is a new array at each read: assigned again, the component started over — the
    // showcase's tickets grid lost its search when the total changed. A property or a component's prop
    // joins the group when its value is a primitive; an attribute or a style writes a string, the same
    // for an equal value, and joins it always.
    it('a component prop or a property whose value may be an object keeps its own effect', () => {
        const code = render('<pdx-x :sizes="[10, 20]" :items="items" :label="legend" :count="count"></pdx-x><div :title="legend" :hidden="open"></div>');
        expect(code).toMatch(/bindComponentProp\(__el\d+, "sizes", \(\)=>\[10, 20\]\);/);
        expect(code).toMatch(/bindComponentProp\(__el\d+, "items", \(\)=>ctx\.items\(\)\);/);
        expect(code).toMatch(/bindComponentProp\(__el\d+, "label", \(\)=>ctx\.legend\(\), __g\);/);
        expect(code).toMatch(/bindComponentProp\(__el\d+, "count", \(\)=>ctx\.count\(\), __g\);/);
        const plain = render('<input :value="items" :title="legend" :hidden="open" />');
        expect(plain).toMatch(/bindNativeProperty\(__el\d+, "value", "value", \(\)=>ctx\.items\(\)\);/);
    });

    it('each block has its own group: a branch of an @if gathers its bindings apart from the root\'s', () => {
        const code = render('<div :title="legend" :hidden="open"></div>@if (open) { <span :title="legend" :aria-label="legend">{{ legend }}</span> }');
        expect(groups(code)).toHaveLength(2);
        expect(code.match(/bindGroup\(/g)).toHaveLength(2);
    });
});
