// Application components get the `app-` prefix (#136): an app's `button.pdx` was `<pdx-button>`,
// the library's tag. `pdx({ prefix })` changes it, `@tag` still overrides, and `pdx-` is reserved for
// the `@pdxui/*` packages (PDX_TAG_RESERVED). The scans that assumed every component tag starts with
// `pdx-` — what a `@defer` loads, PDX_UNRESOLVED_COMPONENT — read the project's components instead.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { deriveTag } from '../src/compiler/codegen-shared';
import { ComponentResolver } from '../src/component-resolver';
import { injectComponentImports } from '../src/plugin-utils';
import { LANGUAGE_CHANGES } from '../src/language/changes';
import { projectTagRenames } from '../src/language/app-prefix';

const sfc = (script = '', template = '<p>x</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
const registered = (code: string) => /component\('([\w-]+)'/.exec(code)?.[1];

describe('the tag a file derives', () => {
    it('is app- + the file name, a special file keeping its parent', () => {
        expect(deriveTag('src/button.pdx')).toBe('app-button');
        expect(deriveTag('src/admin/_layout.pdx')).toBe('app-admin-layout');
        expect(deriveTag('src/_layout.pdx')).toBe('app-layout');
    });
    it('a file named pdx-… drops the reserved prefix instead of keeping it', () => {
        expect(deriveTag('src/pdx-code.pdx')).toBe('app-code');
    });
    it('compiles to that tag, and pdx({ prefix }) changes it', () => {
        expect(registered(compile(sfc(), 'src/button.pdx').code)).toBe('app-button');
        expect(registered(compile(sfc(), 'src/button.pdx', [], undefined, { prefix: 'acme' }).code)).toBe('acme-button');
    });
    it('@tag still overrides', () => {
        expect(registered(compile(sfc("@tag 'app-big-button';"), 'src/button.pdx').code)).toBe('app-big-button');
    });
    it('@layout resolves to the prefixed layout tag', () => {
        const { code } = compile(sfc("@page '/x';\n@layout 'admin';"), 'pages/users.pdx');
        expect(code).toContain('layouts:["app-admin-layout"]');
    });
});

describe('PDX_TAG_RESERVED', () => {
    const reserved = (source: string, file = 'src/x.pdx') => compile(source, file).warnings.filter(w => w.code === 'PDX_TAG_RESERVED');
    it('an app tag starting with pdx- is an error', () => {
        const [w] = reserved(sfc("@tag 'pdx-button';"));
        expect(w).toMatchObject({ severity: 'error' });
        expect(w.message).toContain('pdx-button');
    });
    it('the control: an app- tag raises nothing', () => {
        expect(reserved(sfc("@tag 'app-button';"))).toEqual([]);
    });
});

describe('the scans read the project, not the prefix', () => {
    let root: string;
    afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
    const project = () => {
        root = mkdtempSync(join(tmpdir(), 'pdx-prefix-'));
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'src', 'chart.pdx'), sfc());
        const resolver = new ComponentResolver();
        resolver.registerProjectComponents(root);
        return resolver;
    };

    it('an app- component used only inside @defer is loaded by the block, not imported statically', () => {
        const resolver = project();
        const page = join(root, 'src', 'page.pdx');
        const source = sfc('', '@defer (interaction) { <app-chart></app-chart> }');
        const { code } = compile(source, page, [], undefined, { production: true, importPathOf: (t) => resolver.resolve(t)?.importPath ?? null });
        const out = injectComponentImports(code, page, source, resolver);
        expect(out).toMatch(/import\(\s*['"][^'"]*chart\.pdx['"]\s*\)/);
        expect(out).not.toMatch(/^import ['"][^'"]*chart\.pdx['"];/m);
    });

    it('an unknown app- tag raises PDX_UNRESOLVED_COMPONENT', () => {
        const resolver = project();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const page = join(root, 'src', 'page.pdx');
        const source = sfc('', '<app-chart></app-chart><app-nowhere></app-nowhere>');
        injectComponentImports(compile(source, page).code, page, source, resolver);
        const said = warn.mock.calls.flat().join('\n');
        expect(said).toContain('<app-nowhere> is unresolved');
        expect(said).not.toContain('<app-chart> is unresolved');
    });
});

describe('projectTagRenames', () => {
    it("maps each component's alpha tag to its tag now, a pdx- @tag included; a library tag is left out", () => {
        const renames = projectTagRenames([
            { tag: 'app-user-card', file: 'src/user-card.pdx', declaredTag: null },
            { tag: 'pdx-hot-badge', file: 'src/badge.pdx', declaredTag: 'pdx-hot-badge' },
            { tag: 'app-own', file: 'src/x.pdx', declaredTag: 'app-own' },
            { tag: 'app-button', file: 'src/button.pdx', declaredTag: null },
        ], 'app', (t) => t === 'pdx-button');
        expect([...renames]).toEqual([['pdx-user-card', 'app-user-card'], ['pdx-hot-badge', 'app-hot-badge']]);
    });
});

describe('pdx migrate renames the app tags', () => {
    const change = LANGUAGE_CHANGES.find(c => c.id === 'app-prefix');
    const context = { projectTags: new Map([['pdx-user-card', 'app-user-card'], ['pdx-shell', 'app-shell']]) };
    it('is a removed form with a rewrite', () => {
        expect(change?.kind).toBe('removed');
        expect(typeof change?.fix).toBe('function');
    });
    it('in the template, the CSS and @tag; a library tag and a longer name are left alone', () => {
        const src = "<template>\n<pdx-shell><pdx-user-card :user=\"u\"></pdx-user-card><pdx-button>x</pdx-button><pdx-user-cards></pdx-user-cards></pdx-shell>\n</template>\n<script>\n@tag 'pdx-user-card';\nconst el = document.querySelector('pdx-user-card');\n</script>\n<style scoped>\npdx-user-card { display: block; }\npdx-shell > .x { gap: 1px; }\n</style>\n";
        const out = (change!.fix as (t: string, c?: unknown) => string)(src, context);
        expect(out).toContain('<app-shell><app-user-card :user="u"></app-user-card><pdx-button>x</pdx-button><pdx-user-cards></pdx-user-cards></app-shell>');
        expect(out).toContain("@tag 'app-user-card';");
        expect(out).toContain('app-user-card { display: block; }');
        expect(out).toContain('app-shell > .x');
        // A tag in a string is not rewritten: app-prefix-string flags it, in a script as in a .pdx's.
        expect(out).toContain("document.querySelector('pdx-user-card')");
        const strings = LANGUAGE_CHANGES.find(c => c.id === 'app-prefix-string')!;
        expect(strings.fix).toBe('flag');
        expect(strings.detect("@tag 'pdx-user-card';\nconst el = document.querySelector('main > pdx-user-card');\nconst other = 'pdx-user-cards';\nconst q = 'pdx-user-card, [data-test=\"x\"]';", context).map(f => f.found))
            .toEqual(["'main > pdx-user-card'", "'pdx-user-card, [data-test=\"x\"]'"]);
    });
});
