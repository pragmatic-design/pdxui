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
type Decl = { tagName?: string; models?: string[]; cssStates?: Named[]; cssParts?: Named[]; events?: Named[]; members?: Member[]; alphaEvents?: string[] };
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
});
