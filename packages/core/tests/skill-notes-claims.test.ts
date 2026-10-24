// The notes on the complex components say when to use them, where they go wrong and what sits around
// them — and the claims a source can settle are held to that source here.
//
// A note is written by hand, so it ages like any prose: a control gains or loses a model, a default
// changes, and the note goes on saying the opposite. What is checked: which controls bind to a form
// field through their model, and the defaults a note quotes — both from custom-elements.json. Nothing
// is wired by `name` any more (#128, #613), and no note may say otherwise. The rest of each claim is
// not re-derived here.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const NOTES = join(REPO, 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui', 'tools', 'notes');
const note = (tag: string) => readFileSync(join(NOTES, `${tag}.md`), 'utf-8').replace(/\r\n/g, '\n');

const COMPLEX = ['pdx-form', 'pdx-auto-form', 'pdx-entity-grid', 'pdx-edit-drawer', 'pdx-relation-picker', 'pdx-tree',
    'pdx-tree-select', 'pdx-chart', 'pdx-wizard', 'pdx-select', 'pdx-autocomplete', 'pdx-date-picker', 'pdx-field-list', 'pdx-rich-text'];

type Declaration = { tagName?: string; models?: string[]; members?: { name: string; default?: string }[] };

/** A component's declaration in custom-elements.json. */
function cemDeclaration(tag: string): Declaration | undefined {
    const cem = JSON.parse(readFileSync(join(REPO, 'packages', 'ui', 'custom-elements.json'), 'utf-8')) as
        { modules: { declarations?: Declaration[] }[] };
    for (const m of cem.modules) for (const d of m.declarations ?? []) if (d.tagName === tag) return d;
    return undefined;
}

/** A prop's default as custom-elements.json records it. */
const cemDefault = (tag: string, prop: string): string | undefined => cemDeclaration(tag)?.members?.find(x => x.name === prop)?.default;

/** Whether a component declares a model, which a `::model="f.x"` binding binds to a form field. */
const hasModel = (tag: string): boolean => (cemDeclaration(tag)?.models?.length ?? 0) > 0;

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

    it('no note says a control is wired, or not wired, by `name`: nothing is (#128, #613)', () => {
        expect(COMPLEX.filter(t => /wired by `name`|does not wire it/.test(note(t)))).toEqual([]);
    });

    it('a note that says a control is "bound through its model" is about one that declares a model', () => {
        expect(hasModel('pdx-select'), 'the reader found the models').toBe(true);
        const says = COMPLEX.filter(t => /bound through its model/.test(note(t)));
        expect(says.sort()).toEqual(['pdx-autocomplete', 'pdx-date-picker', 'pdx-select']);
        expect(says.filter(t => !hasModel(t)), 'the note promises a model the component does not declare').toEqual([]);
    });

    it('a note that says a control has "no model to bind" is about one that declares none', () => {
        const says = COMPLEX.filter(t => /no model to bind/.test(note(t)));
        expect(says).toEqual(['pdx-relation-picker']);
        expect(says.filter(t => hasModel(t)), 'the component declares a model now: the note is stale').toEqual([]);
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
