// `@prop columns: number | 'auto' = 3 { attribute: string }` (#1347), compiled and mounted.
//
// The compiler half is packages/compiler/tests/prop-attribute-option.test.ts. Here the component is
// compiled with the real compiler, run against the real @pdxui/core and mounted: the prop observes its
// attribute, `columns="2"` sets it to '2' and a later attribute change is read. Without the option the
// union is an Object prop: its attribute is not observed, so a later change sets nothing, and the one
// present at mount is read as JSON, `"2"` as the number 2.
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
    load('pa-grid.pdx', `<template><p class="out">{{ JSON.stringify(columns) }}</p></template>
<script>
@tag 'pdx-pa-grid';
@prop columns: number | 'auto' = 3 { attribute: string };
</script>`);
    load('pa-bare.pdx', `<template><p class="out">{{ JSON.stringify(columns) }}</p></template>
<script>
@tag 'pdx-pa-bare';
@prop columns: number | 'auto' = 3;
</script>`);
});
afterEach(() => cleanup());

/** The attributes a defined element observes: the static the platform reads, not in the DOM's type. */
const observed = (tag: string): readonly string[] =>
    (customElements.get(tag) as unknown as { observedAttributes: readonly string[] }).observedAttributes;

async function mount(tag: string, attr?: string): Promise<HTMLElement & { columns: unknown }> {
    const el = document.createElement(tag) as HTMLElement & { columns: unknown };
    if (attr !== undefined) el.setAttribute('columns', attr);
    document.body.appendChild(el);
    await tick();
    return el;
}

describe("@prop … { attribute: string }, mounted", () => {
    it('reads its attribute, and a later change of it', async () => {
        const el = await mount('pdx-pa-grid', '2');
        expect(el.columns).toBe('2');
        el.setAttribute('columns', 'auto');
        await tick();
        expect(el.columns).toBe('auto');
        expect(el.querySelector('.out')!.textContent).toBe('"auto"');
    });

    it('keeps its default with no attribute, and a number set on the property', async () => {
        const el = await mount('pdx-pa-grid');
        expect(el.columns).toBe(3);
        el.columns = 4;
        await tick();
        expect(el.columns).toBe(4);
    });

    it('is an observed attribute', () => {
        expect(observed('pdx-pa-grid')).toContain('columns');
    });

    it('the control: without the option the attribute is not observed, and read at mount as JSON', async () => {
        // An Object prop: core reads the attribute present at mount as JSON, and observes none after.
        expect(observed('pdx-pa-bare')).not.toContain('columns');
        const el = await mount('pdx-pa-bare', '2');
        expect(el.columns, '"2" read as JSON').toBe(2);
        el.setAttribute('columns', '5');
        await tick();
        expect(el.columns, 'a later attribute is not read').toBe(2);
    });
});
