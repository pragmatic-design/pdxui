// What to do with an import the template needs — as the skills say, measured.
//
// An import is reached by the template as it is, without `ctx.` (the compiler knows the script's
// imports): `{{ shared().name }}` reads an imported signal and follows it, `@click="go('x')"` calls an
// imported function. This file used to measure the opposite — `ctx.X is not a function` at mount and on
// click — from before the compiler resolved imports; the skills taught the workaround, and #208 brought
// them back to what the code does. What stays a trap: `const user = shared()` in the script is a
// snapshot that never updates.
//
// Measured (ui, compiled .pdx mounted in happy-dom):
//   signal imported, read in the template as shared() → follows
//   function imported, called from @click             → called
//   const s = shared()          → a snapshot, does not follow
//   const s = $derived(shared()) → follows
//   const go2 = go / a wrapper function → both call it
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

const SKILLS = join(__dirname, '../../../../marketplace/plugins/pdxui/skills');
const store = { shared: core.signal({ name: 'a' }), calls: [] as string[], go(x: string) { store.calls.push(x); } };
let n = 0;

/** Compile a .pdx that imports { shared, go } from './store', mount it, return the element. */
async function mount(script: string, template: string): Promise<HTMLElement> {
    const file = `imp-${n++}.pdx`;
    const src = `<template>\n${template}\n</template>\n<script setup>\nimport { shared, go } from './store';\nlet _k = $signal(0);\n${script}\n</script>`;
    const body = compile(src, file, [], undefined, {}).code
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/g, 'const {$1} = __core;')
        .replace(/import\s*\{([^}]*)\}\s*from\s*'\.\/store';?/g, 'const {$1} = __store;');
    new Function('__core', '__store', body)(core, store);
    const el = document.createElement(`pdx-${file.replace('.pdx', '')}`);
    document.body.appendChild(el);
    await tick();
    return el;
}

afterEach(() => { cleanup(); store.shared.set({ name: 'a' }); store.calls.length = 0; });

describe('an imported shared signal in the template', () => {
    it('read directly in the template, it follows', async () => {
        const el = await mount('', '<b class="v">{{ shared().name }}</b>');
        expect(el.querySelector('.v')?.textContent).toBe('a');
        store.shared.set({ name: 'b' });
        await tick();
        expect(el.querySelector('.v')?.textContent, 'the imported signal read in the template did not follow').toBe('b');
    });

    it('$derived in the script follows it too', async () => {
        const el = await mount('const user = $derived(shared());', '<b class="v">{{ user.name }}</b>');
        expect(el.querySelector('.v')?.textContent).toBe('a');
        store.shared.set({ name: 'b' });
        await tick();
        expect(el.querySelector('.v')?.textContent, 'the $derived wrapper did not follow the shared signal').toBe('b');
    });

    it('a const of its value does not — the trap the skills warn about', async () => {
        const el = await mount('const user = shared();', '<b class="v">{{ user.name }}</b>');
        store.shared.set({ name: 'b' });
        await tick();
        expect(el.querySelector('.v')?.textContent).toBe('a');
    });
});

describe('an imported function in a handler', () => {
    it('called directly from the template, it runs', async () => {
        const el = await mount('', `<button class="d" @click="go('direct')">d</button>`);
        el.querySelector<HTMLElement>('.d')!.click();
        await tick();
        expect(store.calls).toEqual(['direct']);
    });

    it('a const alias and a wrapper function both call it', async () => {
        const el = await mount("const goTo = go;\nfunction goHome() { go('home'); }",
            `<button class="a" @click="goTo('alias')">a</button><button class="w" @click="goHome()">w</button>`);
        el.querySelector<HTMLElement>('.a')!.click();
        el.querySelector<HTMLElement>('.w')!.click();
        await tick();
        expect(store.calls).toEqual(['alias', 'home']);
    });
});

describe('the skills say so', () => {
    const gotchas = readFileSync(join(SKILLS, 'pdxui/references/gotchas.md'), 'utf8').replace(/\r\n/g, '\n');
    const pdx = readFileSync(join(SKILLS, 'pdxui-language/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

    for (const [name, text] of [['gotchas.md', gotchas], ['pdxui-language/SKILL.md', pdx]] as const) {
        it(`${name} says an import is used in the template as written`, () => {
            const para = text.split(/\n\s*\n|\n- /).find(p => /import/i.test(p) && /called as written/.test(p)) ?? '';
            expect(para, `${name} has no paragraph saying an import in the template is called as written`).not.toBe('');
            expect(para, `${name} reads an imported signal some other way than with its parentheses`).toMatch(/shared\(\)/);
            expect(text, `${name} still says an import in the template is "not a function"`).not.toMatch(/import[^.]*not a function/i);
        });
    }
});
