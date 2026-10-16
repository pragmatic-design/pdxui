// A `@loader` in a module of its own (#119), so a navigation can start the data without waiting for
// the page's chunk.
//
// The loader is already hoisted to module level in the page module (it runs before the component
// exists and cannot read its setup), so it can live apart: the module holds its declaration, the
// script imports it reads, and nothing else. A loader that reads a name its script declares beside
// it cannot be moved without that name: its module exports null, and the route table's bridge
// imports the page as before.

import { describe, it, expect } from 'vitest';
import { generateLoaderModule, loaderModuleId } from '../src/loader-module';

const page = (script: string, lang = '') => `<template><p>x</p></template>\n<script setup${lang}>\n${script}\n</script>\n`;

describe('the module of a @loader', () => {
    it('holds the loader, the imports it reads, and a default export', () => {
        const code = generateLoaderModule(page([
            "@page '/tickets';",
            '@loader loadTickets;',
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
            '@loader load;',
            "import type { Row } from './types';",
            'async function load(): Promise<Row[]> {',
            "  const rows = (await fetch('/api').then(r => r.json())) as Row[];",
            '  return rows;',
            '}',
        ].join('\n')), 't.pdx', 'load');

        expect(code).not.toMatch(/Promise<Row\[\]>|as Row\[\]|import type/);
        expect(() => new Function(code.replace(/^export default .*$/m, ''))).not.toThrow();
    });

    it('exports null when the loader reads a name its script declares beside it', () => {
        // Moved alone, `base` would be a ReferenceError the first time the route is visited.
        const code = generateLoaderModule(page([
            "@page '/t';",
            '@loader load;',
            "const base = '/api/v2';",
            'async function load() { return fetch(base + "/t"); }',
        ].join('\n')), 't.pdx', 'load');

        expect(code).toMatch(/export default null;/);
        expect(code).not.toContain('function load');
    });

    it('exports null when the script has no function by that name', () => {
        // PDX_LOADER_NOT_FOUND is the page module's to report; this module only declines.
        expect(generateLoaderModule(page("@page '/t';\n@loader missing;"), 't.pdx', 'missing'))
            .toMatch(/export default null;/);
    });

    it('control — a loader that reads only its imports and globals is not declined', () => {
        const code = generateLoaderModule(page([
            "@page '/t';",
            '@loader load;',
            "const unrelated = 1;",
            'async function load() { const r = await fetch("/api"); return r.json(); }',
        ].join('\n')), 't.pdx', 'load');

        expect(code).toContain('export default load;');
    });

    it('is named after the page\'s tag', () => {
        expect(loaderModuleId('pdx-tickets')).toBe('virtual:pdx-loader/pdx-tickets');
    });
});
