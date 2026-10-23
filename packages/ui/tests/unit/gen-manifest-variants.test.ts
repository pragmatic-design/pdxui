// A descriptor's `variants` (#512) reach the manifest: each axis with its values, its default and the
// native selector of each value (#626), which the design build checks its `@variant` rules against and
// certification generates one scenario per value from. Each axis is also a prop and an attribute,
// typed with its values, as core makes it one.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile } from '../../scripts/gen-manifest.mjs';

const SOURCE = [
    "component('pdx-widget', {",
    '    variants: {',
    "        variant: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost' },",
    "        size: ['md', 'sm', 'lg'],",
    '    },',
    '    render: () => html`<div></div>`,',
    '});',
].join('\n');

const declaration = () => analyzeFile('src/widget/pdx-widget.ts', SOURCE, {})[0].declarations[0];

describe('gen-manifest reads a descriptor\'s variants', () => {
    it('lists each axis with its values, its default and its native selectors', () => {
        expect(declaration().variants).toEqual([
            {
                name: 'variant', values: ['primary', 'solid', 'ghost'], default: 'primary',
                native: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost' },
            },
            { name: 'size', values: ['md', 'sm', 'lg'], default: 'md' },
        ]);
    });

    it('makes each axis a field and an attribute typed with its values', () => {
        const d = declaration();
        expect(d.members.find((m: { name: string }) => m.name === 'size'))
            .toMatchObject({ kind: 'field', type: { text: "'md' | 'sm' | 'lg'" }, default: "'md'", attribute: 'size' });
        expect(d.attributes.find((a: { fieldName: string }) => a.fieldName === 'variant'))
            .toMatchObject({ name: 'variant', type: { text: "'primary' | 'solid' | 'ghost'" }, default: "'primary'" });
    });

    it('a component that declares none has no variants entry', () => {
        const plain = analyzeFile('src/x/pdx-x.ts', "component('pdx-x', { render: () => html`<i></i>` });", {})[0].declarations[0];
        expect(plain.variants).toBeUndefined();
    });
});
