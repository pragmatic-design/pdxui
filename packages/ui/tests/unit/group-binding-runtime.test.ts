// `::group` compiled and mounted (#127): checkboxes and radios bound to one signal, written by hand
// and inside a `@for` whose rows give each input its `:value`. The core half is
// packages/core/tests/group-binding.test.ts.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
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
@for (options as t; track t) {
  <label><input type="checkbox" class="top" :value="t" ::group="toppings" /> {{ t }}</label>
}
<input type="radio" name="size" class="small" value="small" ::group="size" />
<input type="radio" name="size" class="large" value="large" ::group="size" />
<p class="out">{{ toppings.join(',') }}|{{ size }}</p>
</template>
<script>
@tag '${tag}';
let options = $signal(['cheese', 'ham', 'olives']);
let toppings = $signal(['ham']);
let size = $signal('small');
</script>`;

beforeAll(() => {
    load('group.pdx', page('pdx-group-dev'));
    load('group-b.pdx', page('pdx-group-build'), true);
});
afterEach(() => cleanup());

for (const [path, tag] of [['dev', 'pdx-group-dev'], ['build', 'pdx-group-build']] as const) {
    describe(`::group, compiled and mounted — ${path}`, () => {
        async function mount(): Promise<HTMLElement> {
            const el = document.createElement(tag);
            document.body.appendChild(el);
            await tick();
            return el;
        }

        it('the @for rows are checked by the array, and toggling one writes it', async () => {
            const el = await mount();
            const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('.top'));
            expect(boxes.map(b => [b.value, b.checked])).toEqual([['cheese', false], ['ham', true], ['olives', false]]);
            boxes[2].click();
            await tick();
            expect(el.querySelector('.out')?.textContent).toBe('ham,olives|small');
            boxes[1].click();
            await tick();
            expect(el.querySelector('.out')?.textContent).toBe('olives|small');
        });

        it('the radios hold one value', async () => {
            const el = await mount();
            expect(el.querySelector<HTMLInputElement>('.small')!.checked).toBe(true);
            el.querySelector<HTMLInputElement>('.large')!.click();
            await tick();
            expect(el.querySelector('.out')?.textContent).toBe('ham|large');
        });
    });
}
