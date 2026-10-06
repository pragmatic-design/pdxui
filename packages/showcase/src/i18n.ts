// The showcase speaks two languages, and both registries move.
//
// `docs/i18n.md` calls this "the single most confusable thing on the page", and it is right: there
// are TWO dictionaries and `$t` reaches only one of them.
//
//   - the APP's own copy — `$t('tickets.title')` — loaded with `loadTranslations`;
//   - the LIBRARY's own — «Save», «Cancel», «No items», «404 · Page not found» — which live in a
//     separate registry and are written with `setLocaleStrings`.
//
// A reference application that translates the first and leaves the second in English has
// translated half a screen, and that half is the half a reader notices. So both are here, and
// `tests/i18n.spec.ts` asserts both in one assertion.
//
// Two dictionaries, and only the one the visitor is reading is in the first download. English is
// eager because it is the default — the first screen must not flash untranslated copy — and Italian
// is one `import()` away. The `@i18n` rune's `mode: 'static'` path is not the shape used here: it
// is a `/* @vite-ignore */` dynamic import, which produces no chunk at all in a production build.

import { initI18n, loadTranslations, setLocale, getLocale, setLocaleStrings, setValidationLocale, $t, signal } from '@pdxui/core';
import en from './locales/en.json';
import { EAGER, sectionsFor } from './locales/sections';

/**
 * The locales this app offers, what to call them in their own language, and their code. No flags:
 * a language is not a country.
 */
export const LOCALES = [
    { value: 'en', label: 'English', code: 'EN' },
    { value: 'it', label: 'Italiano', code: 'IT' },
] as const;

/** «English · EN»: how a language names itself wherever it is offered. */
export function localeName(value: string): string {
    const l = LOCALES.find(x => x.value === value) ?? LOCALES[0];
    return `${l.label} · ${l.code}`;
}

/**
 * The language control's entries, one radio per locale, each in its own language and marked so
 * (`lang`, WCAG 3.1.2). The same entries in the guest bar, on the sign-in and in the profile menu's
 * Settings — a third locale is one line in `LOCALES`.
 */
export function localeItems(current: string) {
    return LOCALES.map(l => ({
        key: l.value, type: 'radio', radioGroup: 'locale', lang: l.value,
        label: localeName(l.value), checked: l.value === current,
    }));
}

/**
 * Italian: `src/locales/it.json` for the app's copy, `src/locales/it.components.json` for the
 * library's, both behind `src/locales/it.ts` so one request brings both.
 *
 * JSON files beside each other and not consts in this file, for two reasons. They are DATA — a
 * translator opens a locale file, not a module. And `docs-language.test.ts` reads every tracked
 * `.ts` for Italian prose: a translation table written in TypeScript trips it, correctly, because
 * from the outside it is indistinguishable from an Italian comment.
 *
 * The components' dictionary holds only the strings this app can actually show: one that guesses at
 * components nobody renders is one nobody checks. The INVENTORY is not hand-kept, because a
 * hand-kept one misses namespaces and leaves a select's "No results", a breadcrumb's name and
 * dozens of grid strings in English: `tests/i18n-coverage.spec.ts` derives it from what the pages
 * render plus what they write, and fails naming what is missing. Its second test fails the other way, on a namespace
 * translated here that nothing renders. The keys are the ones the components actually read, copied
 * from where they are registered — `packages/ui/src/shared/i18n.ts`, `data-grid/grid-i18n.ts`,
 * `inline-edit`, and the router's `outlet.ts` — because a guessed key does not fail:
 * `setLocaleStrings` accepts it and the component goes on showing English.
 *
 * **Fetched, not eager.** Eager, it puts 12.6 KB of raw JSON in the entry for a language the
 * visitor may never ask for: fetched, the entry is **31.1 KB** gzipped instead of 34.6, under the
 * ceiling in `bundle-budget.spec.ts`. It works because a locale installed after a component is on
 * screen reaches it: a component that has already mounted re-reads the registry.
 */
let _italian: Promise<typeof import('./locales/it').default> | null = null;

/**
 * True once the active locale's strings are installed — what the shell waits for before it renders
 * a page.
 *
 * The invariant is "the active locale's strings, before the first page renders", and components
 * depend on it: one that writes a name into an attribute at mount keeps what it was born with. The
 * LIBRARY's own strings are re-read, and that is not all of it — a wizard step labelled
 * `:data-label="$t(…)"` is the app's copy reaching an imperative element, and the stepper is built
 * once.
 *
 * So with the second locale fetched the invariant is kept rather than chased component by
 * component: the shell holds the outlet until this is true. For the default
 * locale it is true in a microtask and nothing is delayed; for the other one it costs the chunk's
 * round-trip, which is the price of not painting a screen in the wrong language.
 */
export const localeReady = signal(false);

/** Fetched once: a second switch back to Italian re-uses the promise, not the request. */
function italian() {
    _italian ??= import('./locales/it').then((m) => m.default);
    return _italian;
}

/** Call once, before the first page renders. Resolves when the active locale is on screen. */
export function setupI18n(): Promise<void> {
    loadTranslations('en', en);
    // `detect` reads the browser; `persist` remembers the visitor's choice across reloads. Both are
    // what an application wants and neither is the default.
    initI18n({ locales: LOCALES.map(l => l.value), default: 'en', detect: true, persist: true });
    // `getLocale()` returns the SIGNAL, not the string — it is `getLocale()()` that reads it.
    return applyComponentStrings(getLocale()());
}

