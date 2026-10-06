// A template handler calls what the script imports, and it works when clicked.
//
// The compiler half — what is emitted on each path — is
// packages/compiler/tests/template-imports.test.ts. This is the half the author meets: a .pdx
// compiled with the real compiler, evaluated against the real @pdxui/core, mounted, clicked.
// A handler that does not reach the import raises «ctx.setScheme is not a function» on the click,
// and the page does nothing.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** Compile a .pdx and run the module: the core import becomes the injected namespace. */
function load(filename: string, source: string): void {
    const { code } = compile(source, filename, [], undefined, {});
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const SWITCH = `<template>
<button class="dark" @click="setScheme('dark')">dark</button>
<button class="light" @click="setScheme('light')">light</button>
<p class="label">{{ which }}</p>
</template>
<script setup>
import { setScheme } from '@pdxui/core';
let which = $signal('light');
</script>`;

beforeAll(() => load('imp-switch.pdx', SWITCH));
afterEach(() => {
    core.setScheme('light');
    cleanup();
});

async function mount(): Promise<HTMLElement> {
    const el = document.createElement('pdx-imp-switch');
    document.body.appendChild(el);
    await tick();
    return el;
}

describe('an imported function, called from a template handler', () => {
    it('runs when clicked, and nothing is raised', async () => {
        const errors: unknown[] = [];
        const off = core.onGlobalError((err) => { errors.push(err); return true; });
        const el = await mount();

        el.querySelector<HTMLButtonElement>('.dark')!.click();
        await tick();
        off();

        expect(errors.map(String), 'the click threw instead of calling the import').toEqual([]);
        expect(document.documentElement.getAttribute('pdx-scheme'), 'the imported function never ran').toBe('dark');
    });

    it('each handler calls it with its own argument, and each step is seen', async () => {
        const el = await mount();
        el.querySelector<HTMLButtonElement>('.dark')!.click();
        await tick();
        expect(document.documentElement.getAttribute('pdx-scheme')).toBe('dark');
        el.querySelector<HTMLButtonElement>('.light')!.click();
        await tick();
        expect(document.documentElement.getAttribute('pdx-scheme')).toBe('light');
    });

    it('control — mounting runs nothing: the call happens on the click, not at bind time', async () => {
        // A handler compiled to the CALL instead of a function would set dark the moment the button
        // is bound, and the first row would pass for the wrong reason.
        await mount();
        expect(document.documentElement.getAttribute('pdx-scheme'), 'the handler ran without a click').toBe('light');
    });
});
