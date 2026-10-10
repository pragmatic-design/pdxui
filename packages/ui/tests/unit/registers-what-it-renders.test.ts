// A component brings what it needs: the stylesheet that paints it, and the modules that register
// the tags it renders.
//
// Each component's CSS lives in the component so that an app ships the styles of what it renders
// and no more. That holds easily for a component whose stylesheet is named after it, and breaks
// wherever the rules live in a NEIGHBOUR's file (`pdx-menubar` is painted by `menu.css`, the
// wizard's stepper by `pagination.css`) or where a component renders a tag it never registers — a
// `<pdx-icon>` built by `pdx-search-input` stays an unknown element, and its prefix measures 0×0 on
// any page that has not loaded the whole library.
//
// Nothing shows it while everything that renders one of them also loads all 114: a contract
// harness that imports `@pdxui/ui`, or an app that imports the whole design system.
//
// The CSS half is measured by `pnpm certify`, in the browser, where an unpainted component fails
// its geometry contract. This is the other half, at unit speed and over EVERY component rather
// than the ones a manifest covers.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { manifests } from '../../../responsive/tests/integration/ui-components/contracts/generated/manifests';

const UI = join(__dirname, '..', '..');
const GENERATED = join(UI, 'tests', 'scenarios', 'generated');

const pkg = JSON.parse(readFileSync(join(UI, 'package.json'), 'utf-8')) as {
    exports: Record<string, { development?: string } | string>;
};

