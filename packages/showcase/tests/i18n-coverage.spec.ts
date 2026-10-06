/**
 * Every library namespace this app can reach is translated.
 *
 * `i18n.spec.ts` asserts that a locale switch moves the library's registry too, but it checks ONE
 * string: it stays green with most of the library's namespaces still English, as long as that one
 * string is translated. A pair-assertion whose second half is sampled, not covered, passes on the
 * very failure it exists to stop.
 *
 * So this file does not sample. It derives the inventory:
 *
 *   · what the pages RENDER — every `pdx-*` element in the DOM of every route, which is the only
 *     way to see the components a component renders inside itself (`<pdx-pagination>` is nobody's
 *     template here, it is the grid's);
 *   · what the pages WRITE — every `<pdx-*` in `src/**\/*.pdx`, which is the only way to see the
 *     ones behind a click, a dialog or a `@defer`.
 *
 * The union, mapped to namespaces, intersected with the namespaces the library actually
 * registers. Anything left has to be in `it.components.json`, and the failure names it.
 *
 * It keeps working: a page that starts using `<pdx-toast>` fails here until the toast is
 * translated, which is the difference between a guard and a one-off.
 */
import { test, expect, type Page } from '@playwright/test';
import { pickLocale } from './locale';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import itComponents from '../src/locales/it.components.json' with { type: 'json' };

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(packageDir, '..', '..');

/** Every route the app answers, from the `@page` runes. Kept here because the list is short and
 *  a wrong one fails loudly: an unrouted path renders the 404 and contributes no tags. */
/** What says a route has rendered: the shell's bar, or — on the sign-in, which has none — its panel. */
const shellOrSignIn = (page: Page) => page.locator('pdx-app .app-bar, [data-test="login"]').first();

const ROUTES = [
    '/', '/tickets', '/tickets/1', '/tickets/1/billing',
    '/tickets/1/interventions/2', '/intake', '/board', '/login',
];
// `/account` is NOT here and cannot be: it is `@guard`ed, so a visitor with no session is sent to
// the login and the pass would render that page twice. Its tags are covered by the source half
// below, which reads every `<pdx-*` written in `src/**/*.pdx` for exactly this kind of page.

/** The tags this app defines itself — pages and the shell. They have no library strings. */
const OWN = new Set(['app', 'dashboard', 'tickets', 'ticket', 'intervention', 'intake', 'board',
    'billing', 'login', 'account']);

/** Tags whose strings are registered under a different name than the tag. */
const NAMESPACE_OF: Record<string, string> = {
    // The outlet renders the router's own copy — "404 · Page not found" — and the router
    // registers it as `router`, not `router-outlet`.
    'router-outlet': 'router',
};

/**
 * Every source file of `@pdxui/ui`.
 *
 * Every file, not only `shared/i18n.ts` and `data-grid/grid-i18n.ts`: a component that calls
 * `registerComponentStrings` in its OWN file — the wizard's «Back / Next», the field list's «No
 * items», the date and time pickers — would otherwise be invisible to the scan, and reach Italian
 * screens in English with this suite saying nothing.
 */
function uiSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.ts')) out.push(full);
        }
    };
    walk(join(repoRoot, 'packages/ui/src'));
    return out;
}

/**
 * The namespaces `@pdxui/ui` registers, read from every file that registers one.
 *
 * Parsed rather than imported: the module pulls in `@pdxui/core` and this suite has no
 * bundler. That file exists to BE this list — `core/tests/i18n-no-literal-strings.test.ts` fails
 * when a string is written anywhere else — so the coupling is to a list, not to an implementation.
 * The count is asserted below, so a regex that stops matching fails here instead of passing.
 */
function registeredNamespaces(): Set<string> {
    const found = new Set<string>();
    // The shared TABLE is a namespace per four-space key — a shape that means that only in this file:
    // read everywhere, it took any object literal's key (`link: {` in the rich-text schema) for a
    // namespace.
    const table = readFileSync(join(repoRoot, 'packages/ui/src/shared/i18n.ts'), 'utf8');
    for (const m of table.matchAll(/^ {4}'?([a-z][a-z0-9-]*)'?:\s*\{/gm)) found.add(m[1]);
    // Every `registerComponentStrings('ns', …)`, in whichever file makes it.
    for (const file of uiSources()) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(/registerComponentStrings\(\s*'([a-z][a-z0-9-]*)'/g)) found.add(m[1]);
    }
    // `shared` is the bag of strings several components borrow, not a component.
    found.delete('shared');
    return found;
}

/**
 * Every `<pdx-*` written in the app's own templates — the ones a `@defer` or a branch hides.
 *
 * Comments are stripped first, and that is not tidiness: `app.pdx` explains in a comment why the
 * language switcher is a native `<select>` and not a `<pdx-select>`, and counting that sentence
 * made `select` look reachable for the wrong reason. It IS reachable, through the edit drawer —
 * which is why the browser pass below opens it.
 */
