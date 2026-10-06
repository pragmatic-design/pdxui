// The two ways to build repeating rows each name the other.
//
// `createFieldArray` and `<pdx-field-list>` both manage "add another line" and share no
// implementation. A reader who needs repeating rows asks not which one is better but WHICH ONE TO
// USE, and a page that documents one as if the other did not exist does not answer it.
//
// This asserts the pages say so, in the three places a reader stands: the recipe that compares
// them, the component's note, and the primitive's published doc. It cannot check that the prose is
// good; it can check that neither page has quietly lost the pointer to the other.
//
// The behaviour behind the prose is measured in
// `packages/ui/tests/unit/repeating-rows-mechanisms.test.ts`, not here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const SKILLS = join(REPO, 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui');

const read = (...parts: string[]) => readFileSync(join(SKILLS, ...parts), 'utf-8');

describe('the choice between the two repeating-row mechanisms is documented', () => {
    const recipes = read('references', 'recipes.md');

    it('the recipe names both mechanisms', () => {
        expect(recipes).toContain('pdx-field-list');
        expect(recipes).toContain('createFieldArray');
    });

    it('and says they do not compose, which is the part that bites', () => {
        // The measured fact: one call to form.array() on a name a field list manages discards what
        // the list has written, silently. A reader who does not meet this sentence meets the defect.
        expect(recipes.toLowerCase()).toContain('do not compose');
        expect(recipes).toMatch(/form\.array\(/);
    });

    it("the component's note points at the comparison", () => {
        const note = read('tools', 'notes', 'pdx-field-list.md');
        expect(note).toContain('createFieldArray');
        expect(note, 'the note does not send the reader to the recipe').toMatch(/Rows that repeat/);
    });

    it('and the primitive points back at the component', () => {
        // `field-array.ts`'s doc block is what gen-api.mjs publishes as api.md, in the site and in
        // this skill's references: the pointer has to live there, not in a comment beside it.
        const api = read('references', 'api.md');
        const section = api.slice(api.indexOf('### `createFieldArray`'), api.indexOf('### `createForm`'));
        expect(section, 'the published page for the primitive never names the component').toContain('pdx-field-list');
        expect(section.toLowerCase()).toContain('do not compose');
    });
});
