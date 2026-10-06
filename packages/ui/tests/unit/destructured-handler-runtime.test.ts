// A handler taken from a composable with a destructuring declaration answers the click.
//
// The compiler half — which names reach the auto-return — is
// packages/compiler/tests/destructured-exports.test.ts. This is the half the author sees: the .pdx
// compiled with the real compiler, run against the real @pdxui/core, mounted and clicked. A name
// missing from the auto-return makes the template read `ctx.bump` as `undefined`, and the click does
// nothing, with nothing logged.
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

// The composable is inline so the module imports nothing but core: an object of handlers, the shape
// `createListActions` has in the showcase.
const COUNTER = `<template>
<button class="bump" @click="bump">+</button>
<button class="reset" @click="clear()">0</button>
<p class="count">{{ n }}</p>
</template>
<script setup>
let n = $signal(0);
function makeCounter() {
  return { bump: () => n++, reset: () => n = 0 };
}
const { bump, reset: clear } = makeCounter();
</script>`;

beforeAll(() => load('destructured-counter.pdx', COUNTER));
afterEach(() => cleanup());

describe('a destructured handler, compiled and mounted', () => {
    it('the template calls it, by reference and under its renamed local name', async () => {
        const el = document.createElement('pdx-destructured-counter');
        document.body.appendChild(el);
        await tick();
        const count = () => el.querySelector('.count')!.textContent!.trim();
        expect(count()).toBe('0');

        el.querySelector<HTMLButtonElement>('.bump')!.click();
        el.querySelector<HTMLButtonElement>('.bump')!.click();
        await tick();
        expect(count(), 'the destructured handler did nothing').toBe('2');

        el.querySelector<HTMLButtonElement>('.reset')!.click();
        await tick();
        expect(count(), 'the renamed binding did nothing').toBe('0');
    });
});
