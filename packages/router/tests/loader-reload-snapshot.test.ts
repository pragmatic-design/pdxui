// A loader's state is published as one snapshot (#569).
//
// `planLoaders` and `runLoaders` write three signals — the data, the state, the error. Written one by
// one, each write notified on its own, and a reader saw the level half-way: its data dropped while its
// state still said 'success'. That is a valid result to `@await` — a loader that returned undefined —
// so a mounted page reloading for another id rendered its body with the alias undefined, and the
// binding threw: `Cannot read properties of undefined (reading 'name')`.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as core from '@pdxui/core';
import * as routerExports from '../src/index';
import { compile } from '../../compiler/src/plugin';

const gate = globalThis as unknown as { __reloadGate: { resolve?: () => void } };
gate.__reloadGate = {};

const source = `<template>
  @await (user as u) { <p data-test="reloaded">{{ u.name }}</p> }
</template>
<script>
@page '/rl/:id';
@tag 'app-reload';
@loader user: loadUser;
async function loadUser({ params }) {
  return new Promise((resolve) => { globalThis.__reloadGate.resolve = () => resolve({ name: 'U' + params.id }); });
}
</script>`;

(globalThis as Record<string, unknown>).__pdx_routes = [];
const { code } = compile(source, 'pages/reload.pdx', [], undefined, {});
const imported = /^import \{([^}]*)\} from '@pdxui\/core';$/m.exec(code);
const fromRouter = /^import \{([^}]*)\} from '@pdxui\/router';$/m.exec(code)?.[1] ?? '';
const body = code.split('\n').filter((l) => !/^\s*import\s/.test(l)).join('\n');
new Function('core', 'router', `const {${imported![1]}} = core;\nconst {${fromRouter}} = router;\n${body}`)(core, routerExports);

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const text = () => document.querySelector('[data-test="reloaded"]')?.textContent?.trim();

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
    navigate('/rl/1');
    await settle();
    gate.__reloadGate.resolve!();
    await settle();
});

describe('a mounted page whose loader runs again for another id', () => {
    it('never reads its level as success with no data', async () => {
        expect(text()).toBe('U1');
        const user = routerExports.loaderSource('/rl/:id');
        const seen: string[] = [];
        const stop = core.effect(() => { seen.push(`${user.state()}:${user.data() === undefined ? 'none' : 'data'}`); });
        navigate('/rl/2');
        await settle();
        gate.__reloadGate.resolve!();
        await settle();
        stop();
        expect(seen, 'a reader saw the level half-way through a write').not.toContain('success:none');
        expect(seen.at(-1)).toBe('success:data');
    });

    it('renders its @await body with no error, then the new record', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        navigate('/rl/3');
        await settle();
        gate.__reloadGate.resolve!();
        await settle();
        expect(err.mock.calls.map((c) => String(c[0]).slice(0, 100)), 'the body read its alias undefined').toEqual([]);
        expect(text()).toBe('U3');
        err.mockRestore();
    });
});
