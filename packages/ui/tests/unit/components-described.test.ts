// Every component says what it is for.
//
// `custom-elements.json` is what `llms.txt`, the skills, the site's component pages and editor hover
// are built from, and a component's own `description` is the JSDoc above its `component()` call
// (`gen-manifest.mjs`). Without one, `llms.txt` falls back to the category and reads
// `pdx-transfer — Forms`, and hover shows nothing. This is the guard on the component's own
// description, on the COMMITTED manifest.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Declaration { tagName?: string; description?: string; category?: string }
interface Manifest { modules: { declarations?: Declaration[] }[] }

const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf-8'),
) as Manifest;

const components = manifest.modules
    .flatMap(m => m.declarations ?? [])
    .filter(d => d.tagName)
    .map(d => ({ tag: d.tagName!, description: (d.description ?? '').trim(), category: d.category ?? '' }));

describe('every component is described', () => {
    it('found them, so the assertion below is not vacuous', () => {
        expect(components.length, 'no component found in custom-elements.json').toBeGreaterThan(100);
    });

    it('each has a description', () => {
        const missing = components.filter(c => !c.description).map(c => c.tag);
        expect(missing, 'these publish with no description: add a JSDoc sentence above component()').toEqual([]);
    });

    it('and the description is not just its category or its name', () => {
        const thin = components
            .filter(c => c.description)
            .filter(c => {
                const said = c.description.replace(/[.\s]/g, '').toLowerCase();
                return said === c.category.replace(/\s/g, '').toLowerCase()
                    || said === c.tag.replace(/^pdx-/, '').replace(/-/g, '');
            })
            .map(c => `${c.tag}: "${c.description}"`);
        expect(thin, 'these repeat the category or the tag').toEqual([]);
    });
});
