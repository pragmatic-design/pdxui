// `@host { … }` (#133), compiled with the real compiler and mounted against the real @pdxui/core:
// the component's own element carries the static attribute, the bound one follows its signal, a
// listener on the host calls the script's function, and a page's own `role` is kept.
// The compiler half — what is emitted, and the forms that are refused — is
// packages/compiler/tests/host-rune.test.ts.
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

const COMBO = `<template>
<span class="label">{{ label }}</span>
</template>
<script setup>
@prop label: string = 'Choose';
let open = $signal(false);
@host {
  role="combobox"
  :aria-expanded="open ? 'true' : 'false'"
  @keydown.enter="onKey"
}
function onKey(e) { open = !open; }
</script>`;

beforeAll(() => load('host-combo.pdx', COMBO));
afterEach(() => cleanup());

async function mount(attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('app-host-combo');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await tick();
    return el;
}

const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('@host, compiled and mounted', () => {
    it('the host gets the static role', async () => {
        expect((await mount()).getAttribute('role')).toBe('combobox');
    });

    it('the bound aria-expanded follows the signal, and keydown on the host calls the handler', async () => {
        const el = await mount();
        expect(el.getAttribute('aria-expanded')).toBe('false');
        key(el, 'Enter');
        await tick();
        expect(el.getAttribute('aria-expanded')).toBe('true');
        key(el, 'a');
        await tick();
        expect(el.getAttribute('aria-expanded'), 'the .enter modifier lets another key through').toBe('true');
    });

    it('a role the page set is kept', async () => {
        expect((await mount({ role: 'listbox' })).getAttribute('role')).toBe('listbox');
    });
});
