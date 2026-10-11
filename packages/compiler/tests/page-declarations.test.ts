// Page declarations compile to the route they describe (#204).
//
// - `@page '/x' { keepAlive: true }` emitted `keepAlive:NaN`: the value went through `Number()`.
// - `@search`'s `searchParams` was handed to the template, and reading it there was PDX_UNDECLARED_REF.
// - A multi-line `@page` or route `@meta` block was not read: its tail reached the setup as code.
// - A page's second path, or an `@alias`, was registered with path, tag and guard only.
// - `@route`'s `search` and `params` were read up to their first `}`, and their fields not checked.
// - `@redirect '/target'` sends this page's route elsewhere; its rune doc said the opposite.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { RUNES } from '../src/compiler/runes';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);
/** Every `__pdx_pushRoute({…})` the module makes, by path. */
const routes = (code: string): Map<string, string> =>
    new Map([...code.matchAll(/__pdx_pushRoute\(\{path:"([^"]*)",(.*)\}\);$/gm)].map((m) => [m[1], m[2]]));

describe('@page options', () => {
    it('keepAlive: true is true, not NaN', () => {
        const route = routes(compile(pdx("@page '/x' { keepAlive: true };"), 'ka.pdx').code).get('/x');
        expect(route).toContain('keepAlive:true');
    });

    it('keepAlive: 60000 stays a number', () => {
        expect(routes(compile(pdx("@page '/x' { keepAlive: 60000 };"), 'ka2.pdx').code).get('/x')).toContain('keepAlive:60000');
    });

    it('an options block over several lines is read', () => {
        const r = compile(pdx("@page '/x' {\n  keepAlive: true,\n  label: 'Ex',\n};\nlet a = $signal(1);", '<p>{{ a }}</p>'), 'ml.pdx');
        expect(codes(r)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        const route = routes(r.code).get('/x');
        expect(route).toContain('keepAlive:true');
        expect(route).toContain('label:"Ex"');
    });
});

describe('every path of a page', () => {
    it('a second path carries the same fields', () => {
        const all = routes(compile(pdx("@page '/tickets/:id(number)', '/t/:id(number)' { keepAlive: 60000, label: 'Ticket' };\n@guard 'tickets.view';\n@transition 'fade';"), 'two.pdx').code);
        const second = all.get('/t/:id(number)');
        expect(second).toBeDefined();
        for (const field of ['guard:"tickets.view"', 'keepAlive:60000', 'label:"Ticket"', 'transition:"fade"', 'lazy:true', 'paramConstraints:{id:"number"}']) {
            expect(second, field).toContain(field);
        }
    });

    it('an @alias too', () => {
        const all = routes(compile(pdx("@page '/people';\n@alias '/users';\n@transition 'fade';"), 'alias.pdx').code);
        expect(all.get('/users')).toContain('transition:"fade"');
    });

    it('every path is checked, not only the first', () => {
        const r = compile(pdx("@page '/ok', 'bad';"), 'paths.pdx');
        expect(codes(r)).toContain('PDX_PAGE_INVALID_PATH');
    });
});

describe('@search', () => {
    it('searchParams is a name the template reads, called like a derived', () => {
        const r = compile(pdx("@page '/list';\n@search { page: number = 1 };", '<p>{{ searchParams.page }}</p>'), 'search.pdx');
        expect(codes(r)).not.toContain('PDX_UNDECLARED_REF');
        expect(r.code).toContain('ctx.searchParams().page');
    });

    it('the script reads it as the template does', () => {
        const r = compile(pdx("@page '/list';\n@search { page: number = 1 };\nconst next = $derived(searchParams.page + 1);", '<p>{{ next }}</p>'), 'search2.pdx');
        expect(r.code).toContain('searchParams().page + 1');
    });

    it('a script that already calls it, as the docs used to show, is not called twice', () => {
        const r = compile(pdx("@page '/list';\n@search { page: number = 1 };\nconst next = $derived(searchParams().page + 1);", '<p>{{ next }}</p>'), 'search3.pdx');
        expect(r.code).toContain('searchParams().page + 1');
        expect(r.code).not.toContain('searchParams()()');
    });
});

describe('route @meta', () => {
    it('over several lines is read', () => {
        const r = compile(pdx("@page '/x';\n@meta {\n  section: 'admin',\n  order: 2\n};"), 'meta.pdx');
        expect(codes(r)).not.toContain('PDX_UNKNOWN_DECLARATION');
        expect(codes(r)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(routes(r.code).get('/x')).toContain('section');
    });
});

describe('@route', () => {
    it('reads a nested object in meta whole', () => {
        const { code } = compile(pdx("@route { path: '/x', meta: { crumb: { label: 'X' }, order: 2 } }"), 'rt.pdx');
        expect(routes(code).get('/x')).toContain('order');
    });

    it('checks its search and params fields as @search and @params are', () => {
        const r = compile(pdx("@route { path: '/x/:id', params: { id: 'number' }, search: { q: 'string' } }"), 'rt2.pdx');
        expect(codes(r).filter((c) => c === 'PDX_ROUTE_FIELD_INVALID')).toHaveLength(2);
    });
});

describe('@redirect', () => {
    it("'/target' redirects THIS page's route, and its rune doc says so", () => {
        expect(routes(compile(pdx("@page '/old';\n@redirect '/new';"), 'rd.pdx').code).get('/old')).toContain('redirect:"/new"');
        const doc = RUNES.find((r) => r.name === 'redirect')!.doc;
        expect(doc).not.toMatch(/another path to this page/i);
    });
});
