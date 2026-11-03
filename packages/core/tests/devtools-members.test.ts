// `__PDX_DEVTOOLS__` v2's last members (#298): `delta()`, `actions()` and `run()`, `sources()`, `forms()`.
// On components compiled in the test, as the app's are: what the agent reads is what the compiler and
// the runtime register, not a hand-made double of it.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { devtoolsApi, setDevtoolsRouteSource } from '../src/debug/devtools-api';
import type { DevtoolsOutlineDelta } from '../src/debug/devtools-members';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** Compile a `.pdx` source and run its module against core (render-parity's bridge). */
function defineCompiled(name: string, src: string): void {
    const { code } = compile(src, `${name}.pdx`, [], undefined, {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

function mount<T extends HTMLElement>(name: string, template: string, script: string): T {
    defineCompiled(name, `<template>${template}</template>\n<script>\n${script}\n</script>\n`);
    const el = document.createElement(`app-${name}`) as T;
    document.body.appendChild(el);
    return el;
}

const g = globalThis as unknown as { __bodyRuns: number };

afterEach(() => { document.body.innerHTML = ''; g.__bodyRuns = 0; setDevtoolsRouteSource(() => null); });

describe('delta()', () => {
    it('after a change returns only the changed card key and outline lines', async () => {
        type Host = HTMLElement & { add(): void };
        const el = mount<Host>('deltalist',
            '<ul aria-label="Fruits">@for (fruits as f; track f) {<li>{{ f }}</li>}</ul><button>Save</button>',
            "let fruits = $signal(['apple', 'pear']);\nfunction add() { fruits = [...fruits, 'plum']; }\n@expose add;");
        await settle();
        devtoolsApi.page();
        devtoolsApi.outline();
        el.add();
        await settle();
        const d = devtoolsApi.delta();
        expect(d.route).toBeUndefined();
        expect(d.full).toBeUndefined();
        expect(Object.keys(d.card)).toEqual(['lists']);
        // Not full: the outline is the lines that changed.
        const outline = d.outline as DevtoolsOutlineDelta;
        expect(outline.added.some((l) => l.includes('"plum"'))).toBe(true);
        expect(outline.removed).toEqual([]);
        // Nothing changed since that call: the next delta is empty.
        const again = devtoolsApi.delta();
        expect(again.card).toEqual({});
        expect(again.outline).toEqual({ added: [], removed: [], changed: [] });
    });

    it('with no baseline, and after a navigation, returns the full card and outline', async () => {
        let path = '/a';
        setDevtoolsRouteSource(() => ({ path, params: {}, query: {}, matched: path }));
        mount('deltaroute', '<button>Go</button>', '');
        await settle();
        const first = devtoolsApi.delta();
        expect(first.full).toBe(true);
        expect(first.card.route).toEqual({ path: '/a', matched: '/a' });
        path = '/b';
        const next = devtoolsApi.delta();
        expect(next.route).toBe(true);
        expect(next.full).toBe(true);
        expect(next.card.route).toEqual({ path: '/b', matched: '/b' });
        expect(typeof next.outline).toBe('string');
    });
});

describe('actions() and run()', () => {
    type Host = HTMLElement & { disable(): void };
    const ACTION = "let ok = $signal(true);\n@action remove(id: number) when ok { (globalThis as any).__bodyRuns++; return id * 2; }\n"
        + 'function disable() { ok = false; }\n@expose disable;';

    it('lists an @action with enabled following its when, and the schema of its parameter', async () => {
        const el = mount<Host>('actlist', '<p>x</p>', ACTION);
        await settle();
        expect(devtoolsApi.actions()).toEqual([
            { component: 'app-actlist', name: 'remove', enabled: true, pending: false, error: null, schema: { type: 'number' } },
        ]);
        el.disable();
        expect(devtoolsApi.actions()[0].enabled).toBe(false);
    });

    it('run() of an enabled action resolves success with its result; of a disabled one, ActionDisabledError without running the body', async () => {
        g.__bodyRuns = 0;
        const el = mount<Host>('actrun', '<p>x</p>', ACTION);
        await settle();
        await expect(devtoolsApi.run('app-actrun', 'remove', 21)).resolves.toEqual({ state: 'success', data: 42, error: null });
        expect(g.__bodyRuns).toBe(1);
        el.disable();
        await expect(devtoolsApi.run('app-actrun', 'remove', 1)).resolves.toEqual({ state: 'error', data: null, error: 'ActionDisabledError' });
        expect(g.__bodyRuns).toBe(1);
    });

    it('run() of an unknown component or action rejects, naming what was not found', async () => {
        mount('actunknown', '<p>x</p>', ACTION);
        await settle();
        await expect(devtoolsApi.run('app-nothere', 'remove', 1)).rejects.toThrow(/app-nothere/);
        await expect(devtoolsApi.run('app-actunknown', 'nope', 1)).rejects.toThrow(/nope/);
    });
});

describe('sources()', () => {
    it('lists a resource with its state, pending then success, and the size of an array', async () => {
        let resolve!: (v: number[]) => void;
        (globalThis as unknown as { __load: () => Promise<number[]> }).__load = () => new Promise((r) => { resolve = r; });
        mount('srclist', '<p>x</p>', "const users = resource(() => (globalThis as any).__load(), { key: 'users' });");
        await settle();
        const [pending] = devtoolsApi.sources();
        expect(pending).toMatchObject({ component: 'app-srclist', name: 'users', key: 'users', state: 'pending', pending: true, error: null });
        resolve([1, 2, 3]);
        await settle();
        expect(devtoolsApi.sources()[0]).toMatchObject({ state: 'success', pending: false, size: 3 });
        expect(devtoolsApi.sources()[0]).not.toHaveProperty('data');
    });
});

describe('forms()', () => {
    it('lists the required fields, an invalid value\'s error, and masks a password field', async () => {
        type Host = HTMLElement & { f: { email: { onChange(v: string): void; onBlur(): void } } };
        const el = mount<Host>('formlist', '<input type="password" name="secret" aria-label="Secret">',
            "import { createForm, required, email } from '@pdxui/core';\nconst f = createForm({ initialValues: { email: '', secret: 'hunter2' }, validators: { email: [required(), email()] } });\n@expose f;");
        await settle();
        const [form] = devtoolsApi.forms();
        expect(form).toMatchObject({ component: 'app-formlist', name: 'f', dirty: false, submitting: false });
        const field = (name: string) => form.fields.find((x) => x.name === name);
        expect(field('email')).toMatchObject({ required: true, error: null, touched: false, dirty: false });
        expect(field('secret')).toMatchObject({ value: '***', required: false });

        el.f.email.onChange('not-an-email');
        el.f.email.onBlur();
        await settle();
        const after = devtoolsApi.forms()[0].fields.find((x) => x.name === 'email');
        expect(after).toMatchObject({ value: 'not-an-email', touched: true, dirty: true });
        expect(after?.error).toBeTruthy();
    });
});