/** A module's source with comments removed: a tag named in a comment is not a tag it renders. */
function code(path: string): string {
    return readFileSync(path, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

interface Owner { subpath: string; file: string }

/** tag → the module that registers it, read from the package's own export map. */
const owner = new Map<string, Owner>();
for (const [key, target] of Object.entries(pkg.exports)) {
    if (!key.startsWith('./') || key === './all') continue;
    const dev = typeof target === 'string' ? target : target.development;
    if (!dev?.endsWith('.ts')) continue;
    const file = join(UI, dev.replace(/^\.\//, ''));
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, 'utf-8').matchAll(/(?:component|customElements\.define)\(\s*'(pdx-[a-z0-9-]+)'/g)) {
        if (!owner.has(m[1])) owner.set(m[1], { subpath: key, file });
    }
}

/** The modules that register at least one tag, each with the tags it owns. */
const modules = [...new Set([...owner.values()].map((o) => o.file))].map((file) => ({
    file,
    owns: new Set([...owner].filter(([, o]) => o.file === file).map(([t]) => t)),
}));

/** Every `pdx-*` a module renders: written in a template, or built with createElement. */
function rendered(src: string): Set<string> {
    const tags = new Set<string>();
    for (const m of src.matchAll(/<(pdx-[a-z0-9-]+)[\s/>]/g)) tags.add(m[1]);
    for (const m of src.matchAll(/createElement\(\s*'(pdx-[a-z0-9-]+)'/g)) tags.add(m[1]);
    return tags;
}

describe('a component registers the tags it renders', () => {
    it('found the components, so the assertion below is not vacuous', () => {
        expect(owner.size, 'no tag is registered anywhere: the export map moved').toBeGreaterThan(100);
        expect(modules.length).toBeGreaterThan(90);
    });

    it('leaves no tag it renders to somebody else to register', () => {
        const missing: string[] = [];
        for (const { file, owns } of modules) {
            const src = code(file);
            for (const tag of rendered(src)) {
                if (owns.has(tag)) continue;
                const target = owner.get(tag);
                if (!target) continue;                       // not a component of this package
                const imported = relative(dirname(file), target.file).replace(/\\/g, '/').replace(/\.ts$/, '');
                // Static, or DYNAMIC: `import('../icon/pdx-icon')` done the first time the tag is
                // rendered is still the component bringing what it renders — and it is how a menu
                // with no named icon avoids paying for the icon set.
                const byPath = new RegExp(`import(?:\\s+|\\(\\s*)'[^']*${imported.replace(/^\.\.\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
                if (byPath.test(src)) continue;
                missing.push(`${relative(UI, file).replace(/\\/g, '/')} renders ${tag} (registered by ${target.subpath})`);
            }
        }
        expect(missing.sort(), 'these render a tag that only somebody else registers').toEqual([]);
    });
});

describe('the contract pages import what they render, not the library', () => {
    const pages = existsSync(GENERATED)
        ? readdirSync(GENERATED).filter((f) => f.endsWith('.html'))
        : [];

    it('found the generated pages', () => {
        // Without this a deleted generated/ would make both assertions below pass by checking
        // nothing — the same substitution `gate-coverage.test.ts` exists to prevent.
        expect(pages.length, 'no generated scenario page: run `pnpm certify:gen`').toBeGreaterThan(10);
    });

    it('none of them imports the barrel', () => {
        // The barrel registers all 114 components and loads every stylesheet with them, which
        // makes the harness blind: a component whose CSS does not travel with it passes quietly.
        const withBarrel = pages.filter((f) => /import\s+'@pdxui\/ui'\s*;/.test(readFileSync(join(GENERATED, f), 'utf-8')));
        expect(withBarrel, 'these import the whole library and measure nothing about what travels').toEqual([]);
    });

    it('no hand-written page beside them imports the barrel either', () => {
        // The guard above reads generated/ only. gotchas.html alone is opened ~400 times a certify
        // run, and with the barrel every load asks the scenario server for the whole library — 414
        // requests, 23 of them chart modules, for a page moving a pdx-aspect-ratio, and a refused
        // request fails the run. Each page loads what its case builds, through
        // generated/component-loaders.js.
        const SCENARIOS = join(UI, 'tests', 'scenarios');
        const handWritten = readdirSync(SCENARIOS).filter((f) => f.endsWith('.html'));
        expect(handWritten.length, 'no hand-written scenario page found').toBeGreaterThan(5);
        const withBarrel = handWritten.filter((f) => /import\s+'@pdxui\/ui'\s*;/.test(readFileSync(join(SCENARIOS, f), 'utf-8')));
        expect(withBarrel, 'these import the whole library on every load').toEqual([]);
    });

    it('the loader map registers every tag the package registers', () => {
        // A tag missing from the map makes loadTags() throw on the page that needs it — loud, but
        // only on that page. Here it fails for every tag, before any page is opened.
        const loaders = readFileSync(join(GENERATED, 'component-loaders.js'), 'utf-8');
        // A Map entry since #72: `['pdx-x', () => import('…')]`.
        const missing = [...owner.keys()].filter((tag) => !loaders.includes(`['${tag}', () => import('@pdxui/ui/${owner.get(tag)!.subpath.slice(2)}')]`));
        expect(missing, 'these tags have no loader: run `pnpm certify:gen`').toEqual([]);
    });

    it('every specifier a manifest declares is on the page that holds its scenarios', () => {
        // `imports` is what the manifest says the scenario needs; a generator that used the glob
        // instead would make the field an intention nobody acts on. A page with
        // NO import is legitimate: `tier-5a` holds `table`, whose `.pdx-table` is part of the
        // CSS-only tier that lives in base.css by design (gen-layered-entries.mjs, SHARED).
        const declared = new Map<string, Set<string>>();
        for (const m of manifests) {
            const page = `tier-${m.tier.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
            const set = declared.get(page) ?? new Set<string>();
            for (const spec of m.imports ?? []) set.add(spec);
            declared.set(page, set);
        }
        const missing: string[] = [];
        for (const [page, specs] of declared) {
            if (!pages.includes(page)) continue;
            const html = readFileSync(join(GENERATED, page), 'utf-8');
            for (const spec of specs) if (!html.includes(`import '${spec}';`)) missing.push(`${page} <- ${spec}`);
        }
        expect(missing.sort(), 'a manifest declares these and its page does not import them').toEqual([]);
    });
});
