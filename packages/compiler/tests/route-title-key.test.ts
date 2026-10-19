// A page's `@title`, carried in the route table when it can be read without the page (#389).
//
// `__PDX_DEVTOOLS__.map()` names a route by its crumb. A page that declares `@title` and no label had
// no title there: the title lives in the page's module, imported lazily. When the title is a
// dictionary key — `@title $t('intake.title')` — or a string, it is data the compiler can read, and
// every table carries it, as `titleKey` or `title`, next to `labelKey`. A title that needs the
// page's params or a record (`$t('ticket.title', { id })`, `record?.name`) stays in the page.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateRouteTable, devSpecifier } from '../src/route-table';
import { scanForRoutes, type ScannedRoute } from '../src/plugin-utils';

const src = (script: string) =>
    `<template>\n<div>x</div>\n</template>\n<script>\n${script}\n</script>`;

const routeOf = (script: string) => analyzeScript(script, 'page.pdx').route;

const KEY_TITLE = "@page '/intake';\n@title $t('intake.title');\nlet n = $signal(0);";

describe('a page title the route table can carry', () => {
    it('$t with a literal key is a titleKey', () => {
        const route = routeOf(KEY_TITLE);
        expect(route.titleKey).toBe('intake.title');
        expect(route.title).toBeUndefined();
    });

    it('a string literal is a title', () => {
        const route = routeOf("@page '/board';\n@title 'Board';");
        expect(route.title).toBe('Board');
        expect(route.titleKey).toBeUndefined();
    });

    it('a key with params, or a title read from a record, carries nothing', () => {
        for (const title of ["$t('ticket.title', { id: id })", 'record?.name', "'Ticket ' + id"]) {
            const route = routeOf(`@page '/tickets/:id';\n@title ${title};`);
            expect(route.titleKey, title).toBeUndefined();
            expect(route.title, title).toBeUndefined();
        }
    });

    it('a string with an escape is left to the page: its text is not the source between the quotes', () => {
        const route = routeOf("@page '/a';\n@title 'It\\'s';");
        expect(route.title).toBeUndefined();
    });

    it('the page registers it', () => {
        const code = compile(src(KEY_TITLE), 'intake.pdx').code;
        expect(code).toContain('titleKey:"intake.title"');
    });

    const TITLED = [
        { path: '/intake', file: '/app/src/intake.pdx', tag: 'pdx-intake', titleKey: 'intake.title', lazy: true },
        { path: '/board', file: '/app/src/board.pdx', tag: 'pdx-board', title: 'Board', lazy: true },
    ];

    it('the dev server\'s route table carries it', () => {
        const module = generateRouteTable(TITLED, devSpecifier('/app'), { devtools: true });
        expect(module).toContain('titleKey: "intake.title"');
        expect(module).toContain('title: "Board"');
    });

    // Only __PDX_DEVTOOLS__.map() reads it, and that exists in development only.
    it('a production build leaves it out, from the table and from the page', () => {
        const table = generateRouteTable(TITLED);
        expect(table).not.toContain('titleKey');
        expect(table).not.toContain('title:');
        const code = compile(src(KEY_TITLE), 'intake.pdx', [], undefined, { production: true }).code;
        expect(code).not.toContain('titleKey');
    });
});

describe('the route scan reads it', () => {
    let root: string;
    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), 'pdx-title-'));
        mkdirSync(join(root, 'src'));
        writeFileSync(join(root, 'src', 'intake.pdx'), src(KEY_TITLE));
        writeFileSync(join(root, 'src', 'ticket.pdx'), src("@page '/tickets/:id';\n@title $t('ticket.title', { id: id });"));
    });
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('a literal key reaches the scanned route, a key with params does not', () => {
        const routes: ScannedRoute[] = [];
        scanForRoutes(join(root, 'src'), routes);
        const byPath = Object.fromEntries(routes.map((r) => [r.path, r]));
        expect(byPath['/intake'].titleKey).toBe('intake.title');
        expect(byPath['/tickets/:id'].titleKey).toBeUndefined();
        expect(byPath['/tickets/:id'].title).toBeUndefined();
    });
});
