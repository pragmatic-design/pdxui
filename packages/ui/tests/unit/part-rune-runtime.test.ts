// `@part trigger, popup;` (#134), compiled with the real compiler and mounted against the real
// @pdxui/core: the script's `trigger` is the element that carries `data-part="trigger"`, and a part in
// a block is its element while the block is rendered and null after. The compiler half is
// packages/compiler/tests/part-rune.test.ts.
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

const MENU = `<template>
<button data-part="trigger" @click="open = !open">Menu</button>
@if (open) { <div data-part="popup">items</div> }
</template>
<script>
@part trigger, popup;
let open = $signal(false);
@expose parts;
function parts() { return { trigger, popup }; }
</script>`;

beforeAll(() => load('part-menu.pdx', MENU));
afterEach(() => cleanup());

type Parts = { trigger: Element | null; popup: Element | null };

async function mount(): Promise<HTMLElement & { parts(): Parts }> {
    const el = document.createElement('app-part-menu') as HTMLElement & { parts(): Parts };
    document.body.appendChild(el);
    await tick();
    return el;
}

describe('@part, compiled and mounted', () => {
    it('the part\'s ref is the element that carries its data-part', async () => {
        const el = await mount();
        const trigger = el.querySelector('[data-part="trigger"]');
        expect(trigger).not.toBeNull();
        expect(el.parts().trigger).toBe(trigger);
    });

    it('a part in a block is its element while the block is rendered, and null after', async () => {
        const el = await mount();
        expect(el.parts().popup).toBeNull();
        el.querySelector<HTMLButtonElement>('[data-part="trigger"]')!.click();
        await tick();
        expect(el.parts().popup).toBe(el.querySelector('[data-part="popup"]'));
        el.querySelector<HTMLButtonElement>('[data-part="trigger"]')!.click();
        await tick();
        expect(el.parts().popup).toBeNull();
    });
});