function tagsWrittenInSources(): Set<string> {
    const out = new Set<string>();
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.pdx')) {
                const src = readFileSync(full, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
                for (const m of src.matchAll(/<pdx-([a-z0-9-]+)/g)) out.add(m[1]);
            }
        }
    };
    walk(join(packageDir, 'src'));
    return out;
}

const tagsRendered = (page: Page) => page.evaluate(() => [...new Set(
    [...document.querySelectorAll('*')]
        .map(el => el.tagName.toLowerCase())
        .filter(tag => tag.startsWith('pdx-')))]);

/**
 * Everything this app can put on screen, as namespaces.
 *
 * The routes, plus ONE interaction: the tickets page's New button. It is here rather than in a
 * list of gestures because a drawer is where the components behind a click live — the select, the
 * drawer itself, the form template — and a suite that only ever looks at an idle page reports
 * that an app renders nine components when it renders fifteen.
 */
async function reachableNamespaces(page: Page): Promise<Set<string>> {
    const tags = tagsWrittenInSources();
    for (const route of ROUTES) {
        await page.goto(route);
        // The shell is enough: the outlet has rendered the page by the time it is visible, and a
        // per-route wait on page content would be a second list to keep in step with this one.
        // The sign-in has no shell, so its own panel stands in for it there.
        await expect(shellOrSignIn(page)).toBeVisible();
        for (const tag of await tagsRendered(page)) tags.add(tag.replace(/^pdx-/, ''));
    }

    await page.goto('/tickets');
    await page.locator('[data-test="new"] button').click();
    await expect(page.locator('[data-test="create-dialog"] .pdx-dialog-panel')).toBeVisible();
    for (const tag of await tagsRendered(page)) tags.add(tag.replace(/^pdx-/, ''));

    return new Set([...tags].filter(tag => !OWN.has(tag)).map(tag => NAMESPACE_OF[tag] ?? tag));
}

test('every library namespace the showcase can reach is translated into Italian', async ({ page }) => {
    const registered = registeredNamespaces();
    expect(registered.size, 'the namespace list came back too small — has the source file moved?')
        .toBeGreaterThan(50);

    const reachable = [...await reachableNamespaces(page)].filter(ns => registered.has(ns)).sort();
    expect(reachable.length, 'no library component was found on any route — did the app render?')
        .toBeGreaterThan(5);

    const missing = reachable.filter(ns => !(ns in itComponents));
    expect(missing,
        `these library namespaces are on screen and untranslated: ${missing.join(', ')}`).toEqual([]);
});

/**
 * Every English default the library registers, as `namespace` → `key` → text.
 *
 * The same two files, read for their values this time. `grid-i18n.ts` registers its ~68 keys
 * through a `registerComponentStrings('data-grid', { … })` call rather than the shared table, so
 * both shapes are parsed.
 */
function englishDefaults(): Map<string, Record<string, string>> {
    const out = new Map<string, Record<string, string>>();
    const readObject = (src: string, at: number): Record<string, string> => {
        const start = src.indexOf('{', at);
        let depth = 0, end = start;
        for (; end < src.length; end++) {
            if (src[end] === '{') depth++;
            else if (src[end] === '}' && --depth === 0) { end++; break; }
        }
        const body = src.slice(start, end);
        const strings: Record<string, string> = {};
        for (const m of body.matchAll(/'?([A-Za-z][\w.-]*)'?:\s*'([^']*)'/g)) strings[m[1]] = m[2];
        return strings;
    };

    const shared = readFileSync(join(repoRoot, 'packages/ui/src/shared/i18n.ts'), 'utf8');
    for (const m of shared.matchAll(/^ {4}'?([a-z][a-z0-9-]*)'?:\s*\{/gm)) {
        out.set(m[1], readObject(shared, m.index!));
    }
    // Every `registerComponentStrings('ns', { … })`, in whichever file makes it.
    for (const file of uiSources()) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(/registerComponentStrings\(\s*'([a-z][a-z0-9-]*)'/g)) {
            out.set(m[1], { ...(out.get(m[1]) ?? {}), ...readObject(src, m.index!) });
        }
    }
    out.delete('shared');
    return out;
}

/** Every name the accessibility tree carries, which is where a library string almost always lands. */
const renderedNames = (page: Page) => page.evaluate(() => [...new Set(
    [...document.querySelectorAll('[aria-label], [title]')]
        .map(el => el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '')
        .filter(Boolean))]);

