// The picker components brought to the beta contract (#287): each declares its model, its visual
// states and its public parts, and the manifest lists them, which is what a theme and an agent's page
// card read (docs/language/beta/library.md, «Done, for one component»). A picker with a popup announces
// it as an overlay does: an `open` state and `open-change` `{ value }`, in place of `pdx-open` and
// `pdx-close`, and drives it with the overlay verbs. A row joins `DONE` in the pull request that brings
// its component over; the rest of the family follows the same table.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanup, mount } from './helpers';
import '../../src/select/pdx-select';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/cascader/pdx-cascader';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Member = { kind: string; name: string };
type Decl = {
    tagName?: string; models?: string[]; formAssociated?: boolean;
    cssStates?: Named[]; cssParts?: Named[]; events?: Named[]; members?: Member[];
};
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

interface Row {
    tag: string;
    model: string;
    states: string[];
    parts: string[];
    /** It renders a popup: `open` is among its states and `open-change` among its events. */
    popup: boolean;
    /** The methods the issue lists for it, all declared. */
    methods: string[];
    /** Names it set on the element before, now gone: alias methods the overlay verbs replace. */
    removedMethods: string[];
}

const DONE: Row[] = [
    {
        tag: 'pdx-select',
        model: 'value',
        states: ['open', 'invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'multiple'],
        parts: ['root', 'search', 'tag', 'clear', 'spinner', 'popup', 'list', 'option'],
        popup: true,
        methods: ['focus', 'blur', 'clear', 'show', 'close', 'toggle'],
        removedMethods: ['openSelect', 'closeSelect', 'toggleSelect'],
    },
    {
        tag: 'pdx-autocomplete',
        model: 'value',
        states: ['open', 'invalid', 'success', 'warning', 'disabled', 'readonly', 'loading'],
        parts: ['root', 'input', 'clear', 'spinner', 'popup', 'list', 'option'],
        popup: true,
        methods: ['clear', 'getText', 'getSelectedItem', 'show', 'close', 'toggle'],
        // `open()` is the overlay verb `show()` (#287, decision 50).
        removedMethods: ['open'],
    },
    {
        tag: 'pdx-cascader',
        model: 'value',
        // `loading` while a lazy branch is fetched; it has no error, success or readonly of its own.
        states: ['open', 'disabled', 'loading'],
        parts: ['root', 'clear', 'popup', 'search', 'list', 'option', 'spinner'],
        popup: true,
        methods: ['getLabels', 'clear', 'show', 'close', 'toggle'],
        // getValue/setValue duplicated the model, which is the way (#287); openCascader/closeCascader
        // were set on the element undeclared, and are the overlay verbs.
        removedMethods: ['getValue', 'setValue', 'openCascader', 'closeCascader'],
    },
];

/** The events the beta took from a picker: the popup's alpha pair, and the alpha change events (#125). */
const REMOVED_EVENTS = ['pdx-open', 'pdx-close', 'pdx-change', 'change', 'valuechange', 'pdx-input'];

beforeEach(cleanup);

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);
    const events = (decl?.events ?? []).map((e) => e.name);

    it('declares its model', () => {
        expect(decl?.models).toEqual([row.model]);
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('is form-associated, through its model', () => {
        expect(decl?.formAssociated).toBe(true);
    });

    it('announces its popup with open-change and an open state, or has neither', () => {
        expect(events.includes('open-change')).toBe(row.popup);
        expect((decl?.cssStates ?? []).some((s) => s.name === 'open')).toBe(row.popup);
    });

    it('declares no removed event', () => {
        expect(events.filter((n) => REMOVED_EVENTS.includes(n))).toEqual([]);
    });

    it('declares its methods', () => {
        const methods = (decl?.members ?? []).filter((m) => m.kind === 'method').map((m) => m.name);
        expect(methods.filter((m) => row.methods.includes(m)).sort()).toEqual([...row.methods].sort());
    });

    it('sets none of its removed methods on the element', async () => {
        const el = await mount(row.tag) as unknown as Record<string, unknown>;
        expect(row.removedMethods.filter((m) => m in el)).toEqual([]);
    });
});
