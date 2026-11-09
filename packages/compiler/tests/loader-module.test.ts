// A `@loader` in a module of its own (#119), so a navigation can start the data without waiting for
// the page's chunk.
//
// The loader is already hoisted to module level in the page module (it runs before the component
// exists and cannot read its setup), so it can live apart: the module holds its declaration, the
// script imports it reads, and nothing else. A loader that reads @page's label function, the one other
// name the page keeps at module scope, cannot be moved without it: its module exports null, and the
// route table's bridge imports the page as before.

import { describe, it, expect } from 'vitest';
import { generateLoaderModule, loaderModuleId } from '../src/loader-module';

const page = (script: string, lang = '') => `<template><p>x</p></template>\n<script setup${lang}>\n${script}\n</script>\n`;

describe('the module of a @loader', () => {
    it('holds the loader, the imports it reads, and a default export', () => {
        const code = generateLoaderModule(page([
            "@page '/tickets';",
            '@loader ticketList: loadTickets;',
            "import { listTickets } from '../data/tickets';",
            "import { formatDate } from '../data/format';",
            "import { http } from '@pdxui/core';",
            'let count = $signal(0);',
            'async function loadTickets() {',
            "  const res = await http.get('/api/tickets');",
            '  return listTickets(res);',
            '}',
        ].join('\n')), '/app/pages/tickets.pdx', 'loadTickets');

        // Anchored to the page's folder: from a virtual module a relative specifier has nothing to
        // resolve against.
        expect(code).toContain("import { listTickets } from '/app/data/tickets';");
        expect(code).toContain("import { http } from '@pdxui/core';");
        expect(code).toContain('async function loadTickets()');
        expect(code).toMatch(/export default loadTickets;\s*$/);
        // What the loader does not read stays with the page.
        expect(code).not.toContain('formatDate');
        expect(code).not.toContain('$signal');
        expect(code).not.toContain('@page');
    });

    it('erases its TypeScript', () => {
        const code = generateLoaderModule(page([
            "@page '/t';",
            '@loader loaded: load;',
            "import type { Row } from './types';",
            'async function load(): Promise<Row[]> {',
            "  const rows = (await fetch('/api').then(r => r.json())) as Row[];",
            '  return rows;',
            '}',
        ].join('\n')), 't.pdx', 'load');

        expect(code).not.toMatch(/Promise<Row\[\]>|as Row\[\]|import type/);
        expect(() => new Function(code.replace(/^export default .*$/m, ''))).not.toThrow();
    });

    it('exports null when the loader reads @page\'s label function, which only the page has at module scope', () => {
        // The page module lifts the label beside the loader; moved alone, `crumb` would be a
        // ReferenceError the first time the route is visited.
        const code = generateLoaderModule(page([
            "@page '/t/:id' { label: crumb };",
            '@loader loaded: load;',
            'function crumb(params) { return `T ${params.id}`; }',
            'async function load({ params }) { document.title = crumb(params); return fetch("/t"); }',
        ].join('\n')), 't.pdx', 'load');

        expect(code).toMatch(/export default null;/);
        expect(code).not.toContain('function load');
    });

    it('a name the setup declares does not keep it with its page: the page\'s hoisted loader cannot see it either (#974)', () => {
        // In the page module the loader is lifted to module scope and `base` stays in setup(): the
        // page throws the same ReferenceError, so declining bought nothing and cost a round trip.
        const code = generateLoaderModule(page([
            "@page '/t';",
            '@loader loaded: load;',
            "const base = '/api/v2';",
            'async function load() { return fetch(base + "/t"); }',
        ].join('\n')), 't.pdx', 'load');

        expect(code).toContain('export default load;');
    });

    it('another function\'s local of the same name is not a read: it moves (#974)', () => {
        // The showcase's ticket: `reload()` has its own `const res`, and so does the loader.
        const code = generateLoaderModule(page([
            "@page '/t';",
            '@loader loaded: load;',
            'async function load() { const res = await fetch("/t"); return res.json(); }',
            'async function reload() { const res = await fetch("/u"); return res.json(); }',
        ].join('\n')), 't.pdx', 'load');

        expect(code).toContain('export default load;');
        expect(code).not.toContain('reload');
    });

    it('a name the loader only writes in a type is not a read: it moves (#974)', () => {
        // The showcase's ticket: `{ id: number }` types the params, and the page declares `@prop id`.
        // Read as a name, the type kept the loader with its page, and a navigation paid a round trip
        // for an empty module before it could import the page that held the loader.
        const code = generateLoaderModule(page([
            "@page '/tickets/:id(number)';",
            '@loader ticket: loadTicket;',
            "import type { LoaderContext } from '@pdxui/router';",
            "@prop id: string = '';",
            'async function loadTicket({ params, signal }: LoaderContext<{ id: number }>): Promise<unknown> {',
            '  const res = await fetch(`/api/tickets/${params.id}`, { signal });',
            '  return res.json();',
            '}',
        ].join('\n'), ' lang="ts"'), 'ticket.pdx', 'loadTicket');

        expect(code).toContain('export default loadTicket;');
        expect(code).not.toMatch(/LoaderContext|: number/);
    });

    it('exports null when the script has no function by that name', () => {
        // PDX_LOADER_NOT_FOUND is the page module's to report; this module only declines.
        expect(generateLoaderModule(page("@page '/t';\n@loader gone: missing;"), 't.pdx', 'missing'))
            .toMatch(/export default null;/);
    });

    it('control — a loader that reads only its imports and globals is not declined', () => {
        const code = generateLoaderModule(page([
            "@page '/t';",
            '@loader loaded: load;',
            "const unrelated = 1;",
            'async function load() { const r = await fetch("/api"); return r.json(); }',
        ].join('\n')), 't.pdx', 'load');

        expect(code).toContain('export default load;');
    });

    it('is named after the page\'s tag', () => {
        expect(loaderModuleId('pdx-tickets')).toBe('virtual:pdx-loader/pdx-tickets');
    });
});
