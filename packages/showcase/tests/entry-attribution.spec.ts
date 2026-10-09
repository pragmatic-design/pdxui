/**
 * What the entry chunk is MADE OF, not just what it weighs.
 *
 * `bundle-budget.spec.ts` next door weighs the first download. A weight says a number moved; it
 * does not say which module moved it, and removing one thing at a time over several builds is a
 * slow way to find out and can still end wrong.
 *
 * This reads the entry's sourcemap instead: `sources` names every module Rollup put in the chunk,
 * `sourcesContent` gives each one's size. Six lines, and a module that arrives uninvited is NAMED
 * rather than merely weighed — `ui/src/select/pdx-select.ts`, say, with the `createDataSource` it
 * imports, for a component the shell does not render.
 *
 * The build is `--sourcemap hidden` (see `playwright.config.ts`): the `.map` files are written and
 * no `sourceMappingURL` comment is added, so the bytes the budget weighs are the bytes an app
 * ships — the JS total is the same either way.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');

interface SourceMap {
    sources: string[];
    sourcesContent?: (string | null)[];
}

/** One module in a chunk: the path as the sourcemap writes it, and how much source it contributed. */
interface Attribution {
    source: string;
    bytes: number;
}

function attribute(mapFile: string): Attribution[] {
    const map = JSON.parse(readFileSync(join(DIST, mapFile), 'utf8')) as SourceMap;
    return map.sources
        .map((source, i) => ({
            // A sourcemap writes its sources RELATIVE to the file it sits next to, so they arrive
            // as `../../../ui/src/select/pdx-select.ts` and the word `packages` is not in them —
            // resolving against `dist/assets` first is what puts it back. Without it, both "no ui
            // module is in the entry" assertions pass because their prefix matches nothing at all,
            // which is why the control below exists.
            source: (resolve(DIST, source).split(/[\\/]packages[\\/]/).pop() ?? source).replace(/\\/g, '/'),
            bytes: (map.sourcesContent?.[i] ?? '').length,
        }))
        .sort((a, b) => b.bytes - a.bytes);
}

const entryMap = (): string => {
    const map = readdirSync(DIST).find((f) => /^index-.*\.js\.map$/.test(f));
    if (!map) throw new Error(`no entry sourcemap in ${DIST} — is the build running with --sourcemap hidden?`);
    return map;
};

test('the entry can be attributed to its modules at all', () => {
    // Without this, every assertion below would pass on an empty list — the failure mode of any
    // test that asserts something is ABSENT.
    const sources = attribute(entryMap());
    expect(sources.length, 'the entry sourcemap names no modules').toBeGreaterThan(20);
    expect(sources.some((s) => s.source.includes('showcase/src/app.pdx')), 'the shell is not in its own entry')
        .toBe(true);
});

test('the modules in the entry are reported, largest first', () => {
    // An attribution nobody can read is an attribution nobody acts on — the same reason the budget
    // prints its numbers whether or not they pass.
    const sources = attribute(entryMap());
    const total = sources.reduce((n, s) => n + s.bytes, 0);
    const top = sources.slice(0, 8).map((s) => `${(s.bytes / 1024).toFixed(0)} KB ${s.source}`).join(' · ');
    console.log(`[entry] ${sources.length} modules, ${(total / 1024).toFixed(0)} KB of source\n[entry] ${top}`);
    expect(total).toBeGreaterThan(0);
});

/**
 * The @pdxui/ui the SHELL is allowed to carry in the entry, and why.
 *
 * Measured by building the shell three ways and reading the entry off `dist/`:
 *
 *     + `<pdx-sidebar>`                          +3.9 KB
 *     + `<pdx-breadcrumb>`                      +22.9 KB   ← left on the pages that show one
 *     + `<pdx-nav-menu>` inside the sidebar     +21.2 KB   (+3.8 with its icon loaded lazily)
 *
 * ⚠️ The breadcrumb and the nav menu's cost is the SAME 17 KB twice: `ui/src/shared/i18n.ts`, which
 * each pulls in whole. That is a finding about that module, not a reason to hand-write a shell.
 *
 * An entry that grows by a component is a commit that says which and why, the same shape as raising
 * a budget: this list is where it says it.
 */
