// Typed snippets for the menus and pickers (#491, part 3a of #131).
//
// Each of these components drew the template a parent gave it through a light-DOM scoped slot only
// (`<slot name="x" let:row>`, `ctx.__slots`). It now declares the slot in its descriptor,
// `slot<(…) => Node>()`, so a parent's `@snippet` — which compiles to setting the element's property
// — reaches it. For each one, the same text is drawn once by a snippet from its arguments and once by
// the alpha scoped slot from its scope: the two must render the same entries, and the scoped slot
// must keep working until #131's removal part.

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
    /** The slot's name, the same on both sides. */
    slot: string;
    /** Props set before the element is connected. */
    props: Record<string, unknown>;
    /** What makes the component draw its entries. */
    open(el: HTMLElement): Promise<void> | void;
    /** The text the alpha scoped slot draws from its scope. */
    fromScope(scope: Scope): string;
    /** The same text, drawn by the snippet from its arguments. */
    fromArgs(...args: Args): string;
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
        fromScope: (s) => `${s.label}=${s.value}#${s.index}`,
        fromArgs: (o, index) => `${(o as Scope).label}=${(o as Scope).value}#${index}`,
    },
    {
        tag: 'pdx-cascader', slot: 'option',
        props: { options: [{ value: 'it', label: 'Italy', children: [{ value: 'lz', label: 'Lazio' }] }] },
        open: (el) => click(el, '[role="combobox"]'),
        fromScope: (s) => `${(s.node as Scope).label}@${s.level}`,
        fromArgs: (node, level) => `${(node as Scope).label}@${level}`,
    },
    {
        tag: 'pdx-command', slot: 'item',
        props: { items: [{ label: 'Open', value: 'open' }, { label: 'Save', value: 'save' }], open: true },
        open: () => undefined,
        fromScope: (s) => `${(s.item as Scope).label}#${s.index}`,
        fromArgs: (item, index) => `${(item as Scope).label}#${index}`,
    },
    {
        tag: 'pdx-context-menu', slot: 'item',
        props: { items: MENU_ITEMS },
        open: (el) => (el as unknown as { show(x: number, y: number): void }).show(10, 10),
        fromScope: (s) => `${(s.item as Scope).label}:${s.type}`,
        fromArgs: (item) => `${(item as Scope).label}:${(item as Scope).type ?? 'item'}`,
    },
    {
        tag: 'pdx-dropdown-menu', slot: 'item',
        props: { items: MENU_ITEMS, label: 'Edit' },
        open: (el) => click(el, 'button'),
        fromScope: (s) => `${(s.item as Scope).label}:${s.type}`,
        fromArgs: (item) => `${(item as Scope).label}:${(item as Scope).type ?? 'item'}`,
    },
    {
        tag: 'pdx-menu', slot: 'item',
        props: { items: MENU_ITEMS, open: true },
        open: () => undefined,
        fromScope: (s) => `${(s.item as Scope).label}:${s.type}`,
        fromArgs: (item) => `${(item as Scope).label}:${(item as Scope).type ?? 'item'}`,
    },
    {
        tag: 'pdx-select', slot: 'item',
        props: { options: OPTIONS },
        open: (el) => click(el, '.pdx-select-trigger'),
        fromScope: (s) => `${s.label}=${s.value}#${s.index}`,
        fromArgs: (o, index) => `${(o as Scope).label}=${(o as Scope).value}#${index}`,
    },
    {
        tag: 'pdx-select', slot: 'selected',
        props: { options: OPTIONS, value: 'fr' },
        open: () => undefined,
        fromScope: (s) => `${s.label}=${s.value}`,
        fromArgs: (o) => `${(o as Scope).label}=${(o as Scope).value}`,
    },
    {
        tag: 'pdx-tree-select', slot: 'node',
        props: { options: TREE, expandAll: true },
        open: (el) => click(el, '[role="combobox"]'),
        fromScope: (s) => `${(s.node as Scope).label}@${s.level}`,
        fromArgs: (node, level) => `${(node as Scope).label}@${level}`,
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

/** The alpha scoped slot: what compiled parent code hands a component for `<slot name="x" let:…>`. */
function scopedSlot(c: Case) {
    return (el: HTMLElement) => {
        const carrier = document.createElement('template') as HTMLTemplateElement & {
            __pdxSlot?: (scope: Scope) => Node;
            __pdxSlotName?: string;
        };
        carrier.__pdxSlotName = c.slot;
        carrier.__pdxSlot = (scope) => mark(c.fromScope(scope));
        el.appendChild(carrier);
    };
}

/** The snippet: the element's property, which is what a parent's `@snippet` compiles to setting. */
function snippet(c: Case) {
    return (el: HTMLElement) => {
        (el as unknown as Record<string, unknown>)[c.slot] = (...args: Args) => mark(c.fromArgs(...args));
    };
}

describe('menus and pickers: a snippet renders where the scoped slot did (#491)', () => {
    beforeEach(cleanup);

    for (const c of CASES) {
        describe(`${c.tag} — ${c.slot}`, () => {
            it('the alpha scoped slot still renders (control)', async () => {
                expect(await mount(c, scopedSlot(c))).not.toEqual([]);
            });

            it('a snippet renders the same entries, from its arguments', async () => {
                const fromSlot = await mount(c, scopedSlot(c));
                cleanup();
                expect(await mount(c, snippet(c))).toEqual(fromSlot);
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
