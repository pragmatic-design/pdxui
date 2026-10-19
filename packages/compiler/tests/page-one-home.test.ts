// `@page` is the one home of every route field, and `@head` is gone (#277; docs/language/beta/routing.md,
// «@page — alpha → beta», «Removed: @route, @alias, @prefetch, the script @transition», «The document
// head»). The alpha forms are PDX_REMOVED_FORM naming their replacement, and `pdx migrate` rewrites
// each into `@page` and the declarations that stay.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { RUNES } from '../src/compiler/runes';
import { routeBlock, pageAlias, pagePrefetch, pageTransition, routeMeta, headBlock } from '../src/language/route-fields';
import type { LanguageChange } from '../src/language/changes';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
/** Every `__pdx_pushRoute({…})` line the module emits. */
const routeLines = (code: string) => code.split('\n').filter((l) => l.startsWith('__pdx_pushRoute({'));
/** The defects of a compile: errors and warnings, not the design questions. */
const defects = (source: string, name: string) => compile(source, name).warnings.filter((w) => w.severity !== 'info').map((w) => w.code);
const CHANGES: LanguageChange[] = [routeBlock, pageAlias, pagePrefetch, pageTransition, routeMeta, headBlock];
/** What `pdx migrate` does to a .pdx with these changes: each rewrite, in the registry's order. */
const migrate = (text: string) => CHANGES.reduce((t, c) => (c.fix === 'flag' ? t : c.fix(t)), text);

// The route table the alpha forms produced, read from main before this change:
//   @page '/users'; @alias '/people'; @prefetch 'hover'; @transition 'fade'; @meta { requiresAuth: true };
const ALPHA_ROUTES = [
    `__pdx_pushRoute({path:"/users",tag:"app-users",prefetch:"hover",transition:"fade",meta:{"requiresAuth":true},lazy:true,file:'./users.pdx'});`,
    `__pdx_pushRoute({path:"/people",tag:"app-users",prefetch:"hover",transition:"fade",meta:{"requiresAuth":true},lazy:true,file:'./users.pdx'});`,
];
const BETA = "@page '/users', '/people' { prefetch: 'hover', transition: 'fade', meta: { requiresAuth: true } };";
const ALPHA = "@page '/users';\n@alias '/people';\n@prefetch 'hover';\n@transition 'fade';\n@meta { requiresAuth: true };";

describe('@page carries every route field', () => {
    it('further paths and the options prefetch, transition and meta make the route table the alpha forms made', () => {
        const r = compile(pdx(BETA), 'users.pdx');
        expect(r.warnings.filter((w) => w.severity !== 'info').map((w) => w.code)).toEqual([]);
        expect(routeLines(r.code)).toEqual(ALPHA_ROUTES);
    });

    it('reads an options block over several lines, a nested meta included', () => {
        const source = pdx("@page '/x' {\n  keepAlive,\n  meta: { crumb: { label: 'X' }, order: 2 },\n  transition: 'slide-left'\n};");
        expect(defects(source, 'ml.pdx')).toEqual([]);
        const route = routeLines(compile(source, 'ml.pdx').code)[0];
        for (const field of ['keepAlive:true', 'transition:"slide-left"', 'meta:{"crumb":{"label":"X"},"order":2}']) expect(route, field).toContain(field);
    });

    it('an option it does not have is PDX_PAGE_UNKNOWN_OPTION, and the ones it has are not', () => {
        const unknown = compile(pdx("@page '/x' { guard: 'admin', keepAlive };"), 'unk.pdx').warnings.filter((w) => w.code === 'PDX_PAGE_UNKNOWN_OPTION');
        expect(unknown.map((w) => w.message)).toEqual(['`guard` is not an option of @page: it would be ignored.']);
        expect(defects(pdx("@page '/x' { keepAlive: 60000, preload, prefetch: 'eager', label: 'X', transition: 'fade', meta: { a: 1 } };"), 'all.pdx')).toEqual([]);
    });

    it('@meta with a name still writes a head tag', () => {
        const r = compile(pdx("@meta description: 'Users';"), 'head.pdx');
        expect(r.code).toContain('name: "description", content: "Users"');
    });
});

