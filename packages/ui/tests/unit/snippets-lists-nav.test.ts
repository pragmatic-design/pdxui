// Typed snippets for the lists and navigation (#595, part 3b of #131).
//
// Each of these components drew the template a parent gave it through a light-DOM scoped slot only
// (`<slot name="x" let:row>`, `ctx.__slots`). It now declares the slot in its descriptor,
// `slot<(…) => Node>()`, so a parent's `@snippet` — which compiles to setting the element's property
// — reaches it. For each one, the same text is drawn once by a snippet from its arguments and once by
// the alpha scoped slot from its scope: the two must render the same entries, and the scoped slot
// must keep working until #131's removal part. Two slots share their name with a prop, and are
// renamed on the snippet side only: `pdx-pagination`'s `page` is `item`, `pdx-nav-menu`'s `actions`
// is `itemActions`.

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
    /** The alpha scoped slot's name. */
    slot: string;
    /** The snippet's name, when it differs from the slot's. */
    snippet?: string;
    /** Props set before the element is connected. */
    props: Record<string, unknown>;
    /** The text the alpha scoped slot draws from its scope. */
    fromScope(scope: Scope): string;
    /** The same text, drawn by the snippet from its arguments. */
    fromArgs(...args: Args): string;
}

const label = (x: unknown) => (x as Scope).label as string;
const NAV = [{ key: 'a', label: 'A' }, { key: 'g', label: 'G', children: [{ key: 'c', label: 'C' }] }];

const CASES: Case[] = [
    {
        tag: 'pdx-breadcrumb', slot: 'item',
        props: { items: [{ key: 'home', label: 'Home', href: '/' }, { key: 'docs', label: 'Docs' }] },
        fromScope: (s) => `${label(s.item)}#${s.index}${s.isLast ? '!' : ''}`,
        fromArgs: (item, index, isLast) => `${label(item)}#${index}${isLast ? '!' : ''}`,
    },
    {
        tag: 'pdx-description-list', slot: 'value',
        props: { items: [{ label: 'Name', value: 'Ada' }, { label: 'Role', value: 'Engineer' }] },
        fromScope: (s) => `${s.label}=${s.value}#${s.index}`,
        fromArgs: (item, index) => `${label(item)}=${(item as Scope).value}#${index}`,
    },
    {
        tag: 'pdx-list', slot: 'item',
        props: { items: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] },
        fromScope: (s) => `${(s.item as Scope).name}#${s.index}`,
        fromArgs: (item, index) => `${(item as Scope).name}#${index}`,
    },
    {
        tag: 'pdx-list', slot: 'empty',
        props: { items: [] },
        fromScope: () => 'nothing here',
        fromArgs: () => 'nothing here',
    },
    {
        tag: 'pdx-nav-menu', slot: 'item',
        props: { items: NAV, activeKey: 'a' },
        fromScope: (s) => `${label(s.item)}@${s.level}:${s.expanded}:${s.active}`,
        fromArgs: (item, level, expanded, active) => `${label(item)}@${level}:${expanded}:${active}`,
    },
    {
        tag: 'pdx-nav-menu', slot: 'actions', snippet: 'itemActions',
        props: { items: NAV, activeKey: 'a' },
        fromScope: (s) => `${label(s.item)}@${s.level}:${s.active}`,
        fromArgs: (item, level, active) => `${label(item)}@${level}:${active}`,
    },
    {
        tag: 'pdx-pagination', slot: 'page', snippet: 'item',
        props: { total: 30, pageSize: 10, page: 2 },
        fromScope: (s) => `${s.page}${s.isActive ? '*' : ''}`,
        fromArgs: (page, active) => `${page}${active ? '*' : ''}`,
    },
    {
        tag: 'pdx-sortable-list', slot: 'item',
        props: { items: [{ id: 1, label: 'One' }, { id: 2, label: 'Two' }] },
        fromScope: (s) => `${label(s.item)}#${s.index}`,
        fromArgs: (item, index) => `${label(item)}#${index}`,
    },
    {
        tag: 'pdx-timeline', slot: 'content',
        props: { items: [{ title: 'Filed' }, { title: 'Shipped', status: 'success' }] },
        fromScope: (s) => `${(s.item as Scope).title}#${s.index}:${s.status}`,
        fromArgs: (item, index) => `${(item as Scope).title}#${index}:${(item as Scope).status ?? 'default'}`,
    },
    {
        tag: 'pdx-tree', slot: 'node',
        props: { nodes: [{ id: 'f', label: 'Fruit', children: [{ id: 'a', label: 'Apple' }] }], defaultExpandAll: true },
        fromScope: (s) => `${label(s.node)}@${s.level}:${s.expanded}`,
        fromArgs: (node, level, expanded) => `${label(node)}@${level}:${expanded}`,
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
        (el as unknown as Record<string, unknown>)[c.snippet ?? c.slot] = (...args: Args) => mark(c.fromArgs(...args));
    };
}

describe('lists and navigation: a snippet renders where the scoped slot did (#595)', () => {
    beforeEach(cleanup);

    for (const c of CASES) {
        describe(`${c.tag} — ${c.snippet ?? c.slot}`, () => {
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
