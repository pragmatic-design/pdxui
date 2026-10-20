// What `@params { id: number }` gives a page at RUNTIME, compiled by the real compiler (#185).
//
// The compiler emitted `const __id = computed(…)` for a declared param and never handed it to the
// template or the script under its name: `{{ id }}` was PDX_UNDECLARED_REF, and `id` in the script
// was undefined. So this starts at the `.pdx` and ends at the DOM: compile a page that declares a
// param, run its module, put it under the outlet, and read the text across two navigations that
// keep the same page. Twice: the dev compile (the template path) and a production one (the inline
// path), which must render the same.
//
// Same bridge as `outlet-layout-directive.test.ts`: the compiler by relative path, because the
// router may not depend on it.
import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '@pdxui/core';
import * as routerExports from '../src/index';
import { compile } from '../../compiler/src/plugin';

const MODES = [
    { name: 'dev', base: '/t', tag: 'app-pp-dev', production: false },
    { name: 'production', base: '/p', tag: 'app-pp-prod', production: true },
] as const;

const source = (base: string, tag: string) => `<template><p data-test="id">{{ id }}</p><p data-test="next">{{ next }}</p><p data-test="type">{{ typeof id }}</p></template>
<script>
@page '${base}/:id';
@tag '${tag}';
@params { id: number }
const next = $derived(id + 1);
</script>`;

const routes: Record<string, unknown>[] = [];
(globalThis as Record<string, unknown>).__pdx_routes = routes;

/** Compile the page, check it compiles clean, and run its module against @pdxui/core: it defines the
 *  element and registers its own route, as a page module does when it is imported. */
function runPage(mode: (typeof MODES)[number]): void {
    const { code, warnings } = compile(source(mode.base, mode.tag), `pages/${mode.name}.pdx`, [], undefined, { production: mode.production });
    expect(warnings.filter((w) => w.severity !== 'info').map((w) => `${w.code}: ${w.message}`),
        `the ${mode.name} page does not compile clean`).toEqual([]);
    // Match: the one `import { … } from '@pdxui/core'` line. Groups: [1]=the names
    const imported = /^import \{([^}]*)\} from '@pdxui\/core';$/m.exec(code);
    expect(imported, 'the module imports nothing from @pdxui/core — this test is reading nothing').not.toBeNull();
    // And what it imports from the router: `RouteParams`, the token the outlet provides the params
    // under (#495) — this router's, the one the outlet below provides with.
    // Match: the `import { … } from '@pdxui/router'` line, when there is one. Groups: [1]=the names
    const fromRouter = /^import \{([^}]*)\} from '@pdxui\/router';$/m.exec(code)?.[1] ?? '';
    const body = code.split('\n').filter((l) => !/^\s*import\s/.test(l)).join('\n');
    new Function('core', 'router', `const {${imported![1]}} = core;\nconst {${fromRouter}} = router;\n${body}`)(core, routerExports);
    expect(routes.map((r) => r.path), `the ${mode.name} page registered no route`).toContain(`${mode.base}/:id`);
}

for (const mode of MODES) runPage(mode);

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (test: string) => document.querySelector(`[data-test="${test}"]`)?.textContent;

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

for (const mode of MODES) {
    describe(`a page that declares @params (${mode.name})`, () => {
        it('reads the param by its name, coerced to the declared type', async () => {
            navigate(`${mode.base}/7`);
            await tick();
            expect(document.querySelector(mode.tag), 'the page did not render').not.toBeNull();
            expect(text('id')).toBe('7');
            expect(text('type'), 'a `number` param must be a number, not the URL string').toBe('number');
            expect(text('next'), 'the script reads it too: $derived(id + 1)').toBe('8');
        });

        it('follows the next navigation to the same page without a remount', async () => {
            const page = document.querySelector(mode.tag);
            navigate(`${mode.base}/8`);
            await tick();
            expect(document.querySelector(mode.tag), 'the page was rebuilt for a param change').toBe(page);
            expect(text('id')).toBe('8');
            expect(text('next')).toBe('9');
        });
    });
}
