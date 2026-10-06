// `@page { label: $t('key') }` — a crumb in the page's language, readable without the page.
//
// A breadcrumb lists every ancestor BY PATH, including one that does not render the page:
// `/customers` above `/customers/1`. A string label is carried in the route table and is a literal —
// English on an Italian screen. A function label can reach `$t`, but it lives in the page's module
// and is published only when that module loads; a deep link to `/customers/1` never loads
// `customers.pdx`, so its crumb would vanish.
//
// So the label can be a dictionary KEY, written the way a template writes it — `$t('customers.title')`
// — and carried as data, `labelKey`, in every table: the page's own registration, the generated
// router and the dev server's. The router translates it with the route's params.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateOptimizedRouter, generateDevRouteTable } from '../src/plugin-utils';

const src = (script: string) =>
    `<template>\n<div>x</div>\n</template>\n<script setup>\n${script}\n</script>`;

const KEY_LABEL = "@page '/customers' { label: $t('customers.title') };\nlet rows = $signal([]);";

describe('a label that names a dictionary key', () => {
    it('is read as a key, not as a string that happens to start with $t', () => {
        const route = analyzeScript(KEY_LABEL, 'customers.pdx', { setup: true }).route;
        expect(route.labelKey).toBe('customers.title');
        expect(route.label, 'the call was kept as a literal label').toBeUndefined();
        expect(route.labelFn).toBeUndefined();
    });

    it('double quotes are the same key', () => {
        const route = analyzeScript("@page '/x' { label: $t(\"x.title\") };", 'x.pdx', { setup: true }).route;
        expect(route.labelKey).toBe('x.title');
    });

    it('the page registers the key', () => {
        const code = compile(src(KEY_LABEL), 'customers.pdx').code;
        expect(code).toContain('labelKey:"customers.title"');
        expect(code, 'the call went into the registration as a string').not.toContain('label:"$t(');
    });

    it('the generated router carries the key, so an ancestor that is never loaded still names itself', () => {
        const module = generateOptimizedRouter([
            { path: '/customers', file: '/src/customers.pdx', tag: 'pdx-customers', labelKey: 'customers.title', lazy: true },
            { path: '/customers/:id', file: '/src/customer.pdx', tag: 'pdx-customer', lazy: true },
        ]);
        expect(module).toContain('labelKey: "customers.title"');
    });

    it('the dev server\'s table carries it too', () => {
        const table = generateDevRouteTable(
            [{ path: '/customers', file: '/app/src/customers.pdx', tag: 'pdx-customers', labelKey: 'customers.title', lazy: true }],
            '/app',
        );
        expect(table).toContain('"labelKey":"customers.title"');
    });

    it('control — a string label and a function label are what they were', () => {
        expect(analyzeScript("@page '/t' { label: 'Tickets' };", 't.pdx', { setup: true }).route.label).toBe('Tickets');
        expect(analyzeScript("@page '/t/:id' { label: ticketLabel };", 't.pdx', { setup: true }).route.labelFn).toBe('ticketLabel');
    });
});
