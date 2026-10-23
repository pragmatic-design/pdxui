// The design build's `@variant` (#512, specified by #626): the rules of the package checked against
// the variant axes `packages/ui/custom-elements.json` lists, and the stylesheets under src/ generated
// from packages/design/variant-sources.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    DESIGN, VARIANT_SOURCES, checkVariants, generatedStylesheet, manifestAxes, packageVariantFiles, variantSources,
// @ts-expect-error — plain .mjs build script, no type declarations by design
} from '../../design/scripts/variant-build.mjs';

interface Diagnostic { code: string; severity: string; file: string; line: number; message: string }

const AXES = new Map([
    ['pdx-button', [
        { name: 'variant', values: ['primary', 'solid', 'ghost', 'danger'], default: 'primary', native: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost', danger: '.pdx-danger' } },
        { name: 'size', values: ['md', 'sm'], default: 'md' },
    ]],
    ['pdx-card', []],
]);
const own = (css: string) => ({ path: 'variant-sources/components/button.css', css, impliedTag: 'pdx-button' });
const other = (css: string) => ({ path: 'theme-sources/material.css', css, impliedTag: undefined });
const STYLED = '@variant variant(ghost) { :scope { color: red } }\n@variant variant(danger) { :scope { color: red } }\n@variant size(sm) { :scope { margin: 0 } }';
const codes = (files: unknown[], code: string): Diagnostic[] => (checkVariants(files, AXES) as Diagnostic[]).filter((d) => d.code === code);

describe('PDX_VARIANT_UNKNOWN', () => {
    it('a value the axis does not have, an axis the tag does not declare, a tag that declares none', () => {
        const found = codes([own(`${STYLED}\n@variant variant(primay) { :scope { color: red } }`), other('@variant pdx-button tone(dark) { :scope { color: red } }\n@variant pdx-card size(sm) { :scope { margin: 0 } }')], 'PDX_VARIANT_UNKNOWN');
        expect(found.map((d) => d.message)).toEqual([
            "@variant pdx-button variant(primay): 'primay' is not a value of the axis 'variant' (primary, solid, ghost, danger).",
            "@variant pdx-button tone(dark): 'tone' is not a variant axis of pdx-button (variant, size).",
            "@variant pdx-card size(sm): 'size' is not a variant axis of pdx-card (none declared).",
        ]);
        expect(found.every((d) => d.severity === 'error')).toBe(true);
        expect(found[0], 'the file and line it was written on').toMatchObject({ file: 'variant-sources/components/button.css', line: 4 });
    });

    it('a tag that is not a component, and a rule outside a component\'s own stylesheet that names none', () => {
        expect(codes([other('@variant pdx-buton size(sm) { :scope { margin: 0 } }\n@variant size(sm) { :scope { margin: 0 } }')], 'PDX_VARIANT_UNKNOWN').map((d) => d.message)).toEqual([
            "@variant pdx-buton size(sm): 'pdx-buton' is not a component of @pdxui/ui.",
            '@variant size(sm) names no tag: outside a component\'s own stylesheet a rule names it, @variant pdx-<name> size(sm).',
        ]);
    });
});

describe('PDX_VARIANT_UNSTYLED', () => {
    it('a declared value other than the default that no rule of the package styles', () => {
        const found = codes([own('@variant variant(ghost) { :scope { color: red } }')], 'PDX_VARIANT_UNSTYLED');
        expect(found.map((d) => d.message)).toEqual([
            'pdx-button declares variant: danger, and no @variant rule of @pdxui/design styles it.',
            'pdx-button declares size: sm, and no @variant rule of @pdxui/design styles it.',
        ]);
        expect(found.every((d) => d.severity === 'warn')).toBe(true);
    });

    it('a rule for several values styles each of them, and an unknown one among them is reported alone', () => {
        const files = [own('@variant variant(ghost, danger, dangr) and size(sm) { :scope { color: red } }')];
        expect(codes(files, 'PDX_VARIANT_UNSTYLED')).toEqual([]);
        expect(codes(files, 'PDX_VARIANT_UNKNOWN').map((d) => d.message)).toEqual([
            "@variant pdx-button variant(dangr): 'dangr' is not a value of the axis 'variant' (primary, solid, ghost, danger).",
        ]);
    });

    it('a rule in a theme source styles the value too', () => {
        expect(codes([own('@variant variant(ghost) { :scope { color: red } }'), other('@variant pdx-button variant(danger) and size(sm) { :scope { color: red } }')], 'PDX_VARIANT_UNSTYLED')).toEqual([]);
    });

    it('control — every value styled reports nothing, the default and a value sharing its native selector included', () => {
        expect(checkVariants([own(STYLED)], AXES)).toEqual([]);
    });
});

describe('the package', () => {
    const axes = manifestAxes();

    it('reads every component of the manifest, with the axes it declares', () => {
        // The control: an empty map would make every check below pass by checking nothing.
        expect(axes.size).toBeGreaterThan(100);
        expect(axes.get('pdx-button')).toBeInstanceOf(Array);
    });

    it('its @variant rules name only what the manifest declares', () => {
        const errors = (checkVariants(packageVariantFiles(axes), axes) as Diagnostic[]).filter((d) => d.severity === 'error');
        expect(errors).toEqual([]);
    });

    for (const rel of variantSources() as string[]) {
        it(`${rel}: src is what variant-sources generates — run packages/design/scripts/gen-variants.mjs`, () => {
            const out = join(DESIGN, 'src', rel);
            expect(existsSync(out)).toBe(true);
            expect(readFileSync(out, 'utf8')).toBe(generatedStylesheet(readFileSync(join(VARIANT_SOURCES, rel), 'utf8'), rel, axes));
        });
    }

    it('no stylesheet under src carries an @variant: it would reach the browser unexpanded', () => {
        const src = join(DESIGN, 'src');
        const raw = (readdirSync(src, { recursive: true }) as string[])
            .filter((f) => f.endsWith('.css') && readFileSync(join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').includes('@variant'));
        expect(raw).toEqual([]);
    });
});
