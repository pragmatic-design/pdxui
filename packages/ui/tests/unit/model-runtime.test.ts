// `@model value` in a child, `::value="name"` in its parent: the value goes both ways (#124).
//
// The compiler half (what is emitted) is packages/compiler/tests/model-rune.test.ts. Here two .pdx
// files are compiled with the real compiler, run against the real @pdxui/core, and mounted: the
// parent's signal reaches the child's input, and what the child writes — the input, or a function
// that assigns the model — comes back to the parent.
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

const child = (tag: string) => `<template>
<input class="inp" ::value="value" />
<button class="clear" @click="clear()">clear</button>
</template>
<script>
@tag '${tag}';
@model value: string = '';
function clear() { value = ''; }
</script>`;

const parent = (tag: string, childTag: string) => `<template>
<${childTag} ::value="name"></${childTag}>
<p class="out">{{ name }}</p>
<button class="rename" @click="name = 'Grace'">rename</button>
</template>
<script>
@tag '${tag}';
let name = $signal('Ada');
</script>`;

beforeAll(() => {
    load('md-field.pdx', child('pdx-md-field'));
    load('md-parent.pdx', parent('pdx-md-parent', 'pdx-md-field'));
    load('md-field-b.pdx', child('pdx-md-field-b'), true);
    load('md-parent-b.pdx', parent('pdx-md-parent-b', 'pdx-md-field-b'), true);
});
afterEach(() => cleanup());

for (const [path, parentTag] of [['dev', 'pdx-md-parent'], ['build', 'pdx-md-parent-b']] as const) {
    describe(`@model and ::value, compiled and mounted — ${path}`, () => {
        async function mount(): Promise<HTMLElement> {
            const el = document.createElement(parentTag);
            document.body.appendChild(el);
            await tick();
            return el;
        }

        it('the parent\'s value reaches the child', async () => {
            const el = await mount();
            expect(el.querySelector<HTMLInputElement>('.inp')!.value).toBe('Ada');
            el.querySelector<HTMLButtonElement>('.rename')!.click();
            await tick();
            expect(el.querySelector<HTMLInputElement>('.inp')!.value).toBe('Grace');
        });

        it('typing in the child\'s input comes back to the parent', async () => {
            const el = await mount();
            const input = el.querySelector<HTMLInputElement>('.inp')!;
            input.value = 'Linus';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await tick();
            expect(el.querySelector('.out')?.textContent).toBe('Linus');
        });

        it('a function that assigns the model writes it back too', async () => {
            const el = await mount();
            el.querySelector<HTMLButtonElement>('.clear')!.click();
            await tick();
            expect(el.querySelector('.out')?.textContent).toBe('');
        });
    });
}
