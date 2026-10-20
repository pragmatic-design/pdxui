// A page that declares `@loader` reads what its loader returned.
//
// `@search` is auto-imported: declaring search params makes the codegen push
// `import { currentSearch } from '@pdxui/router';` and build `searchParams` on top of it.
// `@loader` gets the equivalent. The page declares `@loader rows: loadRows;`, the router runs it, and
// `rows` reads it through `loaderSource` (#506) — and the component that owns the declaration must
// not have to write the import by hand, or the framework's own first rule is broken: if the dev
// writes wiring, it is a bug of the framework.
//
// From `@pdxui/router`, never from a virtual module of the plugin's: the package is the address of
// the router that is RUNNING. p2-plus.test.ts holds that rule for `@search`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const out = (script: string, template = '<div>{{ n }}</div>') => {
    const r = compile(`<template>${template}</template>\n<script>\n${script}\n</script>`, 'page.pdx');
    return typeof r === 'string' ? r : r.code;
};

const LOADER_PAGE = [
    "@page '/data';",
    '@loader rows: loadRows;',
    'async function loadRows() { return { rows: 7 }; }',
    'let n = $signal(0);',
].join('\n');

describe('a page that declares @loader can read its own data', () => {
    it('imports loaderSource and declares the name from the page\'s pattern', () => {
        const code = out(LOADER_PAGE);

        expect(code, 'the page cannot reach what its own loader returned')
            .toMatch(/import \{[^}]*loaderSource[^}]*\} from '@pdxui\/router';/);
        expect(code).toContain('const rows = loaderSource("/data");');
        expect(code, 'the template cannot read the name').toMatch(/return \{[^}]*\brows\b/);
    });

    it('named after its own function — the form `pdx migrate` writes — the setup keeps the source and the route the function', () => {
        // The source shares the function's name; lifting the first declaration of that name moved the
        // source to module scope and registered it as the loader, leaving the function in the setup.
        const code = out("@page '/data';\n@loader loadRows: loadRows;\nasync function loadRows() { return { rows: 7 }; }\nlet n = $signal(0);");
        const setup = code.slice(code.indexOf('setup(ctx)'), code.indexOf('render:'));

        expect(setup, 'the source left the setup').toContain('const loadRows = loaderSource("/data");');
        expect(setup, 'the function stayed in the setup').not.toContain('function loadRows');
        expect(code.indexOf('async function loadRows'), 'the function was not lifted').toBeLessThan(code.indexOf('setup(ctx)'));
        expect(code).toMatch(/loader:\s*loadRows\b/);
        expect(setup.match(/\bloadRows\b/g), 'the setup returns the name once').toHaveLength(2);
    });

    it('takes it from the package, not from a virtual module', () => {
        expect(out(LOADER_PAGE)).not.toMatch(/from ['"]virtual:/);
    });

    it('imports nothing for a page that declares no @loader', () => {
        // The control. An unconditional import would satisfy the first case and pull the router
        // into every compiled component in the project.
        const code = out("@page '/plain';\nlet n = $signal(0);");

        expect(code, 'a page with no @loader was made to import the router').not.toContain('loaderSource');
    });

    it('does not import a name the page already imports itself', () => {
        // Two `import { loaderSource }` in one module is a duplicate binding — a SyntaxError, and one
        // that only appears for the author who reached for the import before the compiler offered it.
        const code = out([
            "import { loaderSource } from '@pdxui/router';",
            LOADER_PAGE,
        ].join('\n'));

        const imports = (code.match(/import \{[^}]*\bloaderSource\b/g) ?? []).length;
        expect(imports, 'loaderSource was imported twice').toBe(1);
    });

    it('still auto-imports currentSearch for @search, and both together when both are declared', () => {
        // The @loader path must not displace the one it was modelled on.
        const code = out([
            "@page '/items';",
            '@search { page: number = 1 };',
            '@loader rows: loadRows;',
            'async function loadRows() { return { rows: 7 }; }',
            'let n = $signal(0);',
        ].join('\n'), '<div>{{ searchParams.page }}</div>');

        expect(code).toContain('currentSearch');
        expect(code).toContain('loaderSource');
    });
});
