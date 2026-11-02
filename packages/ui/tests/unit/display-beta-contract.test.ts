// The display, feedback and action components brought to the beta contract (#291): a prop the component
// writes itself is a model; a read-only output is announced by `<name>-change` `{ value }` without being
// one; each lists its states and parts in the manifest, which is what a theme and an agent's page card
// read (docs/language/beta/library.md, «Done, for one component»). A row joins `DONE` in the pull request
// that brings its component over.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
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
    // A count or a dot: its variants are #631's; its status says something only while it is shown.
    { tag: 'pdx-badge', models: [], outputs: [], states: [], parts: ['root'], removed: [] },
    // A shortcut: its size is #632's, drawn on the combo.
    { tag: 'pdx-kbd', models: [], outputs: [], states: [], parts: ['root'] , removed: [] },
    {
        tag: 'pdx-progress',
        models: [],
        outputs: [],
        // Indeterminate is its root part's own class, which native markup uses too.
        states: [],
        // The track (root), the bar or the ring, and the label.
        parts: ['root', 'bar', 'ring', 'label'],
        removed: [],
    },
    {
        tag: 'pdx-empty-state',
        models: [],
        outputs: [],
        states: [],
        parts: ['icon', 'title', 'description', 'action'],
        removed: [],
    },
    {
        tag: 'pdx-statistic',
        models: [],
        outputs: [],
        // While its source loads: skeletons in place of the value, the host aria-busy (A4).
        states: ['loading'],
        parts: ['icon', 'title', 'value', 'trend', 'description', 'compare'],
        removed: [],
    },
    // Its inner <dl> is the root part and keeps the native classes; the host carries none.
    { tag: 'pdx-description-list', models: [], outputs: [], states: [], parts: ['root'], removed: [] },
    // Its row's direction and borders are the row part's own classes, set from props.
    { tag: 'pdx-avatar-group', models: [], outputs: [], states: [], parts: ['root', 'avatar', 'overflow'], removed: [] },
    {
        tag: 'pdx-image',
        models: [],
        outputs: [],
        // Its source not arrived yet, zoomed in, and failed.
        states: ['loading', 'zoomed', 'broken'],
        parts: ['frame', 'image', 'placeholder', 'fallback', 'caption'],
        removed: [],
    },
    {
        tag: 'pdx-block-ui',
        models: [],
        outputs: [],
        // The input blocked at once; the overlay drawn after its delay (A4: aria-busy while blocked).
        states: ['blocked', 'shown'],
        parts: ['overlay', 'spinner', 'message'],
        removed: [],
    },
    // Its size and shape are variants drawn by avatar.css; a picture that fails is a state.
    { tag: 'pdx-avatar', models: [], outputs: [], states: ['broken'], parts: ['root', 'image', 'fallback'], removed: [] },
    // Its size is a variant drawn by spinner.css; its status is the root part (A4).
    { tag: 'pdx-spinner', models: [], outputs: [], states: [], parts: ['root', 'indicator', 'label'], removed: [] },
    // Closed is a state, which takes its alert or status out of the tree (A4); show and dismiss are exposed.
    { tag: 'pdx-banner', models: [], outputs: [], states: ['dismissed'], parts: ['root', 'icon', 'message', 'close'], removed: [] },
    // Its updates are an effect, parked with a frozen page (#269).
    { tag: 'pdx-relative-time', models: [], outputs: [], states: [], parts: ['root'], removed: [] },
    // A click writes `selected`, a model: `selected-change` replaces `pdx-toggle` (#291).
    { tag: 'pdx-chip', models: ['selected'], outputs: [], states: ['selected', 'disabled'], parts: ['root', 'body', 'remove'], removed: ['pdx-toggle'] },
    // icon.css draws its box; spinning and a right-to-left mirror are states, not inline styles.
    { tag: 'pdx-icon', models: [], outputs: [], states: ['spin', 'mirror'], parts: ['root'], removed: [] },
    // No toggle mode: the on/off button is pdx-toggle, and `pdx migrate` rewrites to it (button-toggle-removed,
    // which also moves an `@pdx-toggle` handler: no alpha event is recorded for the generic rewrite).
    { tag: 'pdx-button', models: [], outputs: [], states: ['loading'], parts: ['root', 'label'], removed: ['toggle', 'pressed'] },
    // A visual group of action buttons (decision 51): no value, no model, no event; its modes went in #286.
    { tag: 'pdx-button-group', models: [], outputs: [], states: [], parts: [], removed: ['mode', 'value'] },
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

describe('the family, across its components (#291)', () => {
    const decl = (tag: string) => decls.find((d) => d.tagName === tag);
    const names = (tag: string) => [...(decl(tag)?.events ?? []).map((e) => e.name), ...(decl(tag)?.members ?? []).map((m) => m.name)];

    it('pdx-button declares neither toggle, pressed nor pdx-toggle; the chip not pdx-toggle', () => {
        expect(names('pdx-button').filter((n) => ['toggle', 'pressed', 'pdx-toggle'].includes(n))).toEqual([]);
        expect(names('pdx-chip')).not.toContain('pdx-toggle');
    });

    it('pdx-button-group declares no mode, no value, no model and no event', () => {
        const group = decl('pdx-button-group');
        expect(names('pdx-button-group').filter((n) => n === 'mode' || n === 'value')).toEqual([]);
        expect(group?.models ?? []).toEqual([]);
        expect(group?.events ?? []).toEqual([]);
    });

    it('no rule under packages/design/src selects .pdx-pressed', () => {
        const css = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? css(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []);
        const selecting = css(join(root, '..', 'design', 'src')).filter((f) => /\.pdx-pressed\b/.test(readFileSync(f, 'utf8')));
        expect(selecting).toEqual([]);
    });
});
