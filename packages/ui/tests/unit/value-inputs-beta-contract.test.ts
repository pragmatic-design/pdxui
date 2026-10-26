// The value-input components brought to the beta contract (#286): each declares its model, its visual
// states and its public parts, and the manifest lists them, which is what a theme and an agent's page
// card read (docs/language/beta/library.md, «Done, for one component»). A row joins `DONE` in the
// pull request that brings its component over; the rest of the family follows the same table.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Decl = { tagName?: string; models?: string[]; cssStates?: Named[]; cssParts?: Named[]; events?: Named[] };
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

interface Row { tag: string; model: string; states: string[]; parts: string[] }

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
        parts: ['root', 'display', 'editor', 'save', 'cancel'],
    },
    {
        tag: 'pdx-rich-text',
        model: 'value',
        states: ['readonly'],
        parts: ['toolbar', 'field', 'input'],
    },
];

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);

    it('declares its model', () => {
        expect(decl?.models).toEqual([row.model]);
    });

    it('lists its states as custom states', () => {
        expect(decl?.cssStates?.map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect(decl?.cssParts?.map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });
});
