// Typed snippets for the lists and navigation (#595, part 3b of #131; snippet only, #492).
//
// Each of these components drew the template a parent gave it through a light-DOM scoped slot
// (`<slot name="x" let:row>`, `ctx.__slots`). It declares the slot in its descriptor,
// `slot<(…) => Node>()`, so a parent's `@snippet` — which compiles to setting the element's property
// — reaches it, and since #492 it reads that snippet alone. For each one, the snippet draws the
// expected entries from its arguments. The alpha scoped slot is removed (#492).
// Two snippets are named apart from a prop: `pdx-pagination`'s is `item` (the prop is `page`),
// `pdx-nav-menu`'s controls are `itemActions` (the prop is `actions`).

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { cleanup, tick } from './helpers';
import '../../src/breadcrumb/pdx-breadcrumb';
import '../../src/description-list/pdx-description-list';
import '../../src/list/pdx-list';
import '../../src/nav-menu/pdx-nav-menu';
import '../../src/pagination/pdx-pagination';
import '../../src/sortable-list/pdx-sortable-list';
import '../../src/timeline/pdx-timeline';
import '../../src/tree/pdx-tree';

type Scope = Record<string, unknown>;
type Args = unknown[];

interface Case {
    tag: string;
    /** The slot's name: the snippet's, unless `snippet` says otherwise. */
    slot: string;
    /** The snippet's name, when it differs from the slot's. */
    snippet?: string;
    /** Props set before the element is connected. */
    props: Record<string, unknown>;
    /** The same text, drawn by the snippet from its arguments. */
    fromArgs(...args: Args): string;
    /** The entries the snippet draws. */
    expected: string[];
}

const label = (x: unknown) => (x as Scope).label as string;
const NAV = [{ key: 'a', label: 'A' }, { key: 'g', label: 'G', children: [{ key: 'c', label: 'C' }] }];

const CASES: Case[] = [
    {
        tag: 'pdx-breadcrumb', slot: 'item',
        props: { items: [{ key: 'home', label: 'Home', href: '/' }, { key: 'docs', label: 'Docs' }] },
        fromArgs: (item, index, isLast) => `${label(item)}#${index}${isLast ? '!' : ''}`,
        expected: ['Home#0', 'Docs#1!'],
    },
    {
        tag: 'pdx-description-list', slot: 'value',
        props: { items: [{ label: 'Name', value: 'Ada' }, { label: 'Role', value: 'Engineer' }] },
        fromArgs: (item, index) => `${label(item)}=${(item as Scope).value}#${index}`,
        expected: ['Name=Ada#0', 'Role=Engineer#1'],
    },
    {
        tag: 'pdx-list', slot: 'item',
        props: { items: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] },
        fromArgs: (item, index) => `${(item as Scope).name}#${index}`,
        expected: ['Ada#0', 'Bo#1'],
    },
    {
        tag: 'pdx-list', slot: 'empty',
        props: { items: [] },
        fromArgs: () => 'nothing here',
        expected: ['nothing here'],
    },
    {
        tag: 'pdx-nav-menu', slot: 'item',
        props: { items: NAV, activeKey: 'a' },
        fromArgs: (item, level, expanded, active) => `${label(item)}@${level}:${expanded}:${active}`,
        expected: ['A@0:false:true', 'G@0:false:false'],
    },
    {
        tag: 'pdx-nav-menu', slot: 'actions', snippet: 'itemActions',
        props: { items: NAV, activeKey: 'a' },
        fromArgs: (item, level, active) => `${label(item)}@${level}:${active}`,
        expected: ['A@0:true'],
    },
    {
        tag: 'pdx-pagination', slot: 'page', snippet: 'item',
        props: { total: 30, pageSize: 10, page: 2 },
        fromArgs: (page, active) => `${page}${active ? '*' : ''}`,
        expected: ['1', '2*', '3'],
    },
    {
        tag: 'pdx-sortable-list', slot: 'item',
        props: { items: [{ id: 1, label: 'One' }, { id: 2, label: 'Two' }] },
        fromArgs: (item, index) => `${label(item)}#${index}`,
        expected: ['One#0', 'Two#1'],
    },
    {
        tag: 'pdx-timeline', slot: 'content',
        props: { items: [{ title: 'Filed' }, { title: 'Shipped', status: 'success' }] },
        fromArgs: (item, index) => `${(item as Scope).title}#${index}:${(item as Scope).status ?? 'default'}`,
        expected: ['Filed#0:default', 'Shipped#1:success'],
    },
    {
        tag: 'pdx-tree', slot: 'node',
        props: { nodes: [{ id: 'f', label: 'Fruit', children: [{ id: 'a', label: 'Apple' }] }], defaultExpandAll: true },
        fromArgs: (node, level, expanded) => `${label(node)}@${level}:${expanded}`,
        expected: ['Fruit@1:true', 'Apple@2:false'],
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
    return [...document.querySelectorAll('.mine')].map((n) => n.textContent ?? '');
}

/** The snippet: the element's property, which is what a parent's `@snippet` compiles to setting. */
function snippet(c: Case) {
    return (el: HTMLElement) => {
        (el as unknown as Record<string, unknown>)[c.snippet ?? c.slot] = (...args: Args) => mark(c.fromArgs(...args));
    };
}

describe('lists and navigation: a snippet draws its entries (#595, #492)', () => {
    beforeEach(cleanup);

    for (const c of CASES) {
        describe(`${c.tag} — ${c.snippet ?? c.slot}`, () => {

            it('a snippet draws its entries, from its arguments', async () => {
                expect(await mount(c, snippet(c))).toEqual(c.expected);
            });
        });
    }

    it('a renamed slot keeps its prop: pdx-pagination still reads `page` as the current page', async () => {
        const el = document.createElement('pdx-pagination') as HTMLElement & Record<string, unknown>;
        Object.assign(el, { total: 30, pageSize: 10, page: 3 });
        el.item = (page: number, active: boolean) => mark(`${page}${active ? '*' : ''}`);
        document.body.appendChild(el);
        await tick(50);
        expect([...document.querySelectorAll('.mine')].map((n) => n.textContent)).toEqual(['1', '2', '3*']);
    });
});

describe("a parent's @snippet, compiled (#595)", () => {
    beforeEach(cleanup);

    it('reaches pdx-pagination by its snippet name: `@snippet item(p, active)` draws each page', async () => {
        const src = `<template>
  <pdx-pagination :total="30" :page-size="10" :page="2">
    @snippet item(p, active) { <b class="mine">{{ p }}{{ active ? '*' : '' }}</b> }
  </pdx-pagination>
</template>
`;
        const { code, warnings } = compile(src, 'snip-pages-page.pdx', [], undefined, {});
        expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        expect(body, 'the page imports something besides @pdxui/core').not.toMatch(/^import /m);
        new Function('__core', body)(core);

        const page = document.createElement('app-snip-pages-page');
        document.body.appendChild(page);
        await tick(50);
        expect([...document.querySelectorAll('.mine')].map((n) => n.textContent)).toEqual(['1', '2*', '3']);
    });
});
