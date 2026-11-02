// The data components brought to the beta contract (#292): a prop the component writes itself is a
// model; each lists its states and parts in the manifest, which is what a theme and an agent's page card
// read (docs/language/beta/library.md, «Done, for one component»); its alpha forms are gone. A row joins
// `DONE` in the pull request that brings its component over.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Member = { kind: string; name: string };
type Decl = { tagName?: string; models?: string[]; cssStates?: Named[]; cssParts?: Named[]; events?: Named[]; members?: Member[]; alphaEvents?: string[]; capabilities?: Named[]; variants?: { name: string; values: string[] }[] };
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

interface Row {
    tag: string;
    models: string[];
    states: string[];
    parts: string[];
    /** Its alpha props, events and methods, now gone. */
    removed: string[];
    /** Its alpha events, recorded so the compiler reports a listener on one and `pdx migrate` rewrites it. */
    alpha?: string[];
    /** What it offers to do, declared with `@capability`. */
    capabilities?: string[];
    /**
     * Its events, declared in the descriptor (#138): each name with its typed detail, or undefined for
     * an event with none. An event only emitted and not declared is in the manifest too, with an
     * untyped detail such as `{ key, action }`, so the detail is what tells the two apart.
     */
    declaredEvents?: Record<string, string | undefined>;
    /** Its variant axes and their values, reflected on the host. */
    variants?: Record<string, string[]>;
}

const DONE: Row[] = [
    // Its looks, loading and empty are states of the host; `renderItem` is the `item` slot (#292).
    { tag: 'pdx-list', models: [], states: ['bordered', 'dividers', 'loading', 'empty'], parts: ['list', 'item', 'empty', 'overlay'], removed: ['renderItem'] },
    // `axis` is a variant reflected on the host; disabled a state; no class on the host.
    { tag: 'pdx-sortable-list', models: [], states: ['disabled'], parts: ['list', 'item', 'handle', 'body'], removed: [] },
    // Its conditions are states; aria-busy only while loading, and each status speaks only when it has to (A4).
    { tag: 'pdx-infinite-scroll', models: [], states: ['loading', 'ended', 'disabled'], parts: ['sentinel', 'loading', 'end'], removed: [] },
    // Row listeners delegated to the tree; a lazy branch loading is a state and aria-busy (A4).
    { tag: 'pdx-tree', models: [], states: ['loading', 'disabled'], parts: ['root', 'item', 'group', 'twisty', 'check', 'label'], removed: [] },
    // It writes its own `value`, so it is a model, and `logic` with it; `pdx-filter-change` is gone.
    { tag: 'pdx-filter-builder', models: ['value', 'logic'], states: [], parts: ['root', 'chip', 'label', 'remove', 'add', 'clear'], removed: ['pdx-filter-change'], alpha: ['pdx-filter-change'] },
    // A figure whose role, name, focus and keys are declared on the host; the legend and the canvas are parts.
    { tag: 'pdx-chart', models: [], states: [], parts: ['legend', 'legend-item', 'swatch', 'canvas'], removed: [] },
    // An image named by its data, declared on the host; its canvas is a part.
    { tag: 'pdx-sparkline', models: [], states: [], parts: ['canvas'], removed: [] },
    // Its looks and its conditions are states of the host; its row events are delegated to its body.
    {
        tag: 'pdx-data-grid', models: [],
        states: ['striped', 'hover', 'row-clickable', 'compact', 'sticky-header', 'fill-height', 'loading', 'empty', 'editing'],
        parts: ['toolbar', 'group-bar', 'grid', 'header', 'column-header', 'filter-row', 'body', 'row', 'cell', 'summary', 'footer', 'empty', 'loading'],
        removed: [],
        // What an agent's page card says it can do (library.md, «Accessibility»).
        capabilities: ['sortable', 'filterable', 'selectable', 'editable'],
    },
    // Batch 4, the composites: their events declared, their pieces parts, no class on the host.
    {
        tag: 'pdx-bulk-actions', models: [], states: [], parts: ['root', 'count', 'action', 'clear'], removed: [],
        declaredEvents: { 'pdx-action': '{ key: string; action: BulkAction }', 'pdx-clear': undefined },
    },
    {
        tag: 'pdx-edit-drawer', models: [], states: ['busy'], parts: ['header', 'body', 'actions', 'cancel', 'save'], removed: [],
        declaredEvents: { 'pdx-save': "{ values: Record<string, unknown>; mode: 'edit' | 'create' }", 'pdx-cancel': undefined },
    },
    {
        tag: 'pdx-entity-grid', models: [], states: [], parts: ['toolbar', 'title', 'add'], removed: [],
        declaredEvents: {
            'pdx-create': '{ values: Record<string, unknown>; clientId: unknown }',
            'pdx-update': '{ id: unknown; values: Record<string, unknown> }',
            'pdx-delete': '{ ids: unknown[]; rows?: Record<string, unknown>[] }',
            'pdx-bulk': '{ key: string; ids: unknown[] }',
        },
    },
    {
        tag: 'pdx-relation-picker', models: [], states: [], parts: ['grid', 'foot', 'count', 'create', 'add'], removed: [],
        declaredEvents: { 'pdx-pick': '{ items: Record<string, unknown>[] }', 'pdx-create': undefined },
    },
    { tag: 'pdx-data-source', models: [], states: [], parts: [], removed: [] },
    // Its mode, connector and dot alignment are variant axes; pending and clickable are states.
    {
        tag: 'pdx-timeline', models: [], states: ['pending', 'clickable'],
        parts: ['list', 'item', 'track', 'line', 'dot', 'content', 'title', 'description', 'date', 'pending'], removed: [],
        variants: { mode: ['left', 'right', 'alternate', 'horizontal'], connectorStyle: ['solid', 'dashed', 'dotted'], dotAlign: ['start', 'center', 'end'] },
        declaredEvents: { 'pdx-click': '{ item: TimelineItem; index: number }' },
    },
];

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);
    const events = (decl?.events ?? []).map((e) => e.name);

    it('declares its models, each announced by its <name>-change event', () => {
        expect(decl?.models ?? []).toEqual(row.models);
        for (const m of row.models) expect(events).toContain(`${m.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-change`);
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('declares none of its removed names', () => {
        const members = (decl?.members ?? []).map((m) => m.name);
        expect([...events, ...members].filter((n) => row.removed.includes(n))).toEqual([]);
    });

    it('records its alpha events', () => {
        expect(decl?.alphaEvents ?? []).toEqual(row.alpha ?? []);
    });

    it.runIf(row.declaredEvents)('declares its events, each with its typed detail', () => {
        const byName = Object.fromEntries((decl?.events ?? []).map((e) => [e.name, (e as Named & { detail?: string }).detail]));
        expect(byName).toEqual(row.declaredEvents);
    });

    it.runIf(row.variants)('declares its variant axes, each with its values', () => {
        const axes = Object.fromEntries((decl?.variants ?? []).map((v) => [v.name, v.values]));
        expect(axes).toEqual(row.variants);
    });

    it('declares its capabilities', () => {
        expect((decl?.capabilities ?? []).map((c) => c.name)).toEqual(row.capabilities ?? []);
    });
});