// Empty, and that is the point of it: the shell is the app's default LAYOUT, a chunk of its own the
// routes pull in, and the entry is the app and its outlet. A component that comes into the entry is
// named here, with its reason.
const SHELL_MAY_CARRY: string[] = [];

test('the entry carries only the @pdxui/ui the shell actually renders', () => {
    const offenders = attribute(entryMap())
        .filter((s) => s.source.startsWith('ui/src/'))
        .filter((s) => !SHELL_MAY_CARRY.some((allowed) => s.source.includes(allowed)));
    expect(
        offenders.map((s) => `${s.source} (${(s.bytes / 1024).toFixed(0)} KB of source)`),
        'these are in the FIRST download and the shell renders none of them — a page is a chunk of '
        + 'its own, so a component a page renders belongs there',
    ).toEqual([]);
});

test('control — the allowance names something that is really there', () => {
    // Without this, the list above could name a component the shell stopped rendering and the test
    // would go on passing while the allowance rotted.
    const ui = attribute(entryMap()).filter((s) => s.source.startsWith('ui/src/'));
    for (const allowed of SHELL_MAY_CARRY) {
        expect(ui.some((s) => s.source.includes(allowed)),
            `${allowed} is allowed in the entry and is not in it: drop the entry from the list`)
            .toBe(true);
    }
});

/**
 * A dictionary is DATA, and Rollup inlines it into the chunk that imports it — so it never appears
 * in the sourcemap's module list, and an assertion written against `attribute()` would pass while
 * 12.6 KB of Italian sat in the entry. Measured: the sourcemap names no `.json` at all.
 *
 * So these two read the bytes instead, through a string only that dictionary has.
 */
const entryJs = () => readFileSync(join(DIST, readdirSync(DIST).find((f) => /^index-.*\.js$/.test(f))!), 'utf-8');

test('the locale the visitor is not reading is not in the entry', () => {
    // The second locale is fetched, not imported: a locale installed after a component is on screen
    // reaches it, so a returning Italian visitor does not keep English strings that never correct.
    //
    // The active locale's own strings stay eager: a late dictionary is a visible flash of English.
    // English is the default, so `it.json` and the library's Italian overrides are the two that go.
    const js = entryJs();
    const italian = [
        ['locales/it.json', 'Nuova richiesta'],
        ['locales/it.components.json', 'Annulla'],
    ].filter(([, probe]) => js.includes(probe)).map(([file]) => file);
    expect(italian, 'the second language is in the FIRST download, and the visitor may never ask for it')
        .toEqual([]);
});

test('control — the active locale IS in the entry, where a flash of English would be', () => {
    // Without this, "no Italian in the entry" would be satisfied by a build that shipped no
    // dictionary at all — which is the version that flashes English on the first screen.
    // Every screen's section is out of the entry, so the probe has to be a string the SHELL renders,
    // or this control passes on the dictionary being there and fails on it being split correctly.
    expect(
        entryJs().includes('PDX Service Desk'),
        'the default locale is not eager either: the first screen will flash English',
    ).toBe(true);
});

test('and no data source either — the shell loads no data', () => {
    // `createDataSource` travels with `pdx-select`: an uninvited select brings 34 KB of paging,
    // sorting and filtering into an entry whose first screen queries nothing. It is the second-order
    // cost of an uninvited component and it is worth naming separately: the day it comes, the
    // question is which component brought it.
    const offenders = attribute(entryMap()).filter((s) => s.source.startsWith('core/src/data/'));
    expect(offenders.map((s) => s.source), 'the first screen queries nothing').toEqual([]);
});

test('control — the components ARE in the build, in the chunks that render them', () => {
    // Without this the two assertions above would also pass on an app that had lost `pdx-select`
    // entirely: absent from the entry and absent from everywhere, which is a broken page, not a
    // smaller one.
    const chunks = readdirSync(DIST).filter((f) => f.endsWith('.js.map') && !/^index-/.test(f));
    expect(chunks.length, 'no route chunks — did the @page splitting stop working?').toBeGreaterThan(1);

    const elsewhere = chunks.flatMap((c) => attribute(c).map((s) => s.source));
    expect(elsewhere.some((s) => s.startsWith('ui/src/select/')), 'pdx-select is nowhere in the build').toBe(true);
    expect(elsewhere.some((s) => s.startsWith('core/src/data/')), 'the data source is nowhere in the build').toBe(true);
});
