// The resolver is the thing that actually decides, so ask it — not a reimplementation of its rule.
//
// `registerUiManifest` skips a manifest module whose file no `exports` target points at
// (`component-resolver.ts:97`, `if (!name) continue`). Three shipped components hit that line, and
// nothing failed: writing `<pdx-page-header>` in a .pdx file registered no custom element and
// emitted only a console.warn nobody reads.
//
// The showcase did not catch it either, because `packages/site/src/components/pdx-demo.pdx:27`
// imports `@pdxui/ui/all` at mount, which side-effect registers all of them. A page that
// renders is evidence the component works, not evidence that auto-import found it.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';
import { injectComponentImports } from '../src/plugin-utils';
import { compile } from '../src/plugin';

const UI_MANIFEST = join(__dirname, '..', '..', 'ui', 'custom-elements.json');

interface ManifestModule {
    path?: string;
    declarations?: { tagName?: string }[];
}

describe('the resolver can auto-import every component @pdxui/ui ships', () => {
    it('finds the ui manifest', () => {
        expect(existsSync(UI_MANIFEST), UI_MANIFEST).toBe(true);
    });

    it('resolves every tagName in the manifest to an import path', () => {
        const manifest = JSON.parse(readFileSync(UI_MANIFEST, 'utf-8')) as { modules?: ManifestModule[] };
        const tags = (manifest.modules ?? [])
            .map(m => m.declarations?.[0]?.tagName)
            .filter((t): t is string => Boolean(t));
        // A zero here would make the loop below assert nothing.
        expect(tags.length).toBeGreaterThan(100);

        const resolver = new ComponentResolver();
        expect(resolver.registerUiManifest(), 'registerUiManifest found no components at all').toBe(true);

        const unresolved = tags.filter(t => resolver.resolve(t) === null);
        expect(
            unresolved,
            'the compiler would emit PDX_UNRESOLVED_COMPONENT for these and register nothing',
        ).toEqual([]);
    });

    it('emits the import a .pdx file using <pdx-page-header> needs', () => {
        // The end the developer sees: writing the tag must produce the import that registers the
        // custom element. Before the fix the tag compiled to markup with nothing importing it, and
        // the only sign was a console.warn.
        const source = [
            '<template><pdx-page-header title="Users" /></template>',
            '<script setup>',
            "  let ready = $signal(true);",
            '</script>',
        ].join('\n');
        const { code } = compile(source, 'users.pdx');

        const resolver = new ComponentResolver();
        resolver.registerUiManifest();
        const withImports = injectComponentImports(code, 'users.pdx', source, resolver);

        expect(withImports).toContain("@pdxui/ui/page-header");
    });
});

// warnUnsaved asks through the in-app dialog, and that dialog is drawn by
// <pdx-overlay-outlet>. No template names the tag, so the compiler adds the import the option needs.
describe('warnUnsaved brings the dialog outlet with it', () => {
    const importsFor = (script: string): string => {
        const source = ['<template><div>form</div></template>', '<script setup>', script, '</script>'].join('\n');
        const { code } = compile(source, 'edit-owner.pdx');
        const resolver = new ComponentResolver();
        resolver.registerUiManifest();
        return injectComponentImports(code, 'edit-owner.pdx', source, resolver);
    };

    it('@form { warnUnsaved } imports @pdxui/ui/overlay-outlet', () => {
        expect(importsFor('@form f: UserSchema { warnUnsaved: true }')).toContain('@pdxui/ui/overlay-outlet');
    });

    it('createForm({ warnUnsaved: true }) in script imports it too', () => {
        const script = "import { createForm } from '@pdxui/core';\nconst f = createForm({ initialValues: { name: '' }, warnUnsaved: true });";
        expect(importsFor(script)).toContain('@pdxui/ui/overlay-outlet');
    });

    it('control — a form without warnUnsaved does not', () => {
        expect(importsFor('@form f: UserSchema { saveMode: "onBlur" }')).not.toContain('overlay-outlet');
    });
});

// A tag NAMED IN A COMMENT is not a tag used.
//
// A comment in `app.pdx` explaining why the switcher is a NATIVE `<select>` and not a `<pdx-select>`
// must not put `pdx-select.ts` in the entry chunk — 47 KB of source, and with it `createDataSource`
// which it imports: 81 KB for a component the first screen does not render.
//
// Otherwise writing down why you did NOT use a component ships it. That is the worst shape a cost
// can take: invisible, and paid for being careful.
//
// And it goes unnoticed: the extra import is not an error. The component registers, nothing
// renders it, no warning fires, and the only symptom is a number in a bundle budget.
describe('a tag written in a comment is not a tag used', () => {
    const importsFor = (template: string): string => {
        const source = [`<template>${template}</template>`, '<script setup>', 'let ready = $signal(true);', '</script>'].join('\n');
        const { code } = compile(source, 'shell.pdx');
        const resolver = new ComponentResolver();
        resolver.registerUiManifest();
        return injectComponentImports(code, 'shell.pdx', source, resolver);
    };

    it('control — the same tag in the markup IS imported', () => {
        // Without this, the assertion below would pass on an auto-import that resolves nothing.
        expect(importsFor('<pdx-select :options="opts" />')).toContain('@pdxui/ui/select');
    });

    it('a component named only inside an HTML comment brings no import', () => {
        const template = [
            '<!-- A NATIVE select, not a <pdx-select>: the design system styles the element. -->',
            '<select><option>en</option></select>',
        ].join('\n');
        expect(importsFor(template), 'the comment shipped the component it says is not used')
            .not.toContain('@pdxui/ui/select');
    });

    it('a multi-line comment mentioning several does not bring any of them', () => {
        const template = [
            '<!--',
            '  Considered <pdx-data-grid> and <pdx-tree-select>, and used neither:',
            '  this screen shows three fields.',
            '-->',
            '<form><input name="q" /></form>',
        ].join('\n');
        const out = importsFor(template);
        expect(out).not.toContain('@pdxui/ui/data-grid');
        expect(out).not.toContain('@pdxui/ui/tree-select');
    });

    it('and a real tag after a comment on the same line still is', () => {
        // The strip must consume the comment and nothing past it — an over-greedy `-->` match
        // would silently drop the component that IS rendered, which fails at runtime rather than
        // here, and is a far worse defect than the one this is fixing.
        expect(importsFor('<!-- not <pdx-select> --><pdx-badge>3</pdx-badge>'))
            .toContain('@pdxui/ui/badge');
    });
});
