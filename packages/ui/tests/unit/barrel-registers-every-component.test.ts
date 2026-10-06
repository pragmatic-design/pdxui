// Every documented component must actually register when the barrel is imported.
//
// `import '@pdxui/ui'` (and `@pdxui/ui/all`, which resolves to the same file) is how a page
// gets the custom elements. The manifest is generated from FILE DISCOVERY, not from that file, so a
// component can be fully documented — a page on the site, an entry in llms.txt, a row in the
// auto-import index — and never be defined by anything. It renders as an empty inline box, throws
// nothing, and logs nothing.
//
// A component exported from package.json and absent from src/index.ts is exactly that case, and only
// `customElements.get()` on the built site shows it. No console sweep can see it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '..', '..');

/** Every tag the manifest documents, with the module that declares it. */
function documented(): { tag: string; module: string }[] {
    const cem = JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf8')) as
        { modules: { path: string; declarations: { tagName: string }[] }[] };
    return cem.modules
        .filter(m => m.declarations?.[0])
        .map(m => ({ tag: m.declarations[0].tagName, module: m.path }));
}

/**
 * Every module the barrel side-effect imports, as a manifest-shaped path.
 *
 * Follows the MODULE, not the tag name. A file may declare more than one component —
 * `pdx-toggle.ts` declares `pdx-toggle` and `pdx-toggle-group` — and importing it registers both,
 * so "is this tag named on an import line?" would call the second one unregistered when it is not.
 * The manifest records which module declares each tag; that is the thing to follow.
 */
function importedModules(): Set<string> {
    const src = readFileSync(join(UI, 'src', 'index.ts'), 'utf8');
    return new Set([...src.matchAll(/^import\s+'\.\/([^']+)';/gm)].map(m => `src/${m[1]}.ts`));
}

describe('the barrel registers every documented component', () => {
    it('finds components on both sides', () => {
        expect(documented().length, 'the manifest documents nothing').toBeGreaterThan(100);
        expect(importedModules().size, 'the barrel imports nothing').toBeGreaterThan(100);
    });

    it('leaves no documented component undefined', () => {
        const imported = importedModules();
        const orphans = documented()
            .filter(d => !imported.has(d.module))
            .map(d => `${d.tag} (${d.module})`);
        expect(orphans, 'documented on the site, never defined by the barrel').toEqual([]);
    });

    it('imports no module that declares nothing', () => {
        const declaring = new Set(documented().map(d => d.module));
        expect([...importedModules()].filter(m => !declaring.has(m)),
            'the barrel imports a module the manifest never mentions').toEqual([]);
    });

    it('covers a module that declares two components with one import', () => {
        // The case a tag-name version of this check gets wrong: one import, two registrations.
        const byTag = new Map(documented().map(d => [d.tag, d.module]));
        expect(byTag.get('pdx-toggle-group'), 'pdx-toggle-group is not documented').toBeTruthy();
        expect(byTag.get('pdx-toggle-group')).toBe(byTag.get('pdx-toggle'));
        expect(importedModules().has(byTag.get('pdx-toggle-group')!),
            'the shared module is not imported by the barrel').toBe(true);
    });
});