describe('the alpha forms are removed', () => {
    const cases: [string, string, string][] = [
        ['@route', "@route { path: '/users', guard: 'admin' }", '`@route { … }` is removed'],
        ['@alias', "@page '/users';\n@alias '/people';", '`@alias` is removed'],
        ['@prefetch', "@page '/users';\n@prefetch 'hover';", '`@prefetch` is removed'],
        ['@transition', "@page '/users';\n@transition 'fade';", "the script's `@transition` is removed"],
        ['@meta { … }', "@page '/users';\n@meta { requiresAuth: true };", '`@meta { … }` is removed'],
        ['@head', "@head {\n  title: 'Users',\n  meta: [{ name: 'description', content: 'All of them' }]\n}", '`@head { … }` is removed'],
    ];
    for (const [form, script, message] of cases) {
        it(`${form} is PDX_REMOVED_FORM naming its replacement, and nothing else`, () => {
            const r = compile(pdx(script), 'removed.pdx');
            const removed = r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
            expect(removed).toHaveLength(1);
            expect(removed[0].message).toContain(message);
            expect(r.warnings.filter((w) => w.severity !== 'info' && w.code !== 'PDX_REMOVED_FORM').map((w) => w.code)).toEqual([]);
        });
    }

    it('the template\'s @transition modifier is not one of them', () => {
        const r = compile(pdx('let open = $signal(true);', '@if (open) @transition(\'fade\') { <p>x</p> }'), 'tpl.pdx');
        expect(r.warnings.map((w) => w.code)).not.toContain('PDX_REMOVED_FORM');
    });

    it('leave the rune list, so the editor stops offering them', () => {
        const names = RUNES.map((r) => r.name);
        for (const gone of ['route', 'alias', 'prefetch', 'transition', 'head']) expect(names, gone).not.toContain(gone);
        expect(names).toContain('page');
        expect(names).toContain('meta');
    });
});

describe('pdx migrate', () => {
    it('turns a page using every alpha route form into @page, idempotently, and it compiles to the same routes', () => {
        const once = migrate(pdx(`${ALPHA}\nlet n = $signal(0);`));
        expect(once).toBe(pdx(`${BETA}\nlet n = $signal(0);`));
        expect(migrate(once)).toBe(once);
        expect(defects(once, 'users.pdx')).toEqual([]);
        expect(routeLines(compile(once, 'users.pdx').code)).toEqual(ALPHA_ROUTES);
    });

    it('splits @head into @title and @meta lines, which compile to the head it wrote', () => {
        const source = pdx("@head {\n  title: 'Users',\n  meta: [{ name: 'description', content: 'All of them' }, { property: 'og:title', content: 'Users' }]\n}");
        const once = migrate(source);
        expect(once).toBe(pdx("@title 'Users';\n@meta description: 'All of them';\n@meta property og:title: 'Users';"));
        expect(migrate(once)).toBe(once);
        expect(defects(once, 'head.pdx')).toEqual([]);
        expect(compile(once, 'head.pdx').code).toContain('name: "description", content: "All of them"');
    });

    it('leaves an @head it cannot read whole — a title that is not a string — for a person', () => {
        const source = pdx("let name = $signal('x');\n@head { title: name }");
        expect(migrate(source)).toBe(source);
        expect(headBlock.detect(source)).toHaveLength(1);
    });

    it('splits @route into @page and the declarations it carried, one per line', () => {
        const source = pdx("@route {\n  path: '/admin/users',\n  guard: 'users.read',\n  loader: loadUsers,\n  layout: 'admin',\n  keepAlive: true,\n  transition: 'fade',\n  search: { q?: string }\n}\nasync function loadUsers() { return []; }");
        const once = migrate(source);
        expect(once).toBe(pdx("@page '/admin/users' { keepAlive, transition: 'fade' };\n@guard 'users.read';\n@loader loadUsers;\n@layout 'admin';\n@search { q?: string };\nasync function loadUsers() { return []; }"));
        expect(migrate(once)).toBe(once);
        expect(defects(once, 'admin.pdx')).toEqual([]);
    });

    it('adds the fields to an @page that already has options', () => {
        const once = migrate(pdx("@page '/a' { keepAlive: 60000, label: 'A' };\n@transition 'fade';\n@alias '/b';"));
        expect(once).toBe(pdx("@page '/a', '/b' { keepAlive: 60000, label: 'A', transition: 'fade' };"));
    });

    it('leaves a route field on a component with no @page, which did nothing, for a person', () => {
        const source = pdx("@transition 'fade';");
        expect(migrate(source)).toBe(source);
        expect(pageTransition.detect(source)).toHaveLength(1);
    });
});
