// `@model value: string | string[] | null = null { attribute: string }` (#753), compiled and mounted.
//
// The compiler half is packages/compiler/tests/model-attribute-option.test.ts. Here the component is
// compiled with the real compiler, run against the real @pdxui/core and mounted: its attribute is read
// as a string — `"1"` stays `'1'` and `'["a"]'` stays the text, where the union alone read them as
// JSON, a number and an array — and an array set on the property stays the array.
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

beforeAll(() => {
    load('ma-pick.pdx', `<template><p class="out">{{ JSON.stringify(value) }}</p></template>
<script>
@tag 'pdx-ma-pick';
@model value: string | string[] | null = null { attribute: string };
</script>`);
});
afterEach(() => cleanup());

async function mount(attr?: string): Promise<HTMLElement & { value: unknown }> {
    const el = document.createElement('pdx-ma-pick') as HTMLElement & { value: unknown };
    if (attr !== undefined) el.setAttribute('value', attr);
    document.body.appendChild(el);
    await tick();
    return el;
}

describe('@model … { attribute: string }, mounted', () => {
    it('reads the attribute as a string, not as JSON', async () => {
        expect((await mount('a')).value).toBe('a');
        expect((await mount('1')).value).toBe('1');
        expect((await mount('["a"]')).value).toBe('["a"]');
    });

    it('keeps an array set on the property, and draws it', async () => {
        const el = await mount();
        expect(el.value).toBeNull();
        el.value = ['a', 'b'];
        await tick();
        expect(el.value).toEqual(['a', 'b']);
        expect(el.querySelector('.out')!.textContent).toBe('["a","b"]');
    });
});
