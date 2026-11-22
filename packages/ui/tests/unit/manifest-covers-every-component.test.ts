// Every `component()` in the library has to reach the manifest.
//
// A generator that reads one `component()` call per file — `findComponentCall(sourceFile)`,
// singular — contributes one tag for a file that declares two, and the other becomes invisible to
// everything downstream:
//
//   · `custom-elements.json` does not document it;
//   · the site's component index iterates the manifest, so there is no page for it;
//   · `llms.txt` never mentions it, so an agent reading the machine-readable surface cannot know
//     it exists;
//   · `packages/ui/package.json` has no export for it, so auto-import cannot resolve the tag;
//   · `PDX_UNRESOLVED_COMPONENT` reports it as missing.
//
// `pdx-toggle-group`, declared inside `pdx-toggle.ts` until #1210 gave it a .pdx of its own, was such
// a component, and without it in the manifest it worked only by accident: a page that used it and also
// used `<pdx-toggle>` got the module that registers both through the latter's auto-import. No module
// of the library declares two now; the generator still reads every call, held below on a source
// written for it.
//
// The check reads the SOURCES, not the manifest. `gen-manifest-fresh.test.ts` compares the manifest
// against a regeneration, which cannot see this class of gap: the generator and the committed file
// agree precisely because both come from the same blind spot.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deriveTag } from '@pdxui/compiler';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile } from '../../scripts/gen-manifest.mjs';

const UI = join(__dirname, '..', '..');
const SRC = join(UI, 'src');

/**
 * Every `component('pdx-…')` call in the source tree, and every `pdx-*.pdx` component (#1003), with
 * the file that holds it. A .pdx registers the tag its `@tag` names, else the one its file name
 * gives under the library's prefix — the compiler's rule, `deriveTag`.
 */
function declaredTags(): { tag: string; file: string }[] {
    const out: { tag: string; file: string }[] = [];
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) { walk(full); continue; }
            if (/^pdx-.*\.pdx$/.test(name)) {
                // Match: @tag 'pdx-x';   Groups: [1]=the tag
                const tagged = /^\s*@tag\s+['"]([\w-]+)['"]/m.exec(readFileSync(full, 'utf8'));
                out.push({ tag: tagged?.[1] ?? deriveTag(name, 'pdx'), file: full.slice(UI.length + 1).replace(/\\/g, '/') });
                continue;
            }
            if (!name.endsWith('.ts')) continue;
            const text = readFileSync(full, 'utf8');
            for (const m of text.matchAll(/\bcomponent\(\s*['"`](pdx-[a-z0-9-]+)['"`]/g)) {
                out.push({ tag: m[1], file: full.slice(UI.length + 1).replace(/\\/g, '/') });
            }
        }
    };
    walk(SRC);
    return out;
}

/** Every tag the manifest documents. */
function manifestTags(): Set<string> {
    const cem = JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf8')) as
        { modules: { declarations: { tagName: string }[] }[] };
    return new Set(cem.modules.map(m => m.declarations?.[0]).filter(Boolean).map(d => d.tagName));
}

describe('the manifest documents every component the sources declare', () => {
    const declared = declaredTags();
    const documented = manifestTags();

    it('finds components on both sides', () => {
        // A broken walk or an unreadable manifest would make the comparison vacuous.
        expect(declared.length, 'no component() calls found in src').toBeGreaterThan(100);
        expect(documented.size, 'the manifest documents nothing').toBeGreaterThan(100);
    });

    it('leaves none of them out', () => {
        const missing = declared
            .filter(d => !documented.has(d.tag))
            .map(d => `${d.tag} (${d.file})`);
        expect(missing, 'declared by component() and absent from custom-elements.json').toEqual([]);
    });

    it('documents nothing the sources do not declare', () => {
        const names = new Set(declared.map(d => d.tag));
        expect([...documented].filter(t => !names.has(t)),
            'the manifest documents a component no source declares').toEqual([]);
    });

    it('gives a second component in a shared file the same import as its sibling', () => {
        // The resolver derives an import path from the module path, and two components in one file
        // share that path: one export, two tags, rather than an export of its own that points at the
        // same module. A source written for it, since the library has no such file left (#1210).
        const source = [
            "component('pdx-pair', { props: {}, render: () => null });",
            "component('pdx-pair-group', { props: {}, render: () => null });",
        ].join('\n');
        const modules = analyzeFile('src/pair/pdx-pair.ts', source, {}) as
            { path: string; declarations: { tagName: string }[] }[];
        const byTag = new Map(modules.flatMap(m => m.declarations.map(d => [d.tagName, m.path] as const)));
        expect([...byTag.keys()], 'both calls are read, not only the first').toEqual(['pdx-pair', 'pdx-pair-group']);
        expect(byTag.get('pdx-pair-group'), 'it must point at the file that declares it').toBe(byTag.get('pdx-pair'));
    });

    it('the library\'s pdx-toggle-group has a module of its own, apart from pdx-toggle (#1210)', () => {
        const cem = JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf8')) as
            { modules: { path: string; declarations: { tagName: string }[] }[] };
        const byTag = new Map(cem.modules.map(m => [m.declarations?.[0]?.tagName, m.path]));
        expect(byTag.get('pdx-toggle-group')).toBe('src/toggle-group/pdx-toggle-group.pdx');
        expect(byTag.get('pdx-toggle')).toBe('src/toggle/pdx-toggle.pdx');
    });
});
