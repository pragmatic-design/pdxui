// @loader reaches the route as a function reference, never as a STRING.
//
// The analyzer reads `@loader loadUser` and the router awaits `config.loader()`. The name refers
// to a function declared in the component's <script>, which the codegen puts INSIDE `setup(ctx)`,
// where no module-level code can reach it; a `loader:"loadUser"` in __pdx_routes would be a call
// on a string.
//
// So the named function is hoisted out of the setup body and the REFERENCE is passed. A loader runs
// before the component exists, so it cannot use the setup scope anyway — hoisting is what the
// feature already implies.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (script: string, template = '<div>x</div>') =>
    `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;

const out = (s: string) => {
    const r = compile(s, 'user.pdx');
    return typeof r === 'string' ? r : r.code;
};

const LOADER_PAGE = src([
    "@page '/users/:id';",
    '@loader loadUser;',
    'async function loadUser() { return { name: "Ada" }; }',
    'let user = $signal(null);',
].join('\n'));

describe('@loader reaches the route as a function', () => {
    it('registers the reference, not the name', () => {
        const code = out(LOADER_PAGE);

        expect(code, 'the route still carries the loader as a string')
            .not.toContain('loader:"loadUser"');
        expect(code).toMatch(/loader:\s*loadUser/);
    });

    it('declares the function at module level, where the route registration can see it', () => {
        const code = out(LOADER_PAGE);

        const setupStart = code.indexOf('setup(ctx)');
        const declaration = code.indexOf('async function loadUser');
        expect(declaration, 'the loader was not emitted at all').toBeGreaterThanOrEqual(0);
        expect(declaration, 'the loader is still trapped inside setup(), where nothing can reach it')
            .toBeLessThan(setupStart);
    });

    it('the module evaluates, and the registered loader is callable', async () => {
        const code = out(LOADER_PAGE);
        const routes = await evaluateRoutes(code);

        expect(routes).toHaveLength(1);
        expect(typeof routes[0].loader, 'the router would call a string').toBe('function');
        await expect((routes[0].loader as () => Promise<unknown>)()).resolves.toEqual({ name: 'Ada' });
    });

    it('a route with no @loader carries none', () => {
        const code = out(src("@page '/plain';\nlet a = $signal(1);"));
        expect(code).not.toContain('loader:');
    });

    it('leaves the function usable from the template too', () => {
        // Hoisting moves the declaration; the setup still closes over it, so a handler that calls
        // it keeps working.
        const code = out(src([
            "@page '/users/:id';",
            '@loader loadUser;',
            'async function loadUser() { return 1; }',
            'let a = $signal(0);',
        ].join('\n'), '<button @click="loadUser()">go</button>'));

        expect(code, 'the setup stopped exporting the loader to the template').toContain('loadUser');
        expect(code.indexOf('async function loadUser')).toBeLessThan(code.indexOf('setup(ctx)'));
    });

    it('names an arrow-function loader too', () => {
        const code = out(src([
            "@page '/a';",
            '@loader loadThing;',
            'const loadThing = async () => 42;',
            'let a = $signal(0);',
        ].join('\n')));

        expect(code).toMatch(/loader:\s*loadThing/);
        expect(code.indexOf('const loadThing'), 'an arrow loader was left inside setup')
            .toBeLessThan(code.indexOf('setup(ctx)'));
    });

    it('says so when @loader names a function that is not there', () => {
        // Silently emitting `loader: undefined` would leave the page rendering with no data and no
        // error, which is the failure this file guards against.
        const code = out(src("@page '/a';\n@loader missingFn;\nlet a = $signal(0);"));

        expect(code, 'a loader that does not exist was registered anyway')
            .not.toMatch(/loader:\s*missingFn/);
    });
});

/**
 * Evaluate a compiled module far enough to read `globalThis.__pdx_routes`.
 *
 * The core is stubbed rather than imported: this package does not depend on it, and what is under
 * test is the route registration the module performs, not what `component()` does with the
 * definition it is handed.
 */
async function evaluateRoutes(code: string): Promise<Record<string, unknown>[]> {
    const core = {
        component: () => {},
        html: (s: TemplateStringsArray, ...v: unknown[]) => String.raw({ raw: s }, ...v),
        signal: (v: unknown) => Object.assign(() => v, { set: () => {}, peek: () => v }),
        __staticHTML: (s: string) => s,
        computed: (fn: () => unknown) => fn,
    };
    // The page also imports from `@pdxui/router`: declaring `@loader` auto-imports
    // currentLoaderData/currentLoaderState so the page can read its own data. ESM cannot
    // be `new Function`'d, so that import becomes a destructure of an injected namespace, exactly as
    // the core one does — otherwise this harness reports a SyntaxError for a module that is fine.
    const routerStub = 'const { currentLoaderData, currentLoaderState } = __router;';
    const src = code
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/import\s*\{[^}]*\}\s*from\s*'@pdxui\/router';?/g, routerStub)
        .replace(/^export\s+/gm, '');
    const g = globalThis as { __pdx_routes?: Record<string, unknown>[] };
    const previous = g.__pdx_routes;
    g.__pdx_routes = [];
    try {
        new Function('__core', '__router', src)(core, { currentLoaderData: () => undefined, currentLoaderState: () => 'idle' });
        return g.__pdx_routes ?? [];
    } finally {
        g.__pdx_routes = previous;
    }
}
