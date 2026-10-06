// What to do with an import the template needs — as the skills say, measured.
//
// An import used directly in the template gives `ctx.X is not a function`, and "wrap it in a const
// or a function" is only half the cure. For a shared signal it is the trap: `const user = shared()`
// is a snapshot that never updates, and `const user = shared` read as `{{ user.name }}` renders
// "read" — a property of the signal function. The wrapper that follows the signal is `$derived`.
//
// Measured (ui, compiled .pdx mounted in happy-dom):
//   signal imported and used in the template → the component throws at mount, `ctx.X is not a function`
//   function imported and used in @click     → `ctx.X is not a function` on click, nothing happens
//   const s = shared()          → a snapshot, does not follow
//   const s = shared  + s.name  → renders "read"
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
    it('$derived follows it — the cure the skills give', async () => {
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
        it(`${name} gives $derived as the wrapper for an imported signal`, () => {
            const para = text.split(/\n\s*\n/).find(p => /import/i.test(p) && /not a function/.test(p)) ?? '';
            expect(para, `${name} has no paragraph about an import used in the template`).not.toBe('');
            expect(para, `${name} still gives "a const" as the cure for a signal`).toMatch(/\$derived/);
        });
    }
});
