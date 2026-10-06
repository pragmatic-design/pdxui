// Every method a component exposes says what it does.
//
// `ctx.expose({ … })` is the imperative API: what an app calls when markup is not enough —
// `grid.startEdit(id)`, `wizard.goNext()`, `editor.getJSON()`. `gen-manifest.mjs` reads the JSDoc
// above each name into `custom-elements.json`, and the site's component pages and `llms.txt` are
// built from that file. A method with no JSDoc publishes as an empty field: the name, and nothing
// beside it.
//
// Without this test an empty description is visible only by counting: the generator prints the
// number on every run, an empty description is valid in the schema, and nothing fails.
//
// The generator reads the JSDoc above the name, not a table of well-known NAMES (`open`, `close`,
// `focus`, …): with such a table, every other method would publish empty no matter what was written
// above it.
//
// This asserts on the COMMITTED manifest, which is what ships and what the site reads. A method
// added without a JSDoc fails here once the manifest is regenerated, which `gen-manifest.mjs` does
// and which the build expects to be current.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Member { kind: string; name: string; description?: string }
interface Declaration { tagName?: string; members?: Member[] }
interface Manifest { modules: { declarations?: Declaration[] }[] }

const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf-8'),
) as Manifest;

const methods = manifest.modules
    .flatMap(m => m.declarations?.[0] ? [m.declarations[0]] : [])
    .filter(d => d.tagName)
    .flatMap(d => (d.members ?? [])
        .filter(x => x.kind === 'method')
        .map(x => ({ tag: d.tagName!, name: x.name, description: x.description ?? '' })));

describe('the exposed methods are documented', () => {
    it('found them, so the assertion below is not vacuous', () => {
        // A manifest that lost its methods — or a filter that matches nothing — would make the
        // check below pass by checking nothing.
        expect(methods.length, 'no exposed method found in custom-elements.json').toBeGreaterThan(150);
    });

    it('every one says what it does', () => {
        const undocumented = methods
            .filter(m => !m.description.trim())
            .map(m => `${m.tag}.${m.name}()`);
        expect(undocumented, 'these publish as a name with an empty description').toEqual([]);
    });

    it('and says something, not a restatement of the name', () => {
        // "open()" described as "Open" tells a reader nothing the name did not. Not a style rule:
        // the description is the only place the CONDITIONS live — what it does when already open,
        // what it returns, what it does not do.
        const tooThin = methods
            .filter(m => m.description.trim())
            .filter(m => m.description.trim().replace(/[.\s]/g, '').toLowerCase()
                === m.name.replace(/([A-Z])/g, ' $1').replace(/[\s]/g, '').toLowerCase())
            .map(m => `${m.tag}.${m.name}(): "${m.description}"`);
        expect(tooThin, 'these descriptions only repeat the method name').toEqual([]);
    });
});
