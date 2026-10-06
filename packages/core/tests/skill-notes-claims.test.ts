// The notes on the complex components say when to use them, where they go wrong and what sits around
// them — and the claims a source can settle are held to that source here.
//
// A note is written by hand, so it ages like any prose: the compiler learns to wire a control by
// `name`, a default changes, and the note goes on saying the opposite. What is checked: which controls
// the compiler wires inside a <pdx-form> (codegen-form-binding.ts), and the defaults a note quotes
// (custom-elements.json). The rest of each claim is not re-derived here.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const NOTES = join(REPO, 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui', 'tools', 'notes');
const note = (tag: string) => readFileSync(join(NOTES, `${tag}.md`), 'utf-8').replace(/\r\n/g, '\n');

const COMPLEX = ['pdx-form', 'pdx-auto-form', 'pdx-entity-grid', 'pdx-edit-drawer', 'pdx-relation-picker', 'pdx-tree',
    'pdx-tree-select', 'pdx-chart', 'pdx-wizard', 'pdx-select', 'pdx-autocomplete', 'pdx-date-picker', 'pdx-field-list', 'pdx-rich-text'];

/** The tags the compiler wires by `name` inside a <pdx-form>: the `tags` set in codegen-form-binding.ts. */
function wiredTags(): Set<string> {
    const src = readFileSync(join(REPO, 'packages', 'compiler', 'src', 'compiler', 'codegen-form-binding.ts'), 'utf-8');
    const block = /this\.tags = new Set\(\[([\s\S]*?)\]\)/.exec(src);
    expect(block, 'the auto-wired tag list moved: this reader needs to follow it').not.toBeNull();
    return new Set([...block![1].matchAll(/'(pdx-[a-z-]+)'/g)].map(m => m[1]));
}

/** A prop's default as custom-elements.json records it. */
function cemDefault(tag: string, prop: string): string | undefined {
    const cem = JSON.parse(readFileSync(join(REPO, 'packages', 'ui', 'custom-elements.json'), 'utf-8')) as
        { modules: { declarations?: { tagName?: string; members?: { name: string; default?: string }[] }[] }[] };
    for (const m of cem.modules) for (const d of m.declarations ?? []) {
        if (d.tagName === tag) return d.members?.find(x => x.name === prop)?.default;
    }
    return undefined;
}

describe('the notes on the complex components', () => {
    it('each of the fourteen has its three parts', () => {
        const missing: string[] = [];
        for (const tag of COMPLEX) {
            if (!existsSync(join(NOTES, `${tag}.md`))) { missing.push(`${tag}: no note`); continue; }
            const text = note(tag);
            for (const part of ['**Use it when**', '**Not when**', '**Pitfalls**', '**Composes with**']) {
                if (!text.includes(part)) missing.push(`${tag}: ${part}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('a note that says "not wired by name" is about a control the compiler does not wire', () => {
        const wired = wiredTags();
        expect(wired.has('pdx-select'), 'the reader found the list').toBe(true);
        const says = COMPLEX.filter(t => /compiler does not wire it/.test(note(t)));
        expect(says.sort()).toEqual(['pdx-relation-picker', 'pdx-rich-text', 'pdx-tree-select']);
        expect(says.filter(t => wired.has(t)), 'the compiler wires these now: the note is stale').toEqual([]);
    });

    it('a note that says "wired by `name`" is about a control the compiler wires', () => {
        const wired = wiredTags();
        const says = COMPLEX.filter(t => /wired by `name`/.test(note(t)));
        expect(says.length).toBeGreaterThanOrEqual(3);
        expect(says.filter(t => !wired.has(t)), 'the note promises a wiring the compiler does not do').toEqual([]);
    });

    it('the defaults a note quotes are the defaults', () => {
        expect(note('pdx-autocomplete')).toMatch(/`min-length` characters \(default 1\), at most `max-items` \(default 10\)/);
        expect(cemDefault('pdx-autocomplete', 'minLength')).toBe('1');
        expect(cemDefault('pdx-autocomplete', 'maxItems')).toBe('10');
        expect(note('pdx-entity-grid')).toMatch(/default `selection="multiple"`/);
        expect(cemDefault('pdx-entity-grid', 'selection')).toBe("'multiple'");
        expect(note('pdx-entity-grid')).toMatch(/Delete asks first/);
        expect(cemDefault('pdx-entity-grid', 'confirmDelete')).toBe('true');
    });
});
