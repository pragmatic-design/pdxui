// `@prop for as htmlFor: string = ''` (#1239), compiled and mounted.
//
// The compiler half is packages/compiler/tests/prop-alias.test.ts. Here the component is compiled with
// the real compiler, run against the real @pdxui/core and mounted: `<x for="email">` sets the prop, the
// script and the template read it as `htmlFor`, and the element's property is `for`.
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
    load('al-label.pdx', `<template><label :for="htmlFor || null">{{ shout() }}</label></template>
<script>
@tag 'pdx-al-label';
@prop for as htmlFor: string = '';
function shout() { return htmlFor.toUpperCase(); }
</script>`);
});
afterEach(() => cleanup());

type Label = HTMLElement & { for: string };

async function mount(attr?: string): Promise<Label> {
    const el = document.createElement('pdx-al-label') as Label;
    if (attr !== undefined) el.setAttribute('for', attr);
    document.body.appendChild(el);
    await tick();
    return el;
}

describe('@prop for as htmlFor, mounted', () => {
    it('the attribute `for` sets the prop, which the template and the script read as htmlFor', async () => {
        const el = await mount('email');
        expect(el.for).toBe('email');
        expect(el.querySelector('label')!.htmlFor).toBe('email');
        expect(el.querySelector('label')!.textContent).toBe('EMAIL');
    });

    it('follows a later change of the attribute and of the property', async () => {
        const el = await mount('a');
        el.setAttribute('for', 'b');
        await tick();
        expect(el.querySelector('label')!.htmlFor).toBe('b');
        el.for = 'c';
        await tick();
        expect(el.querySelector('label')!.getAttribute('for')).toBe('c');
    });

    it('with no attribute it holds its default, and the label has no for', async () => {
        const el = await mount();
        expect(el.for).toBe('');
        expect(el.querySelector('label')!.hasAttribute('for')).toBe(false);
    });
});
