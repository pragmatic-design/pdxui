// Every component the site lists must have something to say about itself.
//
// `packages/site` has no suite of its own — its signal is a browser — so this lives here beside the
// other repository-wide structural checks (`site-headers`, `docs-language`), and like them it reads
// files rather than starting anything.
//
// The component index and each component page take their one-line description from the Custom
// Elements Manifest, falling back to `summaries.ts`. The manifest carries a summary for exactly one
// component, so in practice `summaries.ts` IS the content — and a component added without an entry
// there ships a card with a blank line under its name, on a page that never mentions what it does.
//
// The reverse also rots: an entry for a component that no longer exists is content the site can
// never show, and reads as coverage it does not have.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MANIFEST = join(ROOT, 'ui', 'custom-elements.json');
const SUMMARIES = join(ROOT, 'site', 'src', 'lib', 'summaries.ts');
const EXAMPLES = join(ROOT, 'site', 'src', 'lib', 'examples.ts');
const THEMES = join(ROOT, 'design', 'src', 'themes');
const SITE_TEXT = [join(ROOT, 'site', 'src'), join(ROOT, 'site', 'content')];

interface Decl { tagName: string; summary?: string; description?: string }

/** Every custom element the site's index iterates, in manifest order. */
function components(): Decl[] {
    const cem = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { modules: { declarations: Decl[] }[] };
    return cem.modules.map(m => m.declarations?.[0]).filter(Boolean);
}

/** The tags a keyed `Record<string, string>` in one of the site's content files declares. */
function keysOf(file: string): Set<string> {
    return new Set([...readFileSync(file, 'utf8').matchAll(/^\s*'(pdx-[a-z0-9-]+)':/gm)].map(m => m[1]));
}


/** Every .pdx / .md / .ts file the site renders text from. */
function siteFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(pdx|md|ts)$/.test(e.name)) out.push(p);
        }
    };
    for (const root of SITE_TEXT) walk(root);
    return out;
}

/** Every `<number> <noun>` the site states, with the file it states it in. */
function claims(noun: RegExp): { file: string; n: number; text: string }[] {
    const found: { file: string; n: number; text: string }[] = [];
    const re = new RegExp(String.raw`(\d+)\+?\s+(?:\w+\s+)?` + noun.source, 'g');
    for (const f of siteFiles()) {
        for (const m of readFileSync(f, 'utf8').matchAll(re)) {
            found.push({ file: f.slice(f.indexOf('site')), n: Number(m[1]), text: m[0] });
        }
    }
    return found;
}

describe('site content covers the component library', () => {
    it('finds components to check at all', () => {
        // A manifest that failed to generate would make every assertion below vacuously true.
        expect(components().length, 'the manifest lists no components').toBeGreaterThan(100);
    });

    it('gives every component a one-line summary', () => {
        const summarised = keysOf(SUMMARIES);
        const blank = components()
            .filter(d => !d.summary && !d.description && !summarised.has(d.tagName))
            .map(d => d.tagName);
        expect(blank, 'these ship with a blank description on the site').toEqual([]);
    });

    it('keeps no summary for a component that no longer exists', () => {
        const tags = new Set(components().map(d => d.tagName));
        expect([...keysOf(SUMMARIES)].filter(t => !tags.has(t)),
            'summaries.ts describes components the library does not have').toEqual([]);
    });

    it('keeps no curated example for a component that no longer exists', () => {
        const tags = new Set(components().map(d => d.tagName));
        expect([...keysOf(EXAMPLES)].filter(t => !tags.has(t)),
            'examples.ts renders components the library does not have').toEqual([]);
    });

    // Numbers about the product age silently: a demo page telling visitors "11 themes" while the
    // landing page, on the same site, says 13. Nothing else reads prose, so nothing else notices.
    it('states the theme count the design package actually ships', () => {
        const real = readdirSync(THEMES).filter(f => f.endsWith('.css')).length;
        const wrong = claims(/themes\b/).filter(c => c.n !== real);
        expect(wrong, `the design package ships ${real} themes`).toEqual([]);
    });

    it('states the component count the manifest actually documents', () => {
        const real = components().length;
        const wrong = claims(/components\b/).filter(c => c.n !== real);
        expect(wrong, `the manifest documents ${real} components`).toEqual([]);
    });
});

