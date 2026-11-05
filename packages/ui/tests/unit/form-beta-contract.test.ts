// The form-structure components brought to the beta contract (#293): a prop the component writes itself
// is a model; each lists its states, parts and variant axes in the manifest, which is what a theme and an
// agent's page card read (docs/language/library.md, «Done, for one component»); no component of the
// family declares an event named `toggle`, the name of a native event. A row joins `DONE` in the pull
// request that brings its component over.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Decl = {
    tagName?: string; models?: string[]; cssStates?: Named[]; cssParts?: Named[]; events?: Named[];
    variants?: { name: string; values: string[] }[];
};
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

interface Row {
    tag: string;
    models: string[];
    states: string[];
    parts: string[];
    /** Its variant axes and their values, reflected on the host. */
    variants?: Record<string, string[]>;
    /** The events it declares, when the row says: a model's `<name>-change` included. */
    events?: string[];
}

const DONE: Row[] = [
    // Required, optional and disabled are states of the host; the inner <label> keeps only its base class.
    { tag: 'pdx-label', models: [], states: ['required', 'optional', 'disabled'], parts: ['root', 'description', 'hint'], variants: { size: ['md', 'xs', 'sm', 'lg', 'xl'] } },
    // The bar's alignment is a variant axis; a submitting form is a state.
    { tag: 'pdx-form-actions', models: [], states: ['submitting'], parts: ['root', 'reset', 'submit'], variants: { align: ['end', 'start', 'center', 'between'] } },
    // No class on the host; disabled is a state.
    { tag: 'pdx-input-group', models: [], states: ['disabled'], parts: [] },
    // Active and invalid are states of the host: an inactive section is hidden by the design CSS.
    { tag: 'pdx-form-section', models: [], states: ['active', 'invalid'], parts: ['root', 'legend', 'content'] },
    // Its conditions are states of the host — the message it shows (invalid, warning, success) one at a
    // time — and the wrapper and its label keep only their base classes.
    {
        tag: 'pdx-form-field', models: [],
        states: ['required', 'optional', 'disabled', 'invalid', 'warning', 'success', 'horizontal'],
        parts: ['root', 'label', 'description', 'control', 'error', 'warning', 'success', 'hint'],
        variants: { size: ['md', 'xs', 'sm', 'lg', 'xl'] },
    },
    // A panel's `collapsed` is written by the user's click: a model. Its display mode renders its own
    // markup, with a fixed class, and is no variant axis.
    {
        tag: 'pdx-field-group', models: ['collapsed'], states: ['collapsed'],
        parts: ['root', 'legend', 'toggle', 'content', 'trigger'],
    },
    // Its rows are built by script; their pieces are parts. Each cell is a pdx-form-field, which says its
    // own state.
    {
        tag: 'pdx-field-list', models: [], states: ['empty'],
        parts: ['root', 'header', 'label', 'add', 'columns', 'rows', 'row', 'cell', 'actions', 'empty', 'footer', 'dialog'],
    },
    // `collapsed` is written by the toggle: a model, whose `collapsed-change` replaces the `toggle` event.
    {
        tag: 'pdx-fieldset', models: ['collapsed'], states: ['invalid', 'collapsed', 'collapsible', 'disabled'],
        parts: ['root', 'legend', 'toggle', 'description', 'content', 'error'],
        variants: { variant: ['bordered', 'filled', 'plain'], size: ['md', 'sm', 'lg'] },
        events: ['collapsed-change'],
    },
    // What its form is: dirty, valid, refused at its last submit (invalid), submitting.
    {
        tag: 'pdx-form', models: [], states: ['dirty', 'valid', 'invalid', 'submitting'], parts: ['root'],
        events: ['pdx-submit', 'pdx-submit-error'],
    },
    {
        tag: 'pdx-auto-form', models: [], states: [], parts: ['root', 'actions', 'reset', 'submit'],
        events: ['pdx-submit'],
    },
    // Its wizard layout is a pdx-wizard (A6), not a stepper of its own.
    {
        tag: 'pdx-form-template', models: [], states: [], parts: ['form', 'content', 'fields', 'section', 'wizard'],
        events: ['pdx-submit', 'pdx-submit-error'],
    },
];

describe('pdx-form-template', () => {
    const source = readFileSync(join(root, 'src', 'form-template', 'pdx-form-template.ts'), 'utf8');

    it('builds no stepper of its own: its wizard layout is pdx-wizard', () => {
        expect(source).not.toMatch(/['"]tablist['"]/);
        expect(source).not.toMatch(/['"]tab['"]/);
        expect(source).toMatch(/createElement\(['"]pdx-wizard['"]\)/);
    });

    it('navigates with the library\'s verbs, next, prev and goTo, and exposes them', () => {
        const methods = ((decls.find((d) => d.tagName === 'pdx-form-template') as { members?: { kind: string; name: string }[] })?.members ?? [])
            .filter((m) => m.kind === 'method').map((m) => m.name).sort();
        expect(methods).toEqual(['getForm', 'goTo', 'next', 'prev']);
    });
});

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);

    it('declares its models', () => {
        expect(decl?.models ?? []).toEqual(row.models);
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('declares its variant axes', () => {
        expect(Object.fromEntries((decl?.variants ?? []).map((v) => [v.name, v.values]))).toEqual(row.variants ?? {});
    });

    it.runIf(row.events)('declares its events, each with a typed detail', () => {
        const events = (decl?.events ?? []) as (Named & { detail?: string })[];
        expect(events.map((e) => e.name).sort()).toEqual([...(row.events ?? [])].sort());
        for (const e of events) expect(e.detail, `${e.name} has no declared detail type`).toBeTruthy();
    });
});

describe('the form family', () => {
    const FAMILY = ['pdx-form-field', 'pdx-label', 'pdx-form', 'pdx-fieldset', 'pdx-form-section', 'pdx-field-group',
        'pdx-field-list', 'pdx-form-actions', 'pdx-auto-form', 'pdx-form-template', 'pdx-input-group'];

    it.each(DONE.map((r) => r.tag))('%s declares no event named toggle, the name of a native event', (tag) => {
        expect(FAMILY).toContain(tag);
        const events = (decls.find((d) => d.tagName === tag)?.events ?? []).map((e) => e.name);
        expect(events).not.toContain('toggle');
    });
});
