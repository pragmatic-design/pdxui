// A page that declares `@loader` reads what its loader returned.
//
// `@search` is auto-imported: declaring search params makes the codegen push
// `import { currentSearch } from '@pdxui/router';` and build `searchParams` on top of it.
// `@loader` gets the equivalent. The page declares the loader, the router runs it, the data lands in
// `currentLoaderData()` — and the component that owns the declaration must not have to write the
// import by hand, or the framework's own first rule is broken: if the dev writes wiring, it is a
// bug of the framework.
//
// From `@pdxui/router`, never from `virtual:pdx-router`: the package is the address of the
// router that is RUNNING (the seam decides which), and naming the virtual module instantiates a
// second one beside the one the outlet drives. p2-plus.test.ts holds that rule for `@search`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const out = (script: string, template = '<div>{{ n }}</div>') => {
    const r = compile(`<template>${template}</template>\n<script setup>\n${script}\n</script>`, 'page.pdx');
    return typeof r === 'string' ? r : r.code;
};

const LOADER_PAGE = [
    "@page '/data';",
    '@loader loadRows;',
    'async function loadRows() { return { rows: 7 }; }',
    'let n = $signal(0);',
].join('\n');

describe('a page that declares @loader can read its own data', () => {
    it('imports currentLoaderData and currentLoaderState', () => {
        const code = out(LOADER_PAGE);

        expect(code, 'the page cannot reach what its own loader returned')
            .toMatch(/import \{[^}]*currentLoaderData[^}]*\} from '@pdxui\/router';/);
        expect(code).toMatch(/import \{[^}]*currentLoaderState[^}]*\} from '@pdxui\/router';/);
    });

    it('takes them from the package, not from the virtual module', () => {
        // Naming `virtual:pdx-router` gets a router nothing is navigating: its own signals, its own
        // popstate listener, beside the one the outlet drives.
        expect(out(LOADER_PAGE)).not.toContain("from 'virtual:pdx-router'");
    });

    it('imports nothing for a page that declares no @loader', () => {
        // The control. An unconditional import would satisfy the first case and pull the router
        // into every compiled component in the project.
        const code = out("@page '/plain';\nlet n = $signal(0);");

        expect(code).not.toContain('currentLoaderData');
        expect(code, 'a page with no @loader was made to import the router').not.toContain('currentLoaderState');
    });

    it('does not import a name the page already imports itself', () => {
        // Two `import { currentLoaderData }` in one module is a duplicate binding — a SyntaxError,
        // and one that only appears for the author who reached for the import before the compiler
        // offered it.
        const code = out([
            "import { currentLoaderData } from '@pdxui/router';",
            "@page '/data';",
            '@loader loadRows;',
            'async function loadRows() { return { rows: 7 }; }',
            'let n = $signal(0);',
        ].join('\n'));

        const occurrences = (code.match(/currentLoaderData/g) ?? []).length;
        expect(occurrences, 'currentLoaderData was imported twice').toBeLessThanOrEqual(1);
    });

    it('still auto-imports currentSearch for @search, and both together when both are declared', () => {
        // The @loader path must not displace the one it was modelled on.
        const code = out([
            "@page '/items';",
            '@search { page: number = 1 };',
            '@loader loadRows;',
            'async function loadRows() { return { rows: 7 }; }',
            'let n = $signal(0);',
        ].join('\n'), '<div>{{ searchParams.page }}</div>');

        expect(code).toContain('currentSearch');
        expect(code).toContain('currentLoaderData');
    });
});