/**
 * Move the LIBRARY's registry to match. `$t` cannot do this, which is the whole point of the
 * warning in the docs, so the switcher calls it and so does the setup above.
 */
export async function applyComponentStrings(locale: string): Promise<void> {
    if (locale.startsWith('it')) {
        // English is what the components registered themselves, so there is nothing to override —
        // and clearing would be wrong: it would also drop anything else the app had set.
        //
        // Both registries move on the same promise: `$t`'s and the library's. The strings reach
        // what is already on screen by themselves, so the switcher does not wait — but
        // it is awaitable, and `<html lang>` below is what says the wait is over.
        const { app, components } = await italian();
        loadTranslations('it', app as Parameters<typeof loadTranslations>[1]);
        setLocaleStrings(components);
    }
    // The THIRD registry: the core's validators carry a key (`validation.required`) and an English
    // fallback, and resolve through whatever `setValidationLocale` was given — given nothing,
    // «This field is required» stands under the fields of an Italian form. The app's
    // dictionary answers; a key it does not hold (`$t` returns the key itself) falls back to the
    // validator's English, which is why English needs no entries. Set again on every switch: it is
    // what tells the fields already on screen to resolve their message again.
    setValidationLocale((key, params) => {
        const text = $t(key, params);
        return text === key ? undefined : text;
    });
    localeReady.set(true);
    // The language the page is ACTUALLY in, for a screen reader and for anything that asks.
    //
    // `index.html` hard-codes `lang="en"`, and left there an Italian screen announces itself as
    // English — in its own right a defect, and here also the one honest signal that the
    // dictionary has landed: the second locale is FETCHED, and between
    // the first paint and its arrival the library's strings are still the English the components
    // registered with. Set last, once both registries hold the locale.
    document.documentElement.lang = locale;
}

// ─── A screen's strings travel with the screen ──────────────────────
//
// `en.json` holds the SHELL's section and the LANDING route's, and nothing else: those two are on
// screen before any fetch could answer, so they are the two that would flash their keys. Every
// other section is one `import()` away, asked for by the route that reads it.
//
// The loaders are written OUT, one line each, because Vite resolves `import()` statically: a
// computed path — `import('./locales/en/' + name + '.json')` — is either a glob of everything or
// nothing at all, and neither is a chunk per screen.
//
// ITALIAN is whole: `it.ts` is one barrel behind one `import()`, so a visitor who
// switches gets every section in one request. The asymmetry is deliberate — English is the
// FALLBACK locale, so a missing English section shows as keys in BOTH languages, while a missing
// Italian one shows as English. Only the first is a bug, and only the first is split.
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
    account: () => import('./locales/en/account.json'),
    assets: () => import('./locales/en/assets.json'),
    attachments: () => import('./locales/en/attachments.json'),
    billing: () => import('./locales/en/billing.json'),
    board: () => import('./locales/en/board.json'),
    contracts: () => import('./locales/en/contracts.json'),
    customers: () => import('./locales/en/customers.json'),
    employees: () => import('./locales/en/employees.json'),
    import: () => import('./locales/en/import.json'),
    intake: () => import('./locales/en/intake.json'),
    intervention: () => import('./locales/en/intervention.json'),
    login: () => import('./locales/en/login.json'),
    services: () => import('./locales/en/services.json'),
    settings: () => import('./locales/en/settings.json'),
    sites: () => import('./locales/en/sites.json'),
    ticket: () => import('./locales/en/ticket.json'),
    tickets: () => import('./locales/en/tickets.json'),
};

/** The sections already installed. The eager two are in from the first line of `setupI18n`. */
const loaded = signal<string[]>([...EAGER]);
/** One promise per section, so two routes asking at once make one request. */
const pending = new Map<string, Promise<void>>();

/**
 * Whether everything `path` reads is installed — reactive, and SYNCHRONOUS with the path.
 *
 * The shell reads this beside `localeReady` to decide whether to render the outlet. It has to
 * answer for the path as it is NOW rather than after a watcher has run: a gate that lags one tick
 * behind the navigation paints the new screen with the old screen's dictionary, which is the flash
 * this split exists to prevent.
 */
export function stringsReady(path: string): boolean {
    const have = loaded();
    return sectionsFor(path).every((name) => have.includes(name));
}

/** Fetch and install whatever `path` needs. Safe to call again: a section is fetched once. */
export async function ensureSections(path: string): Promise<void> {
    await Promise.all(sectionsFor(path).map((name) => {
        if (loaded.peek().includes(name)) return Promise.resolve();
        let p = pending.get(name);
        if (!p) {
            p = LOADERS[name]().then((m) => {
                // `loadTranslations` MERGES into the locale already in place and bumps its version,
                // so a section that lands after a component is on screen reaches it.
                loadTranslations('en', m.default);
                loaded.set((names) => (names.includes(name) ? names : [...names, name]));
            });
            pending.set(name, p);
        }
        return p;
    }));
}

/** The switcher's one action: both registries, in one call, so they cannot drift. */
export function switchLocale(locale: string): void {
    setLocale(locale);
    void applyComponentStrings(locale);
}
