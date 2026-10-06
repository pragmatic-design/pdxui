// Component packages are discovered, not hard-coded.
//
// A resolver that knows one package, @pdxui/ui, leaves any other package that ships custom elements —
// @pdxui/router, or a third party's — invisible: no auto-import, no prop list, and a false
// "unresolved component". A dependency whose package.json has a `customElements` field is a
// component source, its manifest is read from that field, and its tags map to its `exports`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';
import { componentPackages } from '../src/component-packages';
import { injectComponentImports } from '../src/plugin-utils';
import { validate } from '../src/compiler/validate';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { parseTemplate } from '../src/parser/template';

let root: string;

function write(rel: string, content: unknown): void {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

/** A package in node_modules (under `at`) that ships `acme-chip` from `./chip`. */
function widgetsPackage(at = 'node_modules/@acme/widgets'): void {
    write(`${at}/package.json`, {
        name: '@acme/widgets',
        version: '1.0.0',
        customElements: 'custom-elements.json',
        exports: { '.': './src/index.js', './chip': './src/chip.js', './package.json': './package.json' },
    });
    write(`${at}/custom-elements.json`, {
        schemaVersion: '1.0.0',
        modules: [{
            kind: 'javascript-module',
            path: 'src/chip.js',
            declarations: [{
                kind: 'class', customElement: true, name: 'AcmeChip', tagName: 'acme-chip',
                members: [{ kind: 'field', name: 'tone', type: { text: "'info' | 'warn'" } }],
            }],
        }],
    });
    write(`${at}/src/chip.js`, "customElements.define('acme-chip', class extends HTMLElement {});\n");
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-packages-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('componentPackages(root)', () => {
    it('finds a dependency that declares customElements, and skips one that does not', () => {
        write('package.json', { name: 'app', dependencies: { '@acme/widgets': '1.0.0', 'left-pad': '1.0.0' } });
        widgetsPackage();
        write('node_modules/left-pad/package.json', { name: 'left-pad', version: '1.0.0' });

        expect(componentPackages(root).map(p => p.name)).toEqual(['@acme/widgets']);
    });

    it('looks in devDependencies too', () => {
        write('package.json', { name: 'app', devDependencies: { '@acme/widgets': '1.0.0' } });
        widgetsPackage();

        expect(componentPackages(root).map(p => p.name)).toEqual(['@acme/widgets']);
    });

    it('through a meta-package: the components of a dependency of a dependency', () => {
        write('package.json', { name: 'app', dependencies: { '@acme/kit': '1.0.0' } });
        write('node_modules/@acme/kit/package.json', { name: '@acme/kit', version: '1.0.0', dependencies: { '@acme/widgets': '1.0.0' } });
        widgetsPackage('node_modules/@acme/kit/node_modules/@acme/widgets');

        expect(componentPackages(root).map(p => p.name)).toEqual(['@acme/widgets']);
    });
});

describe('the resolver over component packages', () => {
    beforeEach(() => {
        write('package.json', { name: 'app', dependencies: { '@acme/widgets': '1.0.0' } });
        widgetsPackage();
    });

    it('maps a third-party tag to its package export, with its enums', () => {
        const r = new ComponentResolver();
        r.registerComponentPackages(root);

        expect(r.resolve('acme-chip')?.importPath).toBe('@acme/widgets/chip');
        expect(r.enumValues('acme-chip', 'tone')).toEqual(['info', 'warn']);
    });

    it('auto-imports it in a compiled module', () => {
        const r = new ComponentResolver();
        r.registerComponentPackages(root);
        const source = '<template><acme-chip tone="info"></acme-chip></template>';

        const out = injectComponentImports("import { component } from '@pdxui/core';\n", join(root, 'src', 'a.pdx'), source, r);

        expect(out).toContain("import '@acme/widgets/chip';");
    });

    it('PDX_UNRESOLVED_COMPONENT names where it looked', () => {
        const r = new ComponentResolver();
        r.registerComponentPackages(root);
        r.registerProjectComponents(root);
        const analysis = analyzeScript('', 'a.pdx', { setup: true });
        const [w] = validate(analysis, parseTemplate('<acme-nope></acme-nope>'), 'a.pdx', {
            isKnownTag: t => r.has(t),
            searched: () => r.searched,
        }).filter(x => x.code === 'PDX_UNRESOLVED_COMPONENT');

        expect(w?.hint).toContain('Searched: @acme/widgets, src/, pages/');
    });
});

describe('@pdxui/router is a component package', () => {
    it('<pdx-router-outlet> and <pdx-link> resolve to the router exports', () => {
        const r = new ComponentResolver();
        r.registerComponentPackages(); // monorepo: the packages/* siblings

        expect(r.resolve('pdx-router-outlet')?.importPath).toBe('@pdxui/router/outlet');
        expect(r.resolve('pdx-link')?.importPath).toBe('@pdxui/router/link');
        expect(r.resolve('pdx-button')?.importPath).toBe('@pdxui/ui/button');
    });
});