// ─── Generated demo pages ────────────────────────────────────────────────────────
//
// `packages/site/src/demos/*.pdx` is written by `scripts/port-demos.mjs` from
// `packages/compiler/demo/showcase-new/pages/`, and every generated file carries a banner saying
// "Do not edit". Committed copies that nobody regenerates drift from the source in silence, in both
// directions:
//
//   · edit the generated copy and the next port reverts you;
//   · edit the source and the site keeps serving the old page, stale by an entire refactor.
//
// Neither is detectable by anything the repository runs, so the class of defect is removed rather
// than watched for: the copies are not committed, and the build regenerates them. This asserts the
// wiring that makes that true.
describe('the site does not commit what it generates', () => {
    const sitePkg = JSON.parse(readFileSync(join(ROOT, 'site', 'package.json'), 'utf8')) as
        { scripts?: Record<string, string> };
    const gitignore = readFileSync(join(ROOT, 'site', '.gitignore'), 'utf8');

    it('ignores the generated demo directory', () => {
        const ignored = gitignore.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        expect(ignored, 'src/demos/ is generated on every build; committing it is what let it drift')
            .toContain('src/demos/');
    });

    it('regenerates them before building, not after', () => {
        const build = sitePkg.scripts?.build ?? '';
        expect(build, 'the build does not run port-demos, so a fresh checkout builds without pages')
            .toContain('port-demos');
        expect(build.indexOf('port-demos'), 'port-demos must run BEFORE vite build, not after it')
            .toBeLessThan(build.indexOf('vite build'));
    });

    it('regenerates them before the dev server too', () => {
        // `src/routes/{component,design,search}.pdx` read `../demos/*` through import.meta.glob and
        // design-index.json. With the directory not committed, a fresh clone running `dev`
        // would find nothing there — a broken dev experience is not an acceptable price for a
        // clean git status.
        const dev = sitePkg.scripts?.dev ?? '';
        expect(dev, 'a fresh clone would run the dev server with no demo pages').toContain('port-demos');
    });
});

