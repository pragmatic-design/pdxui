// The value-input components brought to the beta contract (#286): each declares its model, its visual
// states and its public parts, and the manifest lists them, which is what a theme and an agent's page
// card read (docs/language/beta/library.md, «Done, for one component»). A row joins `DONE` in the
// pull request that brings its component over; the rest of the family follows the same table.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Decl = { tagName?: string; models?: string[]; formAssociated?: boolean; cssStates?: Named[]; cssParts?: Named[]; events?: Named[] };
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

/** `model`: its one model, or all of them in declaration order (pdx-checkbox has two). */
interface Row { tag: string; model: string | string[]; states: string[]; parts: string[] }

const DONE: Row[] = [
    {
        tag: 'pdx-input',
        model: 'value',
        states: ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'over-limit'],
        parts: ['root', 'input', 'prefix', 'suffix', 'clear', 'spinner', 'count'],
    },
    {
        tag: 'pdx-textarea',
        model: 'value',
        states: ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'over-limit'],
        parts: ['root', 'input', 'footer', 'count', 'word-count'],
    },
    {
        tag: 'pdx-password-input',
        model: 'value',
        states: ['invalid', 'disabled', 'loading'],
        parts: ['root', 'input', 'toggle', 'strength'],
    },
    {
        tag: 'pdx-search-input',
        model: 'value',
        states: ['disabled', 'loading'],
        parts: ['root', 'input', 'prefix', 'spinner', 'clear', 'shortcut'],
    },
    {
        tag: 'pdx-number-input',
        model: 'value',
        states: ['invalid', 'disabled', 'loading', 'negative', 'positive'],
        parts: ['root', 'field', 'input', 'decrement', 'increment', 'sign'],
    },
    {
        tag: 'pdx-otp-input',
        model: 'value',
        states: ['invalid', 'disabled'],
        parts: ['root', 'cell', 'separator'],
    },
    {
        tag: 'pdx-masked-input',
        model: 'value',
        states: ['invalid', 'disabled'],
        parts: ['root', 'input'],
    },
    {
        tag: 'pdx-tag-input',
        model: 'value',
        states: ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading'],
        parts: ['root', 'input', 'tag', 'remove'],
    },
    {
        tag: 'pdx-mention',
        model: 'value',
        states: ['disabled', 'readonly'],
        parts: ['root', 'input', 'list', 'option'],
    },
    {
        tag: 'pdx-inline-edit',
        model: 'value',
        states: ['disabled', 'readonly', 'editing'],
        // `edit`: the pencil button of `edit-on="icon"` (#710).
        parts: ['root', 'display', 'edit', 'editor', 'save', 'cancel'],
    },
    {
        tag: 'pdx-rich-text',
        model: 'value',
        states: ['readonly'],
        parts: ['toolbar', 'field', 'input'],
    },
    {
        tag: 'pdx-json-editor',
        model: 'value',
        // No visual state: it has no disabled, readonly or error of its own.
        states: [],
        parts: ['entry', 'branch', 'dialog'],
    },
    {
        tag: 'pdx-checkbox',
        model: ['checked', 'indeterminate'],
        states: ['checked', 'indeterminate', 'invalid', 'disabled'],
        parts: ['root', 'label', 'description'],
    },
    {
        tag: 'pdx-radio',
        model: 'checked',
        states: ['checked', 'invalid', 'disabled'],
        parts: ['root', 'label', 'description'],
    },
    {
        tag: 'pdx-radio-group',
        model: 'value',
        // No inner element of its own: it holds the author's radios.
        states: ['invalid', 'disabled'],
        parts: [],
    },
    {
        tag: 'pdx-checkbox-group',
        model: 'value',
        states: ['invalid', 'disabled'],
        parts: [],
    },
    {
        tag: 'pdx-toggle',
        model: 'pressed',
        states: ['pressed', 'disabled'],
        parts: ['root'],
    },
    {
        tag: 'pdx-rating',
        model: 'value',
        states: ['disabled', 'readonly', 'focused'],
        parts: ['root', 'star'],
    },
    {
        tag: 'pdx-slider',
        model: 'value',
        states: ['disabled', 'invalid', 'dragging'],
        parts: ['root', 'track', 'fill', 'thumb', 'mark'],
    },
    {
        tag: 'pdx-segmented',
        model: 'value',
        states: ['disabled'],
        parts: ['root', 'item'],
    },
    {
        tag: 'pdx-toggle-group',
        model: 'value',
        // No inner element of its own: it holds the author's toggles.
        states: ['disabled'],
        parts: [],
    },
    {
        tag: 'pdx-switch',
        model: 'checked',
        states: ['checked', 'invalid', 'disabled', 'loading'],
        parts: ['root', 'label', 'description'],
    },
];

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);

    it('declares its model', () => {
        expect(decl?.models).toEqual([row.model].flat());
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    // Every row of the table takes part in a form through its model's `{ form }` (#135) — the three the
    // issue marked «no», pdx-toggle-group, pdx-rich-text and pdx-json-editor, among them.
    it('is form-associated, through its model', () => {
        expect(decl?.formAssociated).toBe(true);
    });

    // No name the migration removed for these components is still declared: the alpha events (#125,
    // docs/language/beta/migration.md). pdx-pin-input's absence is pin-input-removed.test.ts's.
    it('declares no alpha event', () => {
        expect((decl?.events ?? []).map((e) => e.name).filter((n) => ALPHA.includes(n))).toEqual([]);
    });
});

/** The alpha change events the migration removed (#125). */
const ALPHA = ['pdx-change', 'change', 'valuechange', 'pressedchange', 'pdx-pressed-change', 'pdx-input'];

describe('the family', () => {
    it('is the issue\'s table: 23 rows, pdx-button-group gone to the action group (decision 51)', () => {
        expect(DONE.map((r) => r.tag).sort()).toEqual([
            'pdx-checkbox', 'pdx-checkbox-group', 'pdx-inline-edit', 'pdx-input', 'pdx-json-editor',
            'pdx-masked-input', 'pdx-mention', 'pdx-number-input', 'pdx-otp-input', 'pdx-password-input',
            'pdx-radio', 'pdx-radio-group', 'pdx-rating', 'pdx-rich-text', 'pdx-search-input',
            'pdx-segmented', 'pdx-slider', 'pdx-switch', 'pdx-tag-input', 'pdx-textarea',
            'pdx-toggle', 'pdx-toggle-group',
        ]);
        expect(decls.find((d) => d.tagName === 'pdx-button-group')?.models).toBeUndefined();
    });
});
