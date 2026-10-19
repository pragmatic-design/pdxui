// `@await` in a compiled .pdx (#145): the binding, the plain values, the timeout — on the inline path
// every template takes, and in a scoped slot's body, which still takes the template path. The
// runtime alone is await-block.test.ts; over a compiled @fetch, async-contract.test.ts (case 4).

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

function define(name: string, src: string): void {
    const { code, warnings } = compile(src, `${name}.pdx`, [], undefined, {});
    const errors = warnings.filter((w) => w.severity === 'error').map((w) => `${w.code}: ${w.message}`);
    expect(errors, `${name} did not compile clean`).toEqual([]);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

function mount(tag: string): HTMLElement {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    return el;
}

/** A promise the test settles by hand, reachable from the component through a global. */
function held(name: string) {
    let resolve!: (v: unknown) => void;
    const promise = new Promise((res) => { resolve = res; });
    (globalThis as Record<string, unknown>)[name] = promise;
    return { resolve };
}

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('@await (x as name) in a compiled template', () => {
    it('binds the resolved value, and a promise resolving null renders the body', async () => {
        const p = held('__awaitNull');
        define('awaitnull', `<template>
@await (p as value) { <p class="body">{{ String(value) }}</p> } @loading { <p class="loading">…</p> }
</template>
<script>
const p = globalThis.__awaitNull;
</script>`);
        const el = mount('app-awaitnull');
        await settle();
        expect(el.querySelector('.loading')).not.toBeNull();
        p.resolve(null);
        await settle();
        expect(el.querySelector('.body')?.textContent).toBe('null');
    });

    it('a handler in the body reads the bound name', async () => {
        const p = held('__awaitClick');
        define('awaitclick', `<template>
@await (p as user) { <button @click="picked = user.name">{{ user.name }}</button><i>{{ picked }}</i> }
</template>
<script>
const p = globalThis.__awaitClick;
let picked = $signal('');
</script>`);
        const el = mount('app-awaitclick');
        p.resolve({ name: 'ada' });
        await settle();
        el.querySelector('button')!.click();
        await settle();
        expect(el.querySelector('i')?.textContent).toBe('ada');
    });

    it('a type assertion in its own parentheses is the expression, and the last `as` the binding', async () => {
        const p = held('__awaitCast');
        define('awaitcast', `<template>
@await ((p as Promise<string[]>) as list) { <p>{{ list.join(',') }}</p> }
</template>
<script lang="ts">
const p: unknown = globalThis.__awaitCast;
</script>`);
        const el = mount('app-awaitcast');
        p.resolve(['a', 'b']);
        await settle();
        expect(el.querySelector('p')?.textContent).toBe('a,b');
    });
});

describe('@await (x) on a plain value (E5)', () => {
    it('0 renders the body, undefined and false stay on @loading, true renders the body', async () => {
        define('awaitplain', `<template>
<button class="set" @click="step()">next</button>
@await (v) { <p class="body">body</p> } @loading { <p class="loading">loading</p> }
</template>
<script>
let v = $signal(0);
const values = [undefined, false, true];
let i = 0;
function step() { v = values[i++]; }
</script>`);
        const el = mount('app-awaitplain');
        await settle();
        const seen = [el.querySelector('.body') ? 'body' : 'loading'];
        for (let k = 0; k < 3; k++) {
            el.querySelector<HTMLButtonElement>('.set')!.click();
            await settle();
            seen.push(el.querySelector('.body') ? 'body' : 'loading');
        }
        expect(seen, '0, undefined, false, true').toEqual(['body', 'loading', 'loading', 'body']);
    });
});

describe('@await (x) { maxMs } in a compiled template', () => {
    it('a promise still pending at maxMs shows @error with an AwaitTimeoutError, then the body', async () => {
        vi.useFakeTimers();
        const p = held('__awaitSlow');
        define('awaitslow', `<template>
@await (p as v) { maxMs: 300 } { <p class="body">{{ v }}</p> } @loading { <p class="loading">…</p> } @error (e) { <p class="error">{{ e.name }}</p> }
</template>
<script>
const p = globalThis.__awaitSlow;
</script>`);
        const el = mount('app-awaitslow');
        await vi.advanceTimersByTimeAsync(0);
        expect(el.querySelector('.loading')).not.toBeNull();
        await vi.advanceTimersByTimeAsync(300);
        expect(el.querySelector('.error')?.textContent).toBe('AwaitTimeoutError');
        expect(el.querySelector('.body'), 'the body rendered with no result').toBeNull();
        p.resolve('late');
        await vi.advanceTimersByTimeAsync(0);
        expect(el.querySelector('.body')?.textContent).toBe('late');
    });
});

describe('@await in a scoped slot body (the template path)', () => {
    it('binds the value there too', async () => {
        const p = held('__awaitSlot');
        define('awaitslothost', `<template><div class="host"><slot name="row" :item="item"></slot></div></template>
<script>
let item = $signal(1);
</script>`);
        define('awaitslotuser', `<template>
<app-awaitslothost>
  @slot(row, { item }) { @await (p as v) { <b>{{ v }}-{{ item }}</b> } }
</app-awaitslothost>
</template>
<script>
const p = globalThis.__awaitSlot;
</script>`);
        const el = mount('app-awaitslotuser');
        p.resolve('ok');
        await settle();
        expect(el.querySelector('b')?.textContent).toBe('ok-1');
    });
});
