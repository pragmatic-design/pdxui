// Typed snippets for the menus and pickers (#491, part 3a of #131; snippet only, #492).
//
// Each of these components drew the template a parent gave it through a light-DOM scoped slot
// (`<slot name="x" let:row>`, `ctx.__slots`). It declares the slot in its descriptor,
// `slot<(…) => Node>()`, so a parent's `@snippet` — which compiles to setting the element's property
// — reaches it, and since #492 it reads that snippet alone. For each one, the snippet draws the
// expected entries from its arguments. The alpha scoped slot is removed (#492).

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { cleanup, tick } from './helpers';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/cascader/pdx-cascader';
import '../../src/command/pdx-command';
import '../../src/context-menu/pdx-context-menu';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';
import '../../src/select/pdx-select';
import '../../src/tree-select/pdx-tree-select';

type Scope = Record<string, unknown>;
type Args = unknown[];

interface Case {
    tag: string;
    /** The snippet's name. */
    slot: string;
    /** Props set before the element is connected. */
    props: Record<string, unknown>;
    /** What makes the component draw its entries. */
    open(el: HTMLElement): Promise<void> | void;
    /** The same text, drawn by the snippet from its arguments. */
    fromArgs(...args: Args): string;
    /** The entries the snippet draws. */
    expected: string[];
}

const MENU_ITEMS = [{ key: 'cut', label: 'Cut' }, { key: 'copy', label: 'Copy' }];
const OPTIONS = [{ label: 'Italy', value: 'it' }, { label: 'France', value: 'fr' }];
const TREE = [{ value: 'fruit', label: 'Fruit', children: [{ value: 'apple', label: 'Apple' }] }];

const click = (el: HTMLElement, selector: string) => (el.querySelector(selector) as HTMLElement).click();

const CASES: Case[] = [
    {
        tag: 'pdx-autocomplete', slot: 'option',
        props: { suggestions: OPTIONS, debounce: 0 },
        async open(el) {
            const input = el.querySelector('input:not([type="hidden"])') as HTMLInputElement;
            input.dispatchEvent(new Event('focus'));
            input.value = 'a';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        fromArgs: (o, index) => `${(o as Scope).label}=${(o as Scope).value}#${index}`,
        expected: ['Italy=it#0', 'France=fr#1'],
    },
    {
        tag: 'pdx-cascader', slot: 'option',
        props: { options: [{ value: 'it', label: 'Italy', children: [{ value: 'lz', label: 'Lazio' }] }] },
        open: (el) => click(el, '[role="combobox"]'),
        fromArgs: (node, level) => `${(node as Scope).label}@${level}`,
        expected: ['Italy@0'],
    },
    {
        tag: 'pdx-command', slot: 'item',
        props: { items: [{ label: 'Open', value: 'open' }, { label: 'Save', value: 'save' }], open: true },
        open: () => undefined,
        fromArgs: (item, index) => `${(item as Scope).label}#${index}`,
        expected: ['Open#0', 'Save#1'],
    },
    {
        tag: 'pdx-context-menu', slot: 'item',
        props: { items: MENU_ITEMS },
        open: (el) => (el as unknown as { show(x: number, y: number): void }).show(10, 10),
        fromArgs: (item) => `${(item as Scope).label}:${(item as Scope).type ?? 'item'}`,
        expected: ['Cut:item', 'Copy:item'],
    },
    {
        tag: 'pdx-dropdown-menu', slot: 'item',
        props: { items: MENU_ITEMS, label: 'Edit' },
        open: (el) => click(el, 'button'),
        fromArgs: (item) => `${(item as Scope).label}:${(item as Scope).type ?? 'item'}`,
        expected: ['Cut:item', 'Copy:item'],
    },
    {
        tag: 'pdx-menu', slot: 'item',
        props: { items: MENU_ITEMS, open: true },
        open: () => undefined,
        fromArgs: (item) => `${(item as Scope).label}:${(item as Scope).type ?? 'item'}`,
        expected: ['Cut:item', 'Copy:item'],
    },
    {
        tag: 'pdx-select', slot: 'item',
        props: { options: OPTIONS },
        open: (el) => click(el, '.pdx-select-trigger'),
        fromArgs: (o, index) => `${(o as Scope).label}=${(o as Scope).value}#${index}`,
        expected: ['Italy=it#0', 'France=fr#1'],
    },
    {
        tag: 'pdx-select', slot: 'selected',
        props: { options: OPTIONS, value: 'fr' },
        open: () => undefined,
        fromArgs: (o) => `${(o as Scope).label}=${(o as Scope).value}`,
        expected: ['France=fr'],
    },
    {
        tag: 'pdx-tree-select', slot: 'node',
        props: { options: TREE, expandAll: true },
        open: (el) => click(el, '[role="combobox"]'),
        fromArgs: (node, level) => `${(node as Scope).label}@${level}`,
        expected: ['Fruit@0', 'Apple@1'],
    },
];

function mark(text: string): Node {
    const span = document.createElement('span');
    span.className = 'mine';
    span.textContent = text;
    return span;
}

async function mount(c: Case, give: (el: HTMLElement) => void): Promise<string[]> {
    const el = document.createElement(c.tag);
    for (const [k, v] of Object.entries(c.props)) (el as unknown as Record<string, unknown>)[k] = v;
    give(el);
    document.body.appendChild(el);
    await tick(50);
    await c.open(el);
    await tick(50);
    // A menu's panel may be placed outside the host: the whole document is read.
    return [...document.querySelectorAll('.mine')].map((n) => n.textContent ?? '');
}

/** The snippet: the element's property, which is what a parent's `@snippet` compiles to setting. */
function snippet(c: Case) {
    return (el: HTMLElement) => {
        (el as unknown as Record<string, unknown>)[c.slot] = (...args: Args) => mark(c.fromArgs(...args));
    };
}

describe('menus and pickers: a snippet draws its entries (#491, #492)', () => {
    beforeEach(cleanup);

    for (const c of CASES) {
        describe(`${c.tag} — ${c.slot}`, () => {

            it('a snippet draws its entries, from its arguments', async () => {
                expect(await mount(c, snippet(c))).toEqual(c.expected);
            });
        });
    }
});

describe("a parent's @snippet, compiled (#491)", () => {
    beforeEach(cleanup);

    it('reaches pdx-select: `@snippet item(o, i)` draws each option', async () => {
        const src = `<template>
  <pdx-select :options="opts">
    @snippet item(o, i) { <b class="mine">{{ o.label }}#{{ i }}</b> }
  </pdx-select>
</template>
<script>
let opts = $signal([{ label: 'Italy', value: 'it' }, { label: 'France', value: 'fr' }]);
</script>
`;
        const { code, warnings } = compile(src, 'snip-select-page.pdx', [], undefined, {});
        expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        expect(body, 'the page imports something besides @pdxui/core').not.toMatch(/^import /m);
        new Function('__core', body)(core);

        const page = document.createElement('app-snip-select-page');
        document.body.appendChild(page);
        await tick(50);
        click(page, '.pdx-select-trigger');
        await tick(50);
        expect([...document.querySelectorAll('.mine')].map((n) => n.textContent)).toEqual(['Italy#0', 'France#1']);
    });
});
