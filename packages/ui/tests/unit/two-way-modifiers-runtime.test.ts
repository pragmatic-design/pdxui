// The binding forms of #126, compiled with the real compiler and mounted against the real core:
// `.debounce(ms)`, the `{ get, set }` form with an assignment in `set`, `.number` and `:x.once`.
// The compiler half is packages/compiler/tests/two-way-modifiers.test.ts.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** Compile a .pdx and run the module: the core import becomes the injected namespace. */
function load(filename: string, source: string, production = false): void {
    const { code } = compile(source, filename, [], undefined, { production });
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const page = (tag: string) => `<template>
<input class="q" ::value.debounce(300)="query" />
<input class="money" ::value="{ get: () => (cents / 100).toFixed(2), set: (s) => cents = Math.round(Number(s) * 100) }" />
<input class="age" ::value.number="age" />
<p class="t" :title.once="label">x</p>
<p class="out">{{ query }}|{{ cents }}|{{ age }}</p>
<button class="relabel" @click="label = 'second'">relabel</button>
</template>
<script setup>
@tag '${tag}';
let query = $signal('');
let cents = $signal(1250);
let age = $signal(30);
let label = $signal('first');
</script>`;

beforeAll(() => {
    load('mods.pdx', page('pdx-mods-dev'));
    load('mods-b.pdx', page('pdx-mods-build'), true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

for (const [path, tag] of [['dev', 'pdx-mods-dev'], ['build', 'pdx-mods-build']] as const) {
    describe(`the binding forms, compiled and mounted — ${path}`, () => {
        async function mount(): Promise<HTMLElement> {
            const el = document.createElement(tag);
            document.body.appendChild(el);
            await tick();
            return el;
        }
        const out = (el: HTMLElement) => el.querySelector('.out')!.textContent;

        it('.debounce(300) writes after 300 ms', async () => {
            const el = await mount();
            vi.useFakeTimers();
            type(el.querySelector<HTMLInputElement>('.q')!, 'abc');
            vi.advanceTimersByTime(299);
            expect(core.untracked(() => out(el))).toBe('|1250|30');
            vi.advanceTimersByTime(1);
            vi.useRealTimers();
            await tick();
            expect(out(el)).toBe('abc|1250|30');
        });

        it('{ get, set } shows the formatted value and writes the parsed one', async () => {
            const el = await mount();
            const money = el.querySelector<HTMLInputElement>('.money')!;
            expect(money.value).toBe('12.50');
            type(money, '3.1');
            await tick();
            expect(out(el)).toBe('|310|30');
        });

        it('.number writes null for empty and keeps the value for an invalid entry', async () => {
            const el = await mount();
            const age = el.querySelector<HTMLInputElement>('.age')!;
            type(age, '');
            await tick();
            expect(out(el)).toBe('|1250|');
            type(age, 'x1');
            await tick();
            expect(out(el)).toBe('|1250|');
            expect(age.getAttribute('aria-invalid')).toBe('true');
        });

        it(':title.once is assigned once', async () => {
            const el = await mount();
            expect(el.querySelector<HTMLElement>('.t')!.title).toBe('first');
            el.querySelector<HTMLButtonElement>('.relabel')!.click();
            await tick();
            expect(el.querySelector<HTMLElement>('.t')!.title).toBe('first');
        });
    });
}