test('no library string is still in English on an Italian screen', async ({ page }) => {
    // The test above proves the NAMESPACE is present; this one proves the KEYS are right, and
    // they are two different things. `setLocaleStrings` accepts a key that matches nothing and
    // says nothing, so a dictionary can be complete by name and wrong by content, and the page goes
    // on showing English.
    //
    // A LIVE switch, and no reload: a component that writes a string into an attribute at mount
    // must re-read it when the locale changes — the breadcrumb's name turns from "Breadcrumb" into
    // "Percorso di navigazione" without a reload — and a reload would hide one that does not.
    const defaults = englishDefaults();
    const reachable = await reachableNamespaces(page);

    // Literals only: a default holding `{n}` never appears verbatim, and a two-letter one is as
    // likely to be a coincidence as a leak.
    const english = new Map<string, string>();
    for (const [ns, strings] of defaults) {
        if (!reachable.has(ns)) continue;
        for (const [key, text] of Object.entries(strings)) {
            if (!text.includes('{') && text.length >= 3) english.set(text, `${ns}.${key}`);
        }
    }
    expect(english.size, 'no English defaults were parsed — has the source file moved?')
        .toBeGreaterThan(40);

    await page.goto('/tickets');
    await expect(page.locator('pdx-app .app-bar')).toBeVisible();
    await pickLocale(page, 'it');
    await expect(page.locator('[data-test="tickets"] h1')).toHaveText('Ticket');
    // The dictionary is a CHUNK, and `<html lang>` is what says it has landed: both registries
    // hold Italian by the time it moves. Waiting on the app bar alone makes this test a race — it
    // reads the page in the window before the fetch resolves, and passes or fails by timing rather
    // than by the dictionary it is here to measure.
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');

    for (const route of ROUTES) {
        await page.goto(route);
        await expect(shellOrSignIn(page)).toBeVisible();
        await expect(page.locator('html'), 'the reload is still showing the dictionary it had')
            .toHaveAttribute('lang', 'it');
        // POLLED, because what is asserted is a STEADY state and the screen reaches it in steps.
        //
        // The dictionary arrives as a chunk, and a component that renders through an effect — the
        // data grid rebuilds its header in a `requestAnimationFrame` — turns Italian a frame after
        // `<html lang>` moves. Read once, `/intake`'s grid header is still English about one run in
        // four: a real window, and not the defect the test is for.
        // A string that is never translated still fails here, after the timeout.
        await expect.poll(async () => {
            const leaks = (await renderedNames(page))
                .filter((name) => english.has(name))
                .map((name) => `"${name}" (${english.get(name)})`);
            return [...new Set(leaks)];
        }, { message: `these library strings are still English on ${route}` }).toEqual([]);
    }
});

test('a validation message is in the page\'s language', async ({ page }) => {
    // «This field is required» under a field of an Italian form: the core's validators carry a key
    // and an English fallback, and only `setValidationLocale` gives them the page's locale.
    await page.goto('/intake');
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
    await pickLocale(page, 'it');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await page.locator('[data-wizard-next]').click();
    const error = page.locator('[data-test="intake"] .pdx-field-error').first();
    await expect(error, 'no validation message was shown to measure').toBeVisible();
    await expect(error).not.toHaveText(/This field is required/);
    await expect(error).toHaveText(/obbligatorio/i);
});

test('and nothing is translated that the app cannot show', async ({ page }) => {
    // The other direction, and it is the reason the dictionary is small on purpose: a namespace
    // nobody renders is a namespace nobody checks, and `setLocaleStrings` accepts a name that
    // matches no component in silence. Without this, the fix for the test above is to paste all
    // sixty-nine in and never find out which keys were guessed wrong.
    const registered = registeredNamespaces();
    const reachable = await reachableNamespaces(page);

    const unreachable = Object.keys(itComponents)
        .filter(ns => registered.has(ns) && !reachable.has(ns));
    expect(unreachable,
        `translated but never rendered — drop them or render them: ${unreachable.join(', ')}`).toEqual([]);
});

// ─── The app's own strings: every English key has an Italian one ─────────────
//
// The rows above cover the LIBRARY's namespaces. The app's dictionaries need the same guard: a key
// shipped in English only puts its English fallback on an Italian screen — in a tab's accessible
// name, say — and nothing else fails. Read from the files, so every section counts, whether or not
// a route here renders it.

const localesDir = join(packageDir, 'src', 'locales');
const flatKeys = (o: Record<string, unknown>, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flatKeys(v as Record<string, unknown>, p + k + '.') : [p + k]);
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

test('every English key of the app has an Italian one', () => {
    const english = new Set(flatKeys(readJson(join(localesDir, 'en.json'))));
    for (const file of readdirSync(join(localesDir, 'en'))) {
        for (const key of flatKeys(readJson(join(localesDir, 'en', file)))) english.add(key);
    }
    const italian = new Set(flatKeys(readJson(join(localesDir, 'it.json'))));
    expect(english.size, 'the premise: the English dictionaries were read').toBeGreaterThan(100);
    expect([...english].filter((k) => !italian.has(k)), 'English keys with no Italian').toEqual([]);
});
