// A component written in .pdx is in the manifest as its TypeScript version is (#1003).
//
// The library moves to .pdx (#686), and custom-elements.json is what the compiler's auto-import, the
// LSP, the site, the skill catalogue, the variants and the certification registry read. A .pdx under
// src/ that the generator skipped would register its tag and be absent from all of them.
//
// The oracle is the TypeScript component: the pilot's .pdx rewrites are held to its unit tests and
// certification, and their manifest declaration must be the TypeScript one, field for field. Only the
// module's path differs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile, parseCategories } from '../../scripts/gen-manifest.mjs';

const UI = join(__dirname, '..', '..');

interface Declaration { tagName: string; [key: string]: unknown }
interface Module { path: string; declarations: Declaration[]; exports: { declaration: { module: string } }[] }

function declarationOf(relPath: string): Declaration[] {
    const file = join(UI, relPath);
    const mods = analyzeFile(file, readFileSync(file, 'utf-8'), parseCategories()) as Module[];
    return mods.map((m) => m.declarations[0]);
}

// The pilot's pairs left as their components moved to src/: the switch's (#1008), held since by
// switch-is-pdx.test.ts, and the select's (#1210), held by ported-components.test.ts, which compares
// every moved tag's declaration with the one recorded from its TypeScript version, field by field.
describe('a .pdx component in the manifest, against its TypeScript version', () => {
    it('reads a moved component as a .pdx, under its tag', () => {
        expect(declarationOf('src/select/pdx-select.pdx').map((d) => d.tagName)).toEqual(['pdx-select']);
    });

    // The control: a TypeScript component is read as before. The library has none left (#1454), and an
    // application may still write one with core's component(), so the reader is held on a source here.
    it('the control: a TypeScript component is read as before', () => {
        const source = [
            "import { component, prop, html } from '@pdxui/core';",
            "component('pdx-probe', {",
            "    props: { label: prop('') },",
            '    render: () => html`<span></span>`,',
            '});',
        ].join('\n');
        const mods = analyzeFile('src/probe/pdx-probe.ts', source, {}) as Module[];
        expect(mods.map((m) => m.declarations[0].tagName)).toEqual(['pdx-probe']);
        expect(mods[0].path).toBe('src/probe/pdx-probe.ts');
    });
});

describe('a .pdx state whose name has a hyphen (#1230)', () => {
    const source = [
        '<template><span data-part="root"></span></template>',
        '<script>',
        '/** A probe. */',
        "@prop pos: string = 'center';",
        '/** `pos="left"`: the line before the label is short. */',
        "@state label-left = pos === 'left';",
        '@part root;',
        '</script>',
    ].join('\n');
    const decl = (analyzeFile(join(UI, 'src', 'states', 'pdx-states.pdx'), source, parseCategories()) as Module[])[0].declarations[0];

    it('is in the manifest under its name, with its doc', () => {
        expect(decl.cssStates).toEqual([{ name: 'label-left', description: '`pos="left"`: the line before the label is short.' }]);
    });
});

describe('the variant axes of a .pdx, each with its doc inside the @variants block (#1228)', () => {
    const source = [
        '<template><span data-part="root"></span></template>',
        '<script>',
        '/** A probe. */',
        '@variants {',
        '  /** sm, md (the default) or lg. */',
        "  size: { md: '.x-md', sm: '.x-sm', lg: '.x-lg' } = md;",
        '  /** pill (the default) or square. */',
        "  shape: { pill: '.x-pill', square: '.x-square' } = pill;",
        '}',
        '@part root;',
        '</script>',
    ].join('\n');
    const decl = (analyzeFile(join(UI, 'src', 'axes', 'pdx-axes.pdx'), source, parseCategories()) as Module[])[0].declarations[0];
    const described = (name: string) => (decl.attributes as { name: string; description?: string }[]).find((a) => a.name === name)?.description;

    it('writes each axis\'s description to the manifest', () => {
        expect(described('size')).toBe('sm, md (the default) or lg.');
        expect(described('shape')).toBe('pill (the default) or square.');
    });
});
