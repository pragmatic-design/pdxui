// The CLI's list of component-string namespaces is the library's list.
//
// `pdx i18n validate` tells apart a key that is missing from the dictionary and a key that belongs
// to the OTHER registry — the one `registerComponentStrings()` fills and `setLocaleStrings()`
// overrides. `$t('router.notFound')` renders the raw key, on a 404 page for instance; reported as a
// missing translation, it would send you to add it to a dictionary where it will never be read.
//
// Telling them apart needs the namespaces, and the CLI cannot ask for them: the registry is filled
// at import time by modules that call `customElements.define`, which does not exist in Node. So the
// list is data in `src/i18n/keys.ts`, and this reads the calls in the workspace and compares. A
// component that registers strings under a new namespace fails here by name.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { COMPONENT_STRING_NAMESPACES } from '../src/i18n/keys';

const PACKAGES = join(__dirname, '..', '..');

/** Every `registerComponentStrings('<ns>'` in the workspace's sources. */
function declaredNamespaces(): string[] {
    const files = fg.sync(['*/src/**/*.ts'], {
        cwd: PACKAGES,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    });
    const found = new Set<string>();
    for (const file of files) {
        const src = readFileSync(file, 'utf-8');
        for (const m of src.matchAll(/registerComponentStrings\s*\(\s*['"]([\w-]+)['"]/g)) found.add(m[1]);
    }
    return [...found].sort();
}

describe('the component-string namespaces', () => {
    it('are found at all, so the comparison below is not vacuous', () => {
        expect(declaredNamespaces().length).toBeGreaterThan(10);
    });

    it('are exactly what the CLI carries', () => {
        expect(declaredNamespaces(), 'a component registers strings under a namespace the CLI does not know: '
            + 'add it to COMPONENT_STRING_NAMESPACES in packages/cli/src/i18n/keys.ts')
            .toEqual([...COMPONENT_STRING_NAMESPACES].sort());
    });
});

// The third copy of the same list, and the one a reader acts on: `i18n.md` names the namespaces so
// an application knows what it may override. A list that drifts there is worse than no list — it
// sends someone to `setLocaleStrings({ 'date-pikcer': … })`, which fails silently because an
// override for a component nobody registered is simply never read.
describe('the namespaces the documentation names', () => {
    const page = readFileSync(join(PACKAGES, 'site', 'content', 'docs', 'i18n.md'), 'utf-8');

    it('names every one of them', () => {
        const missing = [...COMPONENT_STRING_NAMESPACES].filter(ns => !page.includes(`\`${ns}\``));
        expect(missing, 'i18n.md does not name these namespaces, so an app cannot know to override them')
            .toEqual([]);
    });

    it('states the count it lists', () => {
        // "Sixteen namespaces are registered by…" — a number in prose ages the moment a component
        // is added, and this is the only thing that reads it.
        const claim = /\b(\w+) namespaces are registered\b/.exec(page);
        expect(claim, 'the page no longer states how many there are').not.toBeNull();
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
            'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
            'eighteen', 'nineteen', 'twenty'];
        const stated = words.indexOf(claim![1].toLowerCase());
        expect(stated, `"${claim![1]}" is not a number word this check knows`).toBeGreaterThanOrEqual(0);
        expect(stated, `the page says ${claim![1]} and there are ${COMPONENT_STRING_NAMESPACES.length}`)
            .toBe(COMPONENT_STRING_NAMESPACES.length);
    });
});
