// The navigation components brought to the beta contract (#289): a position the component changes
// itself (a tab, a page, a step) is a model, announced with `<name>-change` `{ value }` in place of
// `pdx-change`; they share one set of verbs, `next()`, `prev()` and `goTo(n)`; and each lists its
// states and parts in the manifest, which is what a theme and an agent's page card read
// (docs/language/beta/library.md, «Done, for one component»). A row joins `DONE` in the pull request
// that brings its component over.

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
    /** The navigation verbs it has. */
    verbs: string[];
    /** Its alpha events and methods, now gone. */
    removed: string[];
}

const DONE: Row[] = [
    {
        tag: 'pdx-tabs',
        models: ['value'],
        // `loading` busies the panel (A4); `overflow` while the strip is scrolled in one row.
        states: ['loading', 'bordered', 'overflow'],
        parts: ['list', 'tab', 'panel', 'indicator'],
        verbs: ['next', 'prev'],
        removed: ['pdx-change'],
    },
    {
        tag: 'pdx-pagination',
        models: ['page', 'pageSize'],
        // The current page is marked on its button (`aria-current`), not on the host.
        states: [],
        parts: ['nav', 'page', 'first', 'prev', 'next', 'last', 'ellipsis', 'range', 'position', 'size'],
        verbs: ['next', 'prev', 'goTo', 'first', 'last'],
        // `currentPage` stood in for `page`, which the model now is.
        removed: ['pdx-change', 'goto', 'currentPage'],
    },
];

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);
    const events = (decl?.events ?? []).map((e) => e.name);
    const methods = (decl?.members ?? []).filter((m) => m.kind === 'method').map((m) => m.name);

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

    it('has the navigation verbs', () => {
        expect(methods.filter((m) => ['next', 'prev', 'goTo', 'first', 'last'].includes(m)).sort()).toEqual([...row.verbs].sort());
    });

    it('declares none of its removed names, and records its alpha events for `pdx migrate`', () => {
        const members = (decl?.members ?? []).map((m) => m.name);
        expect([...events, ...members].filter((n) => row.removed.includes(n))).toEqual([]);
        const alphaEvents = row.removed.filter((n) => n.startsWith('pdx-'));
        expect(decl?.alphaEvents ?? []).toEqual(alphaEvents);
    });
});
