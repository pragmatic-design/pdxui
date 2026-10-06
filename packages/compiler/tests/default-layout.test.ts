// A default layout for the routes that declare none, and `@layout 'none'` to opt out.
//
// Without a default, moving an app's shell into a layout means writing `@layout 'shell'` on every
// page, which is boilerplate — rule 1 of this repository, a
// framework bug. `pdx({ defaultLayout })` states it once, and a page that must stand alone (a
// sign-in) says so with `@layout 'none'`.
//
// Both readers of a route are pinned, because they must not disagree: the page's own registration
// (`compile`) and the table the generated router is built from (`scanForRoutes`).
import { describe, it, expect, afterEach } from 'vitest';
import { compile } from '../src/plugin';
import { scanForRoutes, type ScannedRoute } from '../src/plugin-utils';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const page = (directives: string) => `
<template><div>Page</div></template>
<script setup>
@page '/p';
${directives}
</script>`;

describe("a page's own registration", () => {
    it('takes the default layout when it declares none', () => {
        const { code } = compile(page(''), 'p.pdx', undefined, undefined, { defaultLayout: 'shell' });
        expect(code, 'the default layout did not reach the route').toContain('layouts:["pdx-shell-layout"]');
    });

    it("and none at all with @layout 'none'", () => {
        const { code } = compile(page("@layout 'none';"), 'p.pdx', undefined, undefined, { defaultLayout: 'shell' });
        expect(code, "@layout 'none' still got a layout").not.toContain('layouts:');
    });

    it('control — a page that names its own layout keeps it', () => {
        const { code } = compile(page("@layout 'admin';"), 'p.pdx', undefined, undefined, { defaultLayout: 'shell' });
        expect(code).toContain('layouts:["pdx-admin-layout"]');
    });

    it('control — with no default, a page with no @layout has none, as before', () => {
        const { code } = compile(page(''), 'p.pdx');
        expect(code).not.toContain('layouts:');
    });
});

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function scan(source: string, defaultLayout?: string): ScannedRoute[] {
    const dir = mkdtempSync(join(tmpdir(), 'pdx-layout-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'p.pdx'), source, 'utf-8');
    const routes: ScannedRoute[] = [];
    scanForRoutes(dir, routes, undefined, defaultLayout);
    return routes;
}

describe('the route table the generated router is built from', () => {
    it('takes the default layout when the page declares none', () => {
        expect(scan(page(''), 'shell')[0].layouts).toEqual(['pdx-shell-layout']);
    });

    it("and none with @layout 'none'", () => {
        expect(scan(page("@layout 'none';"), 'shell')[0].layouts).toBeUndefined();
    });

    it('control — an explicit layout wins over the default', () => {
        expect(scan(page("@layout 'admin';"), 'shell')[0].layouts).toEqual(['pdx-admin-layout']);
    });
});
