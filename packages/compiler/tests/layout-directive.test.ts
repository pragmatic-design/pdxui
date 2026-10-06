// `@layout 'admin'` reaches the outlet, or it is a comment.
//
// A directive can parse and compile and still do nothing: read by `script-analyzer.ts`, emitted
// into the page's registration, declared by `outlet.ts` and `runtime.ts` — and read by nobody. The
// outlet builds its stack from `layouts`, PLURAL, so a field it does not read is a feature with no
// path from one end to the other.
//
// The wiring is a NAME resolved to a TAG at build time — the outlet knows how to hold a chain of
// tags, and `outlet-layouts.test.ts` measures that it does. So what is emitted is the resolved
// chain, and the name the author wrote does not travel: a route field nothing reads is the defect
// this file guards against.
//
// The rule, in one place (`layoutChain` in codegen-shared.ts):
//
//     @layout 'admin'  →  pdx-admin-layout   (admin/_layout.pdx), preferred
//                      →  pdx-admin          (admin.pdx), when the first is not a known tag
//
// The second form is what makes a layout writable as an ordinary component with a slot, which is
// what an app shell is. Knowing which of the two exists needs the resolver, so a compilation
// without one takes the first: the tag a layout file derives.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile } from '../src/plugin';

const PAGE = `<template><h1>Users</h1></template>
<script setup>
@page '/admin/users';
@layout 'admin';
</script>`;

/** The plugin's fifth argument, where the tag→module map reaches the compiler. */
const knowing = (map: Record<string, string>) => ({
    importPathOf: (tag: string) => map[tag] ?? null,
});

describe('@layout resolves to the chain the outlet reads', () => {
    it('emits the layout tag as the route chain', () => {
        const { code } = compile(PAGE, 'pages/users.pdx');
        expect(code, 'the page registered no layout chain, so the outlet builds no shell')
            .toContain('layouts:["pdx-admin-layout"]');
    });

    it('does not emit the name, which nothing reads', () => {
        const { code } = compile(PAGE, 'pages/users.pdx');
        expect(code, 'the unresolved name is still in the registration — it has no reader')
            .not.toContain('layout:"admin"');
    });

    it('falls back to the plain component tag when no layout file claims the name', () => {
        // A shell written as an ordinary component: `shell.pdx`, a slot and some chrome.
        const { code } = compile(PAGE.replace("'admin'", "'shell'"), 'pages/users.pdx',
            undefined, undefined, knowing({ 'pdx-shell': './shell.pdx' }));
        expect(code).toContain('layouts:["pdx-shell"]');
    });

    it('prefers the layout file when both exist', () => {
        const { code } = compile(PAGE, 'pages/users.pdx', undefined, undefined,
            knowing({ 'pdx-admin-layout': './admin/_layout.pdx', 'pdx-admin': './admin.pdx' }));
        expect(code).toContain('layouts:["pdx-admin-layout"]');
    });

    it('imports the layout module, so the element upgrades', () => {
        // Without the import the tag resolves to nothing: `document.createElement` returns an
        // unupgraded element, the page renders inside an empty box and nothing reports it. The same
        // mechanism `@defer` uses for the components in its body.
        const { code } = compile(PAGE, 'pages/users.pdx', undefined, undefined,
            knowing({ 'pdx-admin-layout': './admin/_layout.pdx' }));
        expect(code, 'the page does not load the layout it declares')
            .toContain("import './admin/_layout.pdx'");
    });

    it('control — a page without @layout registers no chain', () => {
        const { code } = compile(PAGE.replace("@layout 'admin';\n", ''), 'pages/users.pdx');
        expect(code).not.toContain('layouts:');
    });
});

// ─── The other mode ────────────────────────────────────────────────────────

// A field emitted by the page module alone exists in dev and nowhere else: a production build's
// compiled table REPLACES the registrations. `layout` lived exactly there for as long as it
// existed, which is why `route-field-lockstep.test.ts` had to excuse it.
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanForRoutes, generateOptimizedRouter, type ScannedRoute } from '../src/plugin-utils';

describe('and the same page in a production build', () => {
    let dir: string;
    let routes: ScannedRoute[];

    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'pdx-layout-'));
        mkdirSync(join(dir, 'src'), { recursive: true });
        writeFileSync(join(dir, 'src', 'users.pdx'), PAGE);
        routes = [];
        scanForRoutes(join(dir, 'src'), routes, (tag) => tag === 'pdx-admin-layout');
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('is scanned with its layout chain', () => {
        expect(routes[0]?.layouts, 'the scanned table carries no shell, so a built app renders none')
            .toEqual(['pdx-admin-layout']);
    });

    it('compiles the chain into the generated router', () => {
        expect(generateOptimizedRouter(routes)).toContain('layouts: ["pdx-admin-layout"]');
    });
});
