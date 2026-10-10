// A `@fetch` URL that interpolates a signal or a prop refetches when it changes (#101). The URL used
// to be copied into the generated template literal as written: `${page}` named a variable that does
// not exist (a `$signal` is emitted as `__page`), and a prop read only by the URL had no accessor.
//
// The component is compiled, and its setup run against the real core with two stand-ins: the
// `component()` call is captured instead of defining an element, and the default HTTP client
// records the URLs it is asked for.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import * as core from '../../core/src/index';

type Options = { setup: (ctx: Record<string, unknown>) => Record<string, unknown> };

/** Compiles `script` into a component and runs its setup; returns the requests and the props. */
function run(script: string, props: Record<string, unknown> = {}) {
    const src = `<template><p></p></template>\n<script setup>\n${script}\n</script>\n`;
    const { code } = compile(src, 'fetch-probe.pdx', [], undefined, {});
    const requests: string[] = [];
    let options: Options | undefined;
    const fake = {
        ...core,
        component: (_tag: string, o: Options) => { options = o; },
        getDefaultClient: () => ({ get: (url: string) => { requests.push(url); return Promise.resolve([]); } }),
    };
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(fake);
    expect(options, 'the module did not call component()').toBeDefined();
    const propSignals = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, core.signal(v)]));
    const exposed = options!.setup({ ...propSignals, el: null, track: core.effect });
    return { requests, props: propSignals, exposed, code };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('@fetch with a reactive URL', () => {
    it('reads a $signal, and refetches when it changes', async () => {
        const { requests, exposed } = run("let page = $signal(1);\n@fetch rows: 'GET /api/rows?page=${page}';\nfunction next() { page++; }");
        await settle();
        expect(requests).toEqual(['/api/rows?page=1']);
        (exposed.next as () => void)();
        await settle();
        expect(requests).toEqual(['/api/rows?page=1', '/api/rows?page=2']);
    });

    it('reads a @prop that nothing else reads, and refetches when it changes', async () => {
        const { requests, props } = run("@prop userId: number = 0;\n@fetch user: 'GET /api/users/${userId}';", { userId: 7 });
        await settle();
        expect(requests).toEqual(['/api/users/7']);
        (props.userId as core.Signal<number>).set(8);
        await settle();
        expect(requests).toEqual(['/api/users/7', '/api/users/8']);
    });

    it('keys the cache by the current URL', () => {
        const { code } = run("let page = $signal(1);\n@fetch rows: 'GET /api/rows?page=${page}';");
        expect(code).toContain('key: () => `GET:/api/rows?page=${__page()}`');
    });

    it('still escapes a backtick in the static part of the URL', () => {
        const { code } = run("let page = $signal(1);\n@fetch rows: 'GET /api/a`b?page=${page}';");
        expect(code).toContain('/api/a\\`b?page=${__page()}');
    });
});
