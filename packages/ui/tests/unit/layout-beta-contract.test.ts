// The layout components brought to the beta contract (#290): a prop the component writes itself is a
// model; a read-only output is announced by `<name>-change` `{ value }` without being one; the carousel
// takes the library's navigation verbs; each lists its states and parts in the manifest, which is what
// a theme and an agent's page card read (docs/language/beta/library.md, «Done, for one component»). A row
// joins `DONE` in the pull request that brings its component over.

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
    /** Read-only outputs, each announced by its `<name>-change` event. */
    outputs: string[];
    states: string[];
    parts: string[];
    /** Its alpha events and methods, now gone. */
    removed: string[];
}

const DONE: Row[] = [
    {
        tag: 'pdx-card',
        // `selected` is the app's to write: a click announces `pdx-click`, the card never selects itself.
        models: [],
        outputs: [],
        // From their props; `hoverable` and `clickable` also from `href`.
        states: ['horizontal', 'compact', 'hoverable', 'clickable', 'selected', 'disabled', 'loading'],
        // The card's own box and its link overlay; header, body and footer are the app's markup.
        parts: ['root', 'link'],
        removed: [],
    },
    {
        tag: 'pdx-accordion',
        // It has no prop for its open items and gains none: which are open is a read-only output.
        models: [],
        outputs: ['open'],
        states: ['loading', 'disabled'],
        // The app's markup, marked by the accordion as it wires it.
        parts: ['item', 'trigger', 'panel'],
        removed: ['pdx-change'],
    },
    {
        tag: 'pdx-affix',
        // Stuck or not is the scroll's doing: a read-only output, and a state for CSS to read.
        models: [],
        outputs: ['affixed'],
        states: ['affixed'],
        // It wraps the app's element and draws nothing of its own.
        parts: [],
        removed: ['pdx-change'],
    },
    {
        tag: 'pdx-carousel',
        // `goTo`, the arrows, the keys and a swipe write the slide shown; a parent's write moves it.
        models: ['index'],
        outputs: [],
        // From `animation="fade"`; the slide and the dot on show are their aria-current and aria-selected.
        states: ['fade'],
        // The region, its strip of slides, a slide, a control (an arrow or the rotation button), the
        // tablist of dots and a dot.
        parts: ['root', 'track', 'slide', 'control', 'dots', 'dot'],
        // `goto` was `goTo` in lowercase, and the `index` getter stood in for the model.
        removed: ['pdx-change', 'goto'],
    },
];

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);
    const events = (decl?.events ?? []).map((e) => e.name);

    it('declares its models, each announced by its <name>-change event', () => {
        expect(decl?.models ?? []).toEqual(row.models);
        for (const m of row.models) expect(events).toContain(`${m.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}-change`);
    });

    it('announces its read-only outputs with <name>-change, and declares no pdx-change', () => {
        for (const o of row.outputs) expect(events).toContain(`${o}-change`);
        expect(events).not.toContain('pdx-change');
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('declares none of its removed names, and records its alpha events for `pdx migrate`', () => {
        const members = (decl?.members ?? []).map((m) => m.name);
        expect([...events, ...members].filter((n) => row.removed.includes(n))).toEqual([]);
        expect(decl?.alphaEvents ?? []).toEqual(row.removed.filter((n) => n.startsWith('pdx-')));
    });
});
