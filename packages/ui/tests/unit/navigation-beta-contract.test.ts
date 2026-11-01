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
    {
        tag: 'pdx-wizard',
        models: ['value'],
        // `ready` once its steps are found and its stepper drawn; the current step is marked on its
        // button (`aria-current="step"`), not on the host.
        states: ['ready', 'disabled', 'vertical'],
        parts: ['root', 'step', 'connector', 'panel', 'nav', 'back', 'next', 'indicator'],
        verbs: ['next', 'prev', 'goTo'],
        // `step` stood in for `value`, which the model now is; the rest were aliases.
        removed: ['pdx-change', 'goNext', 'goPrev', 'goto', 'step'],
    },
    {
        tag: 'pdx-breadcrumb',
        // Holds no position of its own: the page you are on is the last crumb, `aria-current="page"`.
        models: [],
        states: [],
        parts: ['nav', 'list', 'item', 'link', 'current', 'separator', 'ellipsis'],
        verbs: [],
        removed: [],
    },
    {
        tag: 'pdx-page-header',
        // A header: no position, no state of its own.
        models: [],
        states: [],
        parts: ['root', 'breadcrumb', 'title', 'subtitle', 'actions'],
        verbs: [],
        removed: [],
    },
    {
        tag: 'pdx-nav-menu',
        // `activeKey` and `collapsed` are written by the app, never by the menu: props, not models.
        models: [],
        // `ready` once its entries are drawn; the current entry is `aria-current="page"`, an open
        // group `aria-expanded="true"`, each on its entry.
        states: ['ready', 'collapsed'],
        parts: ['nav', 'item', 'group', 'heading', 'separator', 'actions', 'flyout'],
        verbs: [],
        removed: [],
    },
    {
        tag: 'pdx-navbar',
        // Nothing the app reads back: the mobile menu it opens and closes is a state, not a prop.
        models: [],
        // `sticky` and `compact` follow their props, `collapsed` its own width, `menu-open` its toggle;
        // the current link is `aria-current="page"`, on the link.
        states: ['sticky', 'compact', 'collapsed', 'menu-open'],
        parts: ['bar', 'brand', 'toggle', 'nav', 'item', 'actions', 'drawer'],
        verbs: [],
        removed: [],
    },
    {
        tag: 'pdx-bottom-nav',
        // `activeKey` is the app's to write: a click announces `pdx-select`, the app moves the key.
        models: [],
        // `ready` once its bar is drawn, and pinned to the bottom from then on; the current item is
        // `aria-current="page"`, on the item.
        states: ['ready'],
        parts: ['bar', 'item', 'icon', 'badge', 'label'],
        verbs: [],
        removed: [],
    },
    {
        tag: 'pdx-toolbar',
        // Holds no position: its controls are the app's, and the roving tab stop is focus, not a value.
        models: [],
        // From their props; a toolbar is a toolbar from its tag, with no state for it.
        states: ['compact', 'bordered', 'vertical'],
        // It draws nothing of its own: every control, separator and group is the app's markup.
        parts: [],
        verbs: [],
        removed: [],
    },
    {
        tag: 'pdx-scroll-spy',
        // The section in view is a read-only output, announced by `section-change` `{ value }`: not a
        // model, so `::section` stays an error.
        models: [],
        states: [],
        // It wraps the app's links and sections and draws nothing of its own.
        parts: [],
        verbs: [],
        removed: ['pdx-change'],
    },
    {
        tag: 'pdx-sidebar',
        // `open` is the app's to write: the sidebar has no toggle of its own, so it never writes it.
        models: [],
        // `collapsed` while closed; `mini` while closed as an icon rail.
        states: ['collapsed', 'mini'],
        // It wraps the app's content and draws nothing of its own.
        parts: [],
        verbs: [],
        removed: [],
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
