// Each component's tokens in the manifest (#154): the `--pdx-<component>-*` custom properties the
// design CSS reads for it, the surface a page overrides at `:root`, on a subtree or on one element.
// The manifest is what the component's docs page renders them from.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { buildManifest } from '../../scripts/gen-manifest.mjs';

type Prop = { name: string; default?: string };
const decl = (tag: string) => (buildManifest().manifest.modules as { declarations: { tagName: string; cssProperties?: Prop[] }[] }[])
    .map((m) => m.declarations[0]).find((d) => d.tagName === tag);
const names = (tag: string) => (decl(tag)?.cssProperties ?? []).map((p) => p.name);

describe('the manifest lists each component\'s tokens', () => {
    it('pdx-button: its colours, its shape, its hover', () => {
        expect(names('pdx-button')).toEqual(expect.arrayContaining([
            '--pdx-button-bg', '--pdx-button-bg-hover', '--pdx-button-color',
            '--pdx-button-radius', '--pdx-button-min-height', '--pdx-button-shadow-hover', '--pdx-button-transform-hover',
        ]));
    });

    it('a token tokens.css declares carries its default', () => {
        const prop = decl('pdx-button')?.cssProperties?.find((p) => p.name === '--pdx-button-min-height');
        expect(prop?.default).toBe('2.5rem');
    });

    it('a renamed token is listed by its new name only, not the alias read after it', () => {
        expect(names('pdx-button')).not.toContain('--pdx-button-hover-shadow');
        expect(names('pdx-accordion')).toContain('--pdx-accordion-transform-open');
        expect(names('pdx-accordion')).not.toContain('--pdx-accordion-open-transform');
    });

    it('control — a token is its longest component\'s, and a global namespace is nobody\'s', () => {
        // `--pdx-button-group-*` would be the group's; `--pdx-row-cell-height` is a table row's,
        // not the layout component pdx-row's.
        expect(names('pdx-button').some((n) => n.startsWith('--pdx-button-group-'))).toBe(false);
        expect(names('pdx-row')).not.toContain('--pdx-row-cell-height');
    });
});
