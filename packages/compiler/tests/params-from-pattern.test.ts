// `@params { id, tab }` takes each name's type from the page's pattern (#564).
//
// `@params` read `name: type` only, and a name alone was PDX_ROUTE_FIELD_INVALID and dropped: a page
// whose pattern already said `:id(number)` had to say `number` a second time. A name alone now takes
// the type the router's coerceParams gives the param — `:id(number)` a number, any other param a
// string — wherever `@page` is written in the script. A name the pattern has no param for has nothing
// to take a type from, and stays an error.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseRouteParams } from '../src/compiler/script-analyzer-helpers';

const pdx = (script: string) => `<template>\n  <p>{{ id }}</p>\n</template>\n<script>\n${script}\n</script>\n`;
const invalid = (r: { warnings: { code: string; message: string }[] }) => r.warnings.filter((w) => w.code === 'PDX_ROUTE_FIELD_INVALID');

describe('parseRouteParams with the pattern', () => {
    it('gives a name alone the type its param has in the pattern', () => {
        expect(parseRouteParams('{ id, tab }', '/users/:id(number)/:tab')).toEqual([
            { name: 'id', type: 'number' },
            { name: 'tab', type: 'string' },
        ]);
    });

    it('a uuid or slug constraint is a string, as coerceParams leaves it', () => {
        expect(parseRouteParams('{ u, s }', '/x/:u(uuid)/:s(slug)')).toEqual([
            { name: 'u', type: 'string' },
            { name: 's', type: 'string' },
        ]);
    });

    it('mixes with written types, which win', () => {
        expect(parseRouteParams('{ id: string, tab }', '/users/:id(number)/:tab')).toEqual([
            { name: 'id', type: 'string' },
            { name: 'tab', type: 'string' },
        ]);
    });

    it('a name the pattern does not have is no field', () => {
        expect(parseRouteParams('{ nmae }', '/users/:id(number)')).toEqual([]);
        expect(parseRouteParams('{ id }')).toEqual([]);
    });
});

describe('@params { id } compiles from the pattern', () => {
    it('coerces a number param with Number, and registers its type', () => {
        const r = compile(pdx("@page '/users/:id(number)/:tab';\n@params { id, tab };"), 'pp1.pdx');
        expect(invalid(r)).toEqual([]);
        expect(r.code).toContain('const id = computed(() => Number(__routeParams()?.id ?? 0));');
        expect(r.code).toContain("const tab = computed(() => __routeParams()?.tab ?? '');");
        expect(r.code).toContain('paramTypes:{id:"number",tab:"string"}');
    });

    it('reads the pattern of an @page written after it', () => {
        const r = compile(pdx("@params { id };\n@page '/users/:id(number)';"), 'pp2.pdx');
        expect(invalid(r)).toEqual([]);
        expect(r.code).toContain('const id = computed(() => Number(__routeParams()?.id ?? 0));');
    });

    it('a name alone the pattern has no param for is an error, at the name', () => {
        const source = pdx("@page '/users/:id(number)';\n@params { id, nmae };");
        const r = compile(source, 'pp3.pdx');
        const [w] = invalid(r) as { message: string; line?: number; column?: number }[];
        expect(w, 'no PDX_ROUTE_FIELD_INVALID').toBeDefined();
        expect(w.message).toContain("'nmae'");
        expect(w.message).toContain('/users/:id(number)');
        expect(r.code).not.toContain('const nmae');
        const lines = source.split('\n');
        expect(lines[w.line! - 1].slice(w.column! - 1)).toMatch(/^nmae\b/);
    });

    it('without @page a name alone is an error', () => {
        const [w] = invalid(compile(pdx('@params { id };'), 'pp4.pdx'));
        expect(w, 'no PDX_ROUTE_FIELD_INVALID').toBeDefined();
    });
});