// ─── Links between documentation pages ───────────────────────────────────────────
//
// The docs pages point at each other — "see [Components](/docs/components)" — and one of them now
// points at a SECTION of another. A page slug that no longer exists renders as a link to a 404; an
// anchor that no longer exists renders as a link that silently lands at the top of the page, which
// is worse, because the reader believes they arrived.
//
// The ids are generated by the site's own `slugify`
// (`packages/site/src/lib/markdown/vite-markdown.ts`), so the check has to use the same rule — it
// is repeated here, and the test below fails if the two ever diverge.
describe('the links between doc pages resolve', () => {
    const DOCS = join(ROOT, 'site', 'content', 'docs');
    const pages = readdirSync(DOCS).filter(f => f.endsWith('.md'));

    /** The site's own heading-id rule, from vite-markdown.ts. */
    const slugify = (text: string): string => text.toLowerCase().trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    /** Every heading id a page publishes. */
    const headingsOf = (page: string): string[] =>
        readFileSync(join(DOCS, page), 'utf8').replace(/\r\n/g, '\n')
            .split('\n')
            .map(l => /^(#{1,6})\s+(.+)$/.exec(l))
            .filter((m): m is RegExpExecArray => m !== null)
            .map(m => slugify(m[2].trim()));

    const ids = new Map(pages.map(p => [p.replace(/\.md$/, ''), headingsOf(p)]));

    /** [text](target) links, page by page, excluding external ones. */
    const links: { from: string; target: string }[] = [];
    for (const page of pages) {
        const text = readFileSync(join(DOCS, page), 'utf8');
        for (const m of text.matchAll(/\]\((\/docs\/[^)\s]*|#[^)\s]+)\)/g)) {
            links.push({ from: page, target: m[1] });
        }
    }

    it('reads the same slug rule the site uses', () => {
        // If vite-markdown's slugify changes, every id below is computed against the wrong rule and
        // the suite stays green while the links rot. Pin the source, not just the copy.
        const source = readFileSync(
            join(ROOT, 'site', 'src', 'lib', 'markdown', 'vite-markdown.ts'), 'utf8');
        expect(source, 'slugify changed shape; re-read it and update the copy above')
            .toContain(".replace(/[^\\w\\s-]/g, '')");
    });

    it('found links to check', () => {
        expect(links.length, 'no /docs link in the documentation at all').toBeGreaterThan(10);
    });

    it('points at a page that exists', () => {
        const broken = links
            .filter(l => l.target.startsWith('/docs/'))
            .filter(l => {
                const slug = l.target.slice('/docs/'.length).split('#')[0];
                return slug !== '' && !ids.has(slug);
            })
            .map(l => `${l.from} → ${l.target}`);
        expect(broken, 'these links point at a doc page that does not exist').toEqual([]);
    });

    it('points at a heading that exists', () => {
        const broken = links
            .filter(l => l.target.includes('#'))
            .filter(l => {
                const [path, anchor] = l.target.split('#');
                const slug = path.startsWith('/docs/')
                    ? path.slice('/docs/'.length)
                    : l.from.replace(/\.md$/, '');
                const page = ids.get(slug);
                return page !== undefined && !page.includes(anchor);
            })
            .map(l => `${l.from} → ${l.target}`);
        expect(broken, 'these links point at a section that does not exist').toEqual([]);
    });
});

// ─── What a page destructures must exist ─────────────────────────────────────────
//
// A page publishing `const { y, direction, atTop, atBottom } = useScroll()` names two that are not on
// `ScrollState`: both are `undefined` and `!atTop` is always true, so the example's header hides at
// the wrong times and the reader has no way to see why. A destructure is a promise about a shape,
// and this is the cheapest possible check of it — both sides read from the source, so it cannot
// drift.
describe('the docs destructure only what the type declares', () => {
    const DOCS = join(ROOT, 'site', 'content', 'docs');

    /** The property names an exported interface declares. */
    const interfaceKeys = (file: string, iface: string): string[] => {
        const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        const block = new RegExp(String.raw`export interface ${iface}\s*\{([\s\S]*?)\n\}`).exec(src);
        expect(block, `${iface} not found in ${file} — the check below would pass vacuously`)
            .not.toBeNull();
        return [...block![1].matchAll(/^\s{4}(\w+)[?]?:/gm)].map(m => m[1]);
    };

    it('names only ScrollState members when it destructures useScroll()', () => {
        const declared = interfaceKeys(join(ROOT, 'core', 'src', 'browser', 'scroll.ts'), 'ScrollState');
        expect(declared, 'ScrollState parsed as empty').toContain('y');

        const text = readFileSync(join(DOCS, 'head-scroll.md'), 'utf8');
        const destructures = [...text.matchAll(/const\s*\{([^}]*)\}\s*=\s*useScroll\(\)/g)];
        expect(destructures.length, 'head-scroll.md no longer shows useScroll()').toBeGreaterThan(0);

        const invented = destructures
            .flatMap(m => m[1].split(',').map(s => s.trim().split(':')[0].trim()))
            .filter(Boolean)
            .filter(name => !declared.includes(name));
        expect(invented, `useScroll() returns { ${declared.join(', ')} }`).toEqual([]);
    });
});

// ─── What a page imports must be exported ────────────────────────────────────────
//
// A documented import is a promise with a name on it. A page that calls a `currentUser()` the
// framework does not export, or teaches a hand-rolled form context instead of `provideForm`/`useForm`,
// which do exist, reads as working code all the same.
//
// So every `import { … } from '@pdxui/core'` on a doc page is checked against what
// `packages/core/src/index.ts` actually re-exports.
import { surfaceOfPackage } from '../../site/scripts/gen-api.mjs';

describe('the docs import only what core exports', () => {
    const DOCS = join(ROOT, 'site', 'content', 'docs');

    /**
     * Every name the package puts on its surface, the barrel AND the sub-paths.
     *
     * Parsing `index.ts` alone would check a page importing from `@pdxui/core/testing` against
     * nothing — `mount` and the queries are not in the barrel — and testing.md could teach
     * signatures that do not exist with this guard having no opinion.
     */
    const coreExports = (): Set<string> =>
        new Set((surfaceOfPackage('core') as Map<string, unknown>).keys());

    it('reads a surface to check against', () => {
        const exported = coreExports();
        expect(exported.size, 'the core surface came back empty').toBeGreaterThan(100);
        expect(exported, 'signal is missing — the surface is wrong').toContain('signal');
        expect(exported, 'a sub-path export is missing: the barrel alone is not the surface')
            .toContain('mount');
    });

    it('names nothing @pdxui/core does not export', () => {
        const exported = coreExports();
        const missing: string[] = [];
        for (const file of readdirSync(DOCS).filter(f => f.endsWith('.md') && f !== 'api.md')) {
            const text = readFileSync(join(DOCS, file), 'utf8');
            // The barrel and every sub-path: `@pdxui/core`, `@pdxui/core/testing`, …
            for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core(?:\/[a-z-]+)?'/g)) {
                for (const part of m[1].split(',')) {
                    const name = part.trim().split(/\s+as\s+/)[0].trim();
                    if (name && !exported.has(name)) missing.push(`${file}: ${name}`);
                }
            }
        }
        expect(missing, 'these are imported by a doc page and exported by nothing').toEqual([]);
    });
});

// ─── A page that describes a mechanism has to name it ────────────────────────────
//
// A page can describe something the framework ships and name something else instead:
//
//   · a form example closing with "this is exactly how the built-in form components talk to each
//     other" over a hand-rolled `formCtx.value(name)`. They use `provideForm` / `useForm`, and
//     `formCtx.value()` is not the Form API at all;
//   · a permissions checker driven from a `currentUser()` the framework does not export, while
//     `createAuthStore` sits undocumented.
//
// Prose cannot be verified, but the pointer can: if a page claims a subject, it must at least name
// the symbol that subject is built on.
describe('the pages name the mechanism they describe', () => {
    const DOCS = join(ROOT, 'site', 'content', 'docs');
    const page = (f: string): string => readFileSync(join(DOCS, f), 'utf8');

    it('the communication page names the form context, not a hand-rolled one', () => {
        const text = page('provide-inject.md');
        for (const symbol of ['provideForm', 'useForm', 'tryUseForm', 'createFormCoordinator']) {
            expect(text, `provide-inject.md describes component communication without naming ${symbol}`)
                .toContain(symbol);
        }
        expect(text, 'the hand-rolled formCtx example is back; the Form API is fields.x.value()')
            .not.toContain('formCtx.value(');
    });

    it('the permissions page names the identity store it drives', () => {
        const text = page('permissions.md');
        expect(text, 'permissions.md never mentions createAuthStore, so the two halves stay unjoined')
            .toContain('createAuthStore');
        expect(text, 'currentUser() is not exported by anything').not.toContain('currentUser(');
    });

    // ── Nested routes, and the rule that is NOT the path ──
    //
    // The page has to say that the outlet is the declaration. Inferring a parent from a shared
    // prefix is wrong — `/owners` is a prefix of `/owners/new` — and a reader
    // who takes the prefix for the rule will expect their own siblings to nest.
    it('the router page teaches nesting by the outlet, not by the prefix', () => {
        const text = page('router.md');
        expect(text, 'router.md never mentions nesting').toMatch(/Nested routes/);
        expect(text, 'the page does not say the parent survives a child change')
            .toMatch(/does not remount/i);
        expect(text, 'the page does not name the sibling case that makes the prefix rule wrong')
            .toContain('/owners/new');
        expect(text, 'the page does not separate nesting from named outlets')
            .toMatch(/named outlets/i);
    });

    // Every level's loader runs, not only the matched route's: one signal has no answer to "whose
    // data is this?" with two levels loading. The page has to teach the two halves a reader acts on: which accessor means which
    // level, and what decides whether a parent refetches.
    it('the router page teaches a loader per level, and what decides a refetch', () => {
        const text = page('router.md');
        expect(text, 'the page never says a parent has a loader of its own')
            .toMatch(/loader per level|loaders run outermost first/i);
        expect(text, 'the page does not name the accessor a child reads its parent with')
            .toContain("loaderData('/tickets/:id')");
        expect(text, 'the page does not say what decides a refetch, which is the whole economy of it')
            .toMatch(/own\*\* params|its \*\*own\*\*/i);
    });

    // ── Three ways to drag, one page that decides between them ──
    //
    // The composables, the grid's HTML5 row reorder (`grid-body.ts`) and the column chooser's own
    // (`shared/column-chooser.ts`) share no line of code, and a reader meeting one has no other way
    // to know the others exist. The behaviour is measured in the browser
    // (`responsive/tests/integration/ui-components/drag-mechanisms.spec.ts`); these are the claims
    // the page makes, tied to the source so the prose cannot outlive it.
    it('the composables page decides between the drag mechanisms', () => {
        const text = page('composables.md');
        for (const named of ['<pdx-sortable-list>', 'useDropZone', 'row-reorder']) {
            expect(text, `composables.md describes dragging without naming ${named}`).toContain(named);
        }
        expect(text, 'the page does not say the two event models cannot reach each other')
            .toMatch(/do not meet/i);
        expect(text, 'the page does not warn that draggable="true" takes the pointer stream')
            .toMatch(/draggable="true"/);
    });

    // `useDrag` does not use `aria-grabbed`, which WAI-ARIA 1.1 deprecated: it does what
    // `<pdx-sortable-list>` does, and the page has to say so — a
    // keyboard drag nobody is told about is not a keyboard drag anybody uses.
    it('the page says how a keyboard drag works and what it announces', () => {
        const text = page('composables.md');
        expect(text, 'the keys are unstated: a keyboard drag has no affordance to discover')
            .toMatch(/Space\*\* lifts|Space to lift/);
        expect(text, 'the page does not mention the role description a screen reader reads')
            .toContain('aria-roledescription');
        expect(text, 'the page does not say the steps are announced')
            .toMatch(/announces/i);
        expect(text, 'the page does not say WHY aria-grabbed is absent, so someone will add it back')
            .toMatch(/aria-grabbed/);
    });

    it('and it repeats the trap that makes the announcements empty', () => {
        // `useDrag` reports the gesture and paints nothing, and drop zones are hit-tested against
        // the BOUNDING RECT. An unpainted keyboard drag therefore never reaches a zone — measured
        // while writing the spec, 80 arrow presses and `overA` still false.
        const text = page('composables.md');
        expect(text, 'the page does not say the caller must paint position() for a zone to be reached')
            .toMatch(/bounding\s+rect/i);
    });

    // The claim above has to stay true of the code: the attribute must not come back.
    it('no source in core or ui sets aria-grabbed', () => {
        for (const file of ['core/src/component/drag.ts', 'ui/src/sortable-list/pdx-sortable-list.ts']) {
            const source = readFileSync(join(ROOT, ...file.split('/')), 'utf8');
            expect(source.includes("setAttribute('aria-grabbed'"), `${file} sets aria-grabbed again`)
                .toBe(false);
        }
    });

    // The destination shows what is held over it, and the feedback is configurable rather than
    // fixed. Two of the three defaults are
    // decisions a reader will otherwise undo, so the page has to carry the reason with them.
    it('the page says what the destination shows, and why the line is opt-in', () => {
        const text = page('composables.md');
        expect(text, 'the attribute the design system paints is unnamed')
            .toContain('data-pdx-drop');
        expect(text, 'the page does not say why a line is not always right')
            .toMatch(/relative placement/i);
        expect(text, 'the page does not say a refusing zone says so')
            .toMatch(/refuses says so|isRejected/);
    });

    it('and repeats why the highlight is not a background', () => {
        // Measured: the showcase's kanban column sets `background` in an unlayered `<style
        // scoped>`, which beats every layer. A future simplification to `background` would be
        // silently cancelled by any app that styles its own drop target.
        expect(page('composables.md'), 'the page does not warn that a background highlight is cancellable')
            .toMatch(/never a background|unlayered/i);
    });

    it('and its warning about `group` is still true of the source', () => {
        const source = readFileSync(join(ROOT, 'core', 'src', 'component', 'sortable.ts'), 'utf8');
        const stillMissing = source.includes('is not implemented yet');
        const pageSaysSo = /`group`[^|]*not implemented/.test(page('composables.md'));
        expect(pageSaysSo, stillMissing
            ? 'useSortable still warns that `group` is not implemented, and the page no longer says so'
            : '`group` is implemented now — the page still calls it a no-op').toBe(stillMissing);
    });
});

// ─── Composables the site only lists ─────────────────────────────────────────────
//
// A `use*` function named by no narrative page — `useQuery`, `useStorage`, the whole drag-and-drop
// family — is reachable only by scrolling the generated `api.md`, which mentions every export by
// construction — so the surface looks documented and is not.
//
// The scan is shared rather than rebuilt here, so the one a person runs
// (`node tools/docs/composables-scan.mjs --all`) and the one the gate runs are the same code.
import { scan as composablesScan, composables, INTERNAL } from '../../../tools/docs/composables-scan.mjs';

describe('the composables the site teaches', () => {
    it('finds composables to check at all', () => {
        // A scan over an empty surface would satisfy the assertion below without teaching anything.
        expect((composables() as Map<string, unknown>).size, 'the scan found no use* exports')
            .toBeGreaterThan(20);
    });

    it('names every composable that is not deliberately internal', () => {
        const { missing } = composablesScan() as { missing: string[] };
        expect(missing, 'these are exported and named by no narrative page').toEqual([]);
    });

    it('keeps no internal entry for a composable that no longer exists', () => {
        const surface = composables() as Map<string, unknown>;
        const stale = Object.keys(INTERNAL as Record<string, string>).filter(n => !surface.has(n));
        expect(stale, 'the internal list excuses composables the package does not export').toEqual([]);
    });

    it('gives every internal entry a reason, since that list is what says "not for you"', () => {
        const reasons = Object.entries(INTERNAL as Record<string, string>);
        expect(reasons.length, 'nothing is marked internal — the scan would be vacuous the other way')
            .toBeGreaterThan(0);
        for (const [name, why] of reasons) {
            expect(why.length, `${name} is excluded with no reason given`).toBeGreaterThan(30);
        }
    });
});

// ─── How much of the surface the site teaches ────────────────────────────────────
//
// The count of exported functions named by no narrative page is not a target and closing it to zero would be the wrong goal: much of what it counts is machinery no
// reader should meet, and a SMALLER public surface is the better fix for those. What it is, is a
// ratchet — the same shape `docs-language.test.ts` uses for the Italian count.
//
// Raising the ceiling is allowed and must be argued for in the commit that raises it: a new export
// that no page names is a promise nobody explained. Lowering it is free and should happen whenever a
// page is written or an export is withdrawn.
import { scan as surfaceScan, publicFunctions } from '../../../tools/docs/surface-scan.mjs';

describe('the public surface the site teaches', () => {
    // The measured count. A data-layer function that exists, works and is named by no page —
    // `httpResource`, `resourceWhen`, `setDefaultCache`, `createVirtualizer` — reads to anyone with
    // only the site as a capability the framework does not have.
    const CEILING = 127;

    it('finds a surface to measure', () => {
        expect((publicFunctions() as Map<string, unknown>).size, 'the scan found no exported functions')
            .toBeGreaterThan(300);
    });

    it('does not grow the set of functions no page names', () => {
        const { missing, total } = surfaceScan() as { missing: string[]; total: number };
        expect(missing.length, `${missing.length} of ${total} exported functions are named by no page`)
            .toBeLessThanOrEqual(CEILING);
    });

    it('holds the ceiling against the real number, not a stale one', () => {
        // A ceiling left far above the measurement stops being a ratchet and becomes decoration.
        // Ten is the slack: close a page's worth of names and the ceiling comes down with it.
        const { missing } = surfaceScan() as { missing: string[] };
        expect(CEILING - missing.length,
            `the ceiling is ${CEILING} and the count is ${missing.length} — lower the ceiling`)
            .toBeLessThanOrEqual(10);
    });
});

// ─── testing.md teaches an API that exists ───────────────────────────────────────
//
// The page's first example has to run. Measured against the source, the shapes a reader expects:
//
//   mount('pdx-counter', { start: 0 })   →  mount(html: string): Promise<HTMLElement>
//                                            an HTML STRING, and it is async
//   fireEvent.click(el)                  →  fireEvent(el, eventName, detail?)
//                                            a function, with no .click on it
//   waitFor(assertion)                   →  waitFor(condition: () => boolean, timeout?)
//                                            a boolean condition, not a retried assertion
//
// A reader who copies the wrong shape gets `undefined is not a function` on line two. The
// identifiers are all real, which is why the import guard above says nothing about it — the
// SHAPES are what can be invented. So the shapes are what this asserts.
describe('the testing page teaches the API that exists', () => {
    const page = readFileSync(join(ROOT, 'site', 'content', 'docs', 'testing.md'), 'utf8');

    it('does not call fireEvent as an object of methods', () => {
        expect(page, 'fireEvent has no .click/.input: it is fireEvent(el, name, detail?)')
            .not.toMatch(/fireEvent\.\w+\(/);
    });

    it('does not pass a tag and a props object to mount', () => {
        expect(page, "mount takes an HTML string: mount('<pdx-counter start=\"0\"></pdx-counter>')")
            .not.toMatch(/mount\(\s*['"]pdx-/);
    });

    it('awaits mount, which is async', () => {
        const calls = [...page.matchAll(/(await\s+)?mount\(/g)];
        expect(calls.length, 'the page no longer shows mount at all').toBeGreaterThan(0);
        expect(calls.filter(m => !m[1]), 'a mount() that is not awaited returns a Promise, not an element')
            .toEqual([]);
    });

    it('shows the queries, which are the point of having a container', () => {
        for (const q of ['getByRole', 'queryByRole', 'findByText', 'getByTestId']) {
            expect(page, `${q} is exported from @pdxui/core/testing and the page never names it`)
                .toContain(q);
        }
    });
});

// ─── theming.md and the claim that was measured false ────────────────────────────
//
// "In dark the primaries brighten slightly to stay readable" is measured false: brightening them
// takes white-on-primary to 2.44–3.19:1 in ten of the thirteen themes. `--pdx-color-primary` is a single value, not a `light-dark()` pair, and it is
// single BECAUSE the white label caps its lightness in either scheme.
//
// The code side already has its guard (`cli/tests/theme-contrast-shipped.test.ts` fails a theme that
// declares tokens per scheme). This one watches the prose, and the prose is what a reader acts on.
describe('the theming page states the scheme rule the themes follow', () => {
    const page = readFileSync(join(ROOT, 'site', 'content', 'docs', 'theming.md'), 'utf8');
    const THEMES = join(ROOT, 'design', 'src', 'themes');

    /** Whether a theme declares a token as a `light-dark()` pair. */
    const varies = (css: string, token: string): boolean =>
        [...css.matchAll(new RegExp(`--pdx-color-${token}:\s*([^;]+);`, 'g'))]
            .some(m => m[1].includes('light-dark('));

    it('the premise: a fill and its label move together, or neither moves', () => {
        // Not that NO theme varies its primary by scheme. `editorial` does — a near-black blue in light, a pale gold in
        // dark — and it is not a violation: it flips the LABEL with it. That is the real invariant,
        // and a theme that moved only the fill would ship a label nobody can read.
        const broken = readdirSync(THEMES).filter(f => f.endsWith('.css')).filter(f => {
            const css = readFileSync(join(THEMES, f), 'utf8');
            return varies(css, 'primary') !== varies(css, 'primary-text');
        });
        expect(broken, 'a theme varies its primary fill or its label by scheme without the other')
            .toEqual([]);
    });

    it('names the theme that is the exception, so the rule is not read as absolute', () => {
        const exceptions = readdirSync(THEMES).filter(f => f.endsWith('.css'))
            .filter(f => varies(readFileSync(join(THEMES, f), 'utf8'), 'primary'))
            .map(f => f.replace('.css', ''));
        for (const name of exceptions) {
            expect(page, `${name} varies its primary by scheme and theming.md does not mention it`)
                .toContain(name);
        }
    });

    it('does not say the primaries brighten in dark', () => {
        expect(page, 'the claim measured and rejected is back on the page')
            .not.toMatch(/primaries?\s+(brighten|lighten)/i);
    });

    it('states the rule, so the section is not merely silent', () => {
        // Whitespace-tolerant: the sentence is wrapped in the source, as every sentence there is.
        expect(page.replace(/\s+/g, ' '), 'the page no longer states what the scheme does to the primary')
            .toMatch(/a fill and\W*its label move together, or neither moves/i);
    });
});

// ─── the data page teaches the three capabilities that were invisible ────────────
//
// **Polling**, **optimistic writes with rollback** and an **offline queue** exist and work. Named by
// no narrative page, they read as missing — to an agent with every file in front of it, and to a
// developer with only the site, who would write their own.
//
// The offline queue is in `data.md`'s Offline section; polling and the rollback need naming too —
// the rollback is the half that makes an optimistic write safe.
//
// So these assert the SHAPE of each section, not its prose: a future edit may rewrite the wording
// and must not quietly drop the part that carries the risk.
describe('the data page teaches polling, the rollback, and the offline queue', () => {
    const page = readFileSync(join(ROOT, 'site', 'content', 'docs', 'data.md'), 'utf8');
    const flat = page.replace(/\s+/g, ' ');

    it('names refetchInterval, which lived only in the generated reference', () => {
        expect(page, 'polling is the option nothing outside api.md mentioned').toContain('refetchInterval');
    });

    it('says what a hidden tab does — which is no longer what it did', () => {
        // The polling pauses while the tab is hidden, and the sentence follows the code. What must
        // never go missing is the answer to "what happens in a background tab", in either
        // direction.
        expect(flat, 'the page does not say what a hidden tab does, which is the thing that bites')
            .toMatch(/hidden tab is not polled|pauses while/i);
        // And the exception, which is the half a reader acts on: with refetchOnFocus off there is
        // no catch-up, so the pause would silently freeze the data.
        expect(flat, 'the page does not say what the pause costs an app with refetchOnFocus off')
            .toMatch(/turned `refetchOnFocus` \*\*off\*\*/i);
    });

    // Two behaviours a reader cannot guess. The page states them, and the two lines below are what stops a rewrite from dropping either.
    it('says a tick is skipped while the last refetch is still in flight', () => {
        expect(flat, 'overlap is unstated: a slow endpoint under a fast interval is a trap')
            .toMatch(/still in flight/i);
    });

    it('says a query inside a component does not need dispose(), and one outside does', () => {
        expect(flat, 'the page still tells everyone to call dispose() by hand')
            .toMatch(/torn down with the component|ownership scope/i);
        expect(flat, 'the page does not say when dispose\(\) IS the only thing that stops it')
            .toMatch(/module level/i);
    });

    it('names rollback, and what a failed optimistic write restores', () => {
        expect(page, 'rollback: 0 hits outside the sources is what opened this issue')
            .toContain('rollback');
        // The detail that is easy to lose in a rewrite and expensive to rediscover: a key
        // that did not exist before is REMOVED on rollback rather than set to undefined, because
        // an entry holding undefined is a cache hit a later read would trust.
        expect(flat, 'the page does not say what happens to a key that did not exist before')
            .toMatch(/did not exist|no entry|removed rather than/i);
    });

    it('keeps the offline section, and its order guarantee', () => {
        expect(page, 'the offline section is gone').toContain('offlineMiddleware');
        expect(flat, 'the order guarantee is the reason a queue is safe to have at all')
            .toMatch(/in order|FIFO|sequential/i);
    });

    it('says what the queue does across a reload, rather than leaving it to be assumed', () => {
        // In memory by default; `persist: true` keeps it in IndexedDB. Both halves matter: an app
        // that assumed the wrong one loses writes on a refresh and never finds out.
        expect(page, 'persist is what survives a reload, and the page never mentions it')
            .toContain('persist');
        expect(flat, 'the page does not say what the DEFAULT does across a reload')
            .toMatch(/in memory|lost on a reload|does not survive/i);
    });

    // A replay run only from the `online` event never sends a `persist: true` queue: a page that
    // loads already-online never sees that event. The trigger the replay runs from is specific
    // enough to be worth writing down — a reader who assumes "on load" will be wrong about an app
    // that makes no request.
    it('says WHEN a restored queue goes out, not just that it survives', () => {
        expect(flat, 'the page does not say what triggers the replay after a reload')
            .toMatch(/first call the app makes|first request/i);
        expect(flat, 'the page does not say the first call waits for the backlog')
            .toMatch(/waits for the backlog|queues behind/i);
    });

    it('names the limit that is still a bug, rather than leaving it to be met', () => {
        expect(flat, 'a mutation issued during a drain can overtake the queue — unstated')
            .toMatch(/while a replay is already in flight|during the drain/i);
    });

    it('says the offline claims are measured against a real network drop', () => {
        // A unit test that runs past a getter the test itself wrote never has a request fail. A page that repeats the claims without saying where
        // they come from is the same problem one level up.
        expect(page, 'the page does not point at the spec that measures any of this')
            .toContain('offline-queue.spec.ts');
    });
});

// ─── the long-list section keeps its number and its costs ───────────────────────
//
// `createVirtualizer` exists and the grid has a windowing implementation of its own; seen only in the
// generated reference, they read as a framework that cannot render a long list. A page about performance with no number in it is an
// opinion, so the section quotes a measurement this repository takes
// (`virtual-rows.spec.ts`: 15 row elements at 200, 5 000 and 50 000 rows), and states what
// turning virtualisation on costs. Both halves are easy to lose in a rewrite.
describe('the data page says what a long list costs', () => {
    const page = readFileSync(join(ROOT, 'site', 'content', 'docs', 'data.md'), 'utf8');
    const flat = page.replace(/\s+/g, ' ');

    it('names the primitive and the grid option', () => {
        expect(page, 'createVirtualizer is the name a reader greps for').toContain('createVirtualizer');
        expect(page, 'the grid opt-in is what most readers actually need').toContain('virtual-scroll');
    });

    it('quotes a measured number rather than an adjective', () => {
        expect(flat, 'the section no longer carries the measurement that makes it more than an opinion')
            .toMatch(/50 000|50,000/);
        expect(flat, 'the count of rendered elements — the thing that does NOT grow — is gone')
            .toMatch(/15 row elements/);
    });

    it('says the row height is fixed, which is what a reader will hit first', () => {
        expect(flat, 'fixed row height is the first thing that stops working').toMatch(/row height is fixed/i);
    });

    it('keeps the costs, not just the capability', () => {
        // A section that sells the feature and hides its price is the kind of documentation that
        // sends someone to read the sources.
        for (const [what, re] of [
            ["the browser's find", /Ctrl\+F/i],
            ['printing', /print/i],
            ['disposal', /dispose\(\)/],
        ] as const) {
            expect(flat, `${what} is no longer named among the costs`).toMatch(re);
        }
    });
});
