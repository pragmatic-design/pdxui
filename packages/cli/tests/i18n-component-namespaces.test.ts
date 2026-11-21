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
import { readFileSync, globSync } from 'node:fs';
import { join } from 'node:path';
import { COMPONENT_STRING_NAMESPACES } from '../src/i18n/keys';

const PACKAGES = join(__dirname, '..', '..');
/** The ui library's defaults, which `registerUiDefaults()` registers in a loop, one namespace per key (#1272). */
const UI_DEFAULTS = join(PACKAGES, 'ui', 'src', 'shared', 'i18n.ts');

/**
 * The namespaces of `const DEFAULTS = { … }` in `src`: its top-level keys, the lines indented by four
 * spaces that open an object. Empty when there is no such object, which the test below plants.
 */
function defaultsNamespaces(src: string): string[] {
    const start = src.indexOf('const DEFAULTS');
    if (start < 0) return [];
    // The object ends at the first line that closes it at the top level.
    const end = src.indexOf('\n};', start);
    const block = src.slice(start, end < 0 ? undefined : end);
    // Match: `    name: {` or `    'name-with-dash': {` at the object's first level. Groups: [1]=name
    return [...block.matchAll(/^ {4}'?([\w-]+)'?:\s*\{/gm)].map(m => m[1]);
}

/** Every `registerComponentStrings('<ns>'` in the workspace's sources, and every namespace of ui's DEFAULTS. */
function declaredNamespaces(): string[] {
    const files = globSync(['*/src/**/*.ts'], {
        cwd: PACKAGES,
        exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    }).map(file => join(PACKAGES, file));
    const found = new Set<string>();
    for (const file of files) {
        const src = readFileSync(file, 'utf-8');
        for (const m of src.matchAll(/registerComponentStrings\s*\(\s*['"]([\w-]+)['"]/g)) found.add(m[1]);
    }
    for (const ns of defaultsNamespaces(readFileSync(UI_DEFAULTS, 'utf-8'))) found.add(ns);
    return [...found].sort();
}

describe('the component-string namespaces', () => {
    it('are found at all, so the comparison below is not vacuous', () => {
        expect(declaredNamespaces().length).toBeGreaterThan(10);
    });

    it("read from ui's DEFAULTS by their keys, nested objects and other code left out", () => {
        const planted = [
            "import x from 'y';",
            'const DEFAULTS: Record<string, Record<string, string>> = {',
            "    alpha: { a: 'A' },",
            "    'beta-two': {",
            "        nested: { x: 'X' },",
            '    },',
            '};',
            "const OTHER = {\n    gamma: { g: 'G' },\n};",
        ].join('\n');
        expect(defaultsNamespaces(planted)).toEqual(['alpha', 'beta-two']);
        expect(defaultsNamespaces(readFileSync(UI_DEFAULTS, 'utf-8')).length, 'the scan read no namespace from DEFAULTS')
            .toBeGreaterThan(50);
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
        // "83 namespaces are registered by…" — a number in prose ages the moment a component is
        // added, and this is the only thing that reads it. In digits since #1272: the page lists more
        // than twenty, past the number words a sentence would spell.
        // Match: the count in digits before "namespaces are registered". Groups: [1]=the count
        const claim = /(?<![\w-])(\d+) namespaces are registered\b/.exec(page);
        expect(claim, 'the page no longer states, in digits, how many there are').not.toBeNull();
        expect(Number(claim![1]), `the page says ${claim![1]} and there are ${COMPONENT_STRING_NAMESPACES.length}`)
            .toBe(COMPONENT_STRING_NAMESPACES.length);
    });
});
