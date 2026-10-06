// `@event picked: string` + `picked('a')` → the parent's `@picked` handler receives 'a'.
//
// The compiler half (what is emitted, on each path) is packages/compiler/tests/event-emitter.test.ts.
// This is the half that matters to whoever wrote the component: two .pdx files compiled with the real
// compiler, evaluated against the real @pdxui/core, mounted, clicked. The failure it guards against:
// the click logs "[pdx] Unhandled event error: picked is not defined" and the parent hears nothing.
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

const CHILD = `<template>
<button class="pick" @click="picked('a')">pick</button>
<button class="choose" @click="choose('b')">choose</button>
<button class="emit" @click="go('c')">emit</button>
</template>
<script setup>
@event picked: string;
let clicks = $signal(0);
function choose(v) { clicks++; picked(v); }
function go(v) { $emit('chosen', v); }
</script>`;

const PARENT = `<template>
<pdx-ev-child @picked="e => got = e.detail" @chosen="e => chose = e.detail"></pdx-ev-child>
<p class="got">{{ got }}</p>
<p class="chose">{{ chose }}</p>
</template>
<script setup>
let got = $signal('');
let chose = $signal('');
</script>`;

beforeAll(() => {
    load('ev-child.pdx', CHILD);
    load('ev-parent.pdx', PARENT);
});
afterEach(() => cleanup());

async function mountParent(): Promise<HTMLElement> {
    const el = document.createElement('pdx-ev-parent');
    document.body.appendChild(el);
    await tick();
    return el;
}

describe('@event, compiled and mounted', () => {
    it('the template calls the emitter and the parent receives the detail', async () => {
        const errors: unknown[] = [];
        const off = core.onGlobalError((err) => { errors.push(err); return true; });
        const parent = await mountParent();
        parent.querySelector<HTMLButtonElement>('.pick')!.click();
        await tick();
        off();
        expect(errors.map(String), 'the click threw instead of dispatching').toEqual([]);
        expect(parent.querySelector('.got')?.textContent).toBe('a');
    });

    it('the script calls it too', async () => {
        const parent = await mountParent();
        parent.querySelector<HTMLButtonElement>('.choose')!.click();
        await tick();
        expect(parent.querySelector('.got')?.textContent).toBe('b');
    });

    it('$emit dispatches the same way', async () => {
        const parent = await mountParent();
        parent.querySelector<HTMLButtonElement>('.emit')!.click();
        await tick();
        expect(parent.querySelector('.chose')?.textContent).toBe('c');
    });

    it('the event bubbles and crosses shadow roots, like every event a pdx component emits', async () => {
        const parent = await mountParent();
        let seen: CustomEvent | null = null;
        document.body.addEventListener('picked', (e) => { seen = e as CustomEvent; }, { once: true });
        parent.querySelector<HTMLButtonElement>('.pick')!.click();
        await tick();
        expect(seen, 'the event did not reach the document body').not.toBeNull();
        expect(seen!.detail).toBe('a');
        expect(seen!.composed).toBe(true);
    });
});
