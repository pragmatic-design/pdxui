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

// A part on every row and beside the rows (#988): the name is the array of the rendered elements.
const LIST = `<template>
<ul>
  @for (items as it; track it) { <li data-part="option">{{ it }}</li> }
  @if (creating) { <li data-part="option">create</li> }
</ul>
@if (wide) { <input data-part="search" class="a"> } @else { <input data-part="search" class="b"> }
</template>
<script>
@part option, search;
let items = $signal(['a', 'b']);
let creating = $signal(false);
let wide = $signal(true);
@expose parts, setItems, setCreating, setWide;
function parts() { return { option, search }; }
function setItems(v) { items = v; }
function setCreating(v) { creating = v; }
function setWide(v) { wide = v; }
</script>`;

beforeAll(() => {
    load('part-menu.pdx', MENU);
    load('part-list.pdx', LIST);
});
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

type ListEl = HTMLElement & {
    parts(): { option: Element[]; search: Element | null };
    setItems(v: string[]): void; setCreating(v: boolean): void; setWide(v: boolean): void;
};

async function mountList(): Promise<ListEl> {
    const el = document.createElement('app-part-list') as ListEl;
    document.body.appendChild(el);
    await tick();
    return el;
}

const rendered = (el: Element, part: string) => [...el.querySelectorAll(`[data-part="${part}"]`)];

describe('@part on several elements, compiled and mounted (#988)', () => {
    it('a part on the rows is every rendered row\'s element, in document order', async () => {
        const el = await mountList();
        expect(el.parts().option).toHaveLength(2);
        expect(el.parts().option).toEqual(rendered(el, 'option'));
    });

    it('follows the list as it grows and shrinks, and the element beside the rows', async () => {
        const el = await mountList();
        el.setItems(['a', 'b', 'c']);
        await tick();
        expect(el.parts().option).toEqual(rendered(el, 'option'));
        expect(el.parts().option).toHaveLength(3);

        el.setCreating(true);
        await tick();
        expect(el.parts().option).toHaveLength(4);
        expect(el.parts().option).toEqual(rendered(el, 'option'));

        // A row added before the create option takes its place in document order, not at the end.
        el.setItems(['a', 'b', 'c', 'd']);
        await tick();
        expect(el.parts().option).toEqual(rendered(el, 'option'));

        el.setItems(['a']);
        el.setCreating(false);
        await tick();
        expect(el.parts().option).toEqual(rendered(el, 'option'));
        expect(el.parts().option).toHaveLength(1);
    });

    it('a part on alternative branches of one chain is the rendered element, and follows the branch', async () => {
        const el = await mountList();
        expect(el.parts().search).toBe(el.querySelector('[data-part="search"].a'));
        el.setWide(false);
        await tick();
        expect(el.parts().search).toBe(el.querySelector('[data-part="search"].b'));
    });
});
