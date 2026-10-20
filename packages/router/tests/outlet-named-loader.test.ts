// A named `@loader user: loadUser;` at RUNTIME, compiled by the real compiler (#506).
//
// `user` is a source with the async vocabulary, read from the router's state of this page's path:
// `data()`, `state()`, `error()`, `pending()`. The page renders `user.data()` after the navigation,
// and an `@await (user as u)` block renders its body with the data. A failing loader leaves the page
// with `user.state()` 'error' and the reason in `user.error()`.
//
// Same bridge as `outlet-params-directive.test.ts`: the compiler by relative path, because the
// router may not depend on it.
import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '@pdxui/core';
import * as routerExports from '../src/index';
import { compile } from '../../compiler/src/plugin';

type Gate = { fail: boolean; resolve?: (v: unknown) => void; reject?: (e: unknown) => void };
const gate = globalThis as unknown as { __loaderGate: Gate };
gate.__loaderGate = { fail: false };

const source = `<template>
  <p data-test="state">{{ user.state() }}</p>
  <p data-test="name">{{ user.data()?.name }}</p>
  <p data-test="error">{{ user.error()?.message }}</p>
  @await (user as u) { <p data-test="awaited">{{ u.name }}</p> }
</template>
<script>
@page '/nl/:id(number)';
@tag 'app-named-loader';
@loader user: loadUser;

async function loadUser({ params }) {
  const g = globalThis.__loaderGate;
  if (g.fail) throw new Error('no such user');
  return new Promise((resolve) => { g.resolve = () => resolve({ name: 'User ' + params.id }); });
}
</script>`;

const routes: Record<string, unknown>[] = [];
(globalThis as Record<string, unknown>).__pdx_routes = routes;

const { code, warnings } = compile(source, 'pages/named-loader.pdx', [], undefined, {});

const imported = /^import \{([^}]*)\} from '@pdxui\/core';$/m.exec(code);
const fromRouter = /^import \{([^}]*)\} from '@pdxui\/router';$/m.exec(code)?.[1] ?? '';
const body = code.split('\n').filter((l) => !/^\s*import\s/.test(l)).join('\n');
new Function('core', 'router', `const {${imported![1]}} = core;\nconst {${fromRouter}} = router;\n${body}`)(core, routerExports);

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const text = (test: string) => document.querySelector(`[data-test="${test}"]`)?.textContent?.trim();

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

describe('a page with a named @loader', () => {
    it('compiles clean, reading the source from the router', () => {
        expect(warnings.filter((w) => w.severity !== 'info').map((w) => `${w.code}: ${w.message}`)).toEqual([]);
        expect(fromRouter, 'the page does not import loaderSource').toContain('loaderSource');
    });

    it("state() goes 'pending' then 'success', and the page renders user.data() and the @await body", async () => {
        const user = routerExports.loaderSource('/nl/:id(number)');
        navigate('/nl/7');
        await settle();
        expect(user.state()).toBe('pending');
        expect(user.pending()).toBe(true);
        gate.__loaderGate.resolve!(undefined);
        await settle();
        expect(user.state()).toBe('success');
        expect(text('state')).toBe('success');
        expect(text('name')).toBe('User 7');
        expect(text('awaited')).toBe('User 7');
    });

    it("a failing loader leaves state() 'error' and the reason in error(), under the level's error page (#147)", async () => {
        gate.__loaderGate.fail = true;
        navigate('/nl/8');
        await settle();
        const user = routerExports.loaderSource('/nl/:id(number)');
        expect(user.state()).toBe('error');
        expect(user.error()?.message).toBe('no such user');
        expect(document.querySelector('app-named-loader'), 'the page stayed as if its loader had not failed').toBeNull();
        expect(document.querySelector('pdx-router-outlet [role="alert"]')).not.toBeNull();
        gate.__loaderGate.fail = false;
    });
});
