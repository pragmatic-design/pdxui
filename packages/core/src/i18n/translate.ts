// i18n Translate — $t() function with ICU MessageFormat pluralization.
// Reads locale signal internally → auto-reactive in templates.
// Fallback chain: current locale → default locale → key as-is.

import { locale } from './locale';
import { signal } from '../reactivity/signal';

// ─── Types ─────────────────────────────────────────────────────────

type Messages = Record<string, string>;
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type PluralRule = (n: number) => PluralCategory;

// ─── Translation Store ─────────────────────────────────────────────

/** Flat messages keyed by locale: Map<locale, Map<dotKey, string>> */
const translations = new Map<string, Messages>();
let fallbackLocale = 'en';

/**
 * A version per locale, so a dictionary that arrives LATE reaches what already rendered.
 *
 * `$t` reads the locale — a signal — and then this Map, which is not one. Without a version it
 * would re-run when the locale changes and never when the dictionary does, and an application that
 * renders before its translations resolve would show raw keys (`app.name`, `app.nav.dashboard`)
 * until something else happened to move the locale.
 *
 * PER LOCALE and not one counter: loading Italian must not redraw an English screen. A single
 * version would invalidate every reader on every load, which is a correct render reached by
 * redrawing the application each time a locale file lands.
 */
const versions = new Map<string, ReturnType<typeof signal<number>>>();

function versionOf(loc: string): ReturnType<typeof signal<number>> {
    let v = versions.get(loc);
    if (!v) {
        v = signal(0);
        versions.set(loc, v);
    }
    return v;
}

/** Subscribe the caller to a locale's dictionary. Reading is the subscription. */
function trackDictionary(loc: string): void {
    versionOf(loc)();
}

/**
 * Load translations for a locale. Flattens nested objects to dot notation.
 * Can be called multiple times to merge translations.
 */
export function loadTranslations(loc: string, messages: Record<string, unknown>): void {
    const flat = flattenMessages(messages);
    const existing = translations.get(loc);
    if (existing) {
        Object.assign(existing, flat);
    } else {
        translations.set(loc, flat);
    }
    versionOf(loc).set(v => v + 1);
}

/** Set the fallback locale for missing keys. */
export function setFallbackLocale(loc: string): void {
    fallbackLocale = loc;
}

/** Get a raw translation string (no interpolation). Reactive: see {@link loadTranslations}. */
export function getTranslation(key: string, loc?: string): string | undefined {
    const l = loc ?? locale();
    trackDictionary(l);
    return translations.get(l)?.[key];
}

/** Clear all loaded translations (for testing). */
export function clearTranslations(): void {
    translations.clear();
    // Every reader has to be told, or a suite that clears between cases leaves the previous one's
    // strings on screen in the next.
    for (const v of versions.values()) v.set(n => n + 1);
}

// ─── Typed keys (augmentable) ──────────────────────────────────────

/**
 * Augmentable registry of message keys. The generated `i18n-keys.d.ts` (via `pdx i18n types`)
 * augments this interface with the project's keys; that turns $t() into a checked call that rejects
 * unknown keys at build time. Left empty here, so with no generated types $t() accepts any string.
 *
 * @example
 * // i18n-keys.d.ts (generated)
 * declare module '@pdxui/core' { interface PdxMessages { 'welcome': true; 'items': true } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty; augmented by generated i18n-keys.d.ts
export interface PdxMessages { }

/** Accepted key type for $t(): the union of declared keys, or `string` when none are declared. */
export type PdxMessageKey = keyof PdxMessages extends never ? string : keyof PdxMessages;

// ─── $t() — Main Translation Function ──────────────────────────────

/**
 * Translate a key with optional parameter interpolation and ICU plurals.
 * Reads the reactive locale signal — any computed/$effect calling $t() re-runs on locale change.
 *
 * @example
 * $t('welcome')                       // simple
 * $t('hello', { name: 'Alice' })      // interpolation
 * $t('items', { count: 5 })           // ICU plural
 */
export function $t(key: PdxMessageKey, params?: Record<string, unknown>): string {
    const currentLocale = locale();  // reactive read
    // …and the dictionary itself, which is the other half: BOTH the locale being read and the one
    // it falls back to, because either arriving late changes the answer.
    trackDictionary(currentLocale);
    if (currentLocale !== fallbackLocale) trackDictionary(fallbackLocale);
    let message = translations.get(currentLocale)?.[key];

    // Fallback to default locale
    if (message === undefined && currentLocale !== fallbackLocale) {
        message = translations.get(fallbackLocale)?.[key];
    }

    // Key not found → return key itself
    if (message === undefined) return key;

    return params ? formatMessage(message, params) : message;
}

/**
 * Format a message already in hand with the rules of `$t()`: ICU plural blocks for the current locale,
 * then `{name}` interpolation; a placeholder with no value stays as written. The component strings of
 * @pdxui/ui go through here, so a locale can pluralise "{count} selected".
 */
export function formatMessage(message: string, params: Record<string, unknown>): string {
    if (message.includes('{') && message.includes('plural,')) {
        message = processICU(message, params, locale());
    }
    return message.includes('{') ? interpolate(message, params) : message;
}

// ─── ICU MessageFormat (simplified) ─────────────────────────────────

/**
 * Process ICU plural/select syntax.
 * Supports: {count, plural, zero {none} one {# item} other {# items}}
 * Uses brace-counting to handle nested braces correctly.
 */
function processICU(message: string, params: Record<string, unknown>, loc: string): string {
    let result = '';
    let i = 0;

    while (i < message.length) {
        // Find start of ICU block: {varName, plural,
        const start = message.indexOf('{', i);
        if (start === -1) { result += message.slice(i); break; }

        // Check if this is an ICU plural block
        const afterBrace = message.slice(start + 1);
        const icuMatch = afterBrace.match(/^(\w+),\s*plural,\s*/);
        if (!icuMatch) {
            result += message.slice(i, start + 1);
            i = start + 1;
            continue;
        }

        result += message.slice(i, start);
        const varName = icuMatch[1];
        const rulesStart = start + 1 + icuMatch[0].length;

        // Count braces to find matching closing brace
        const rulesEnd = findClosingBrace(message, start);
        if (rulesEnd === -1) { result += message.slice(start); break; }

        const rulesStr = message.slice(rulesStart, rulesEnd);
        const n = Number(params[varName] ?? 0);
        const category = getPluralCategory(loc, n);
        const rules = parsePluralRules(rulesStr);

        // Try exact match first (=0, =1, =2), then category, then 'other'
        const exact = rules.get(`=${n}`);
        if (exact !== undefined) {
            result += exact.replace(/#/g, String(n));
        } else {
            const matched = rules.get(category) ?? rules.get('other') ?? '';
            result += matched.replace(/#/g, String(n));
        }

        i = rulesEnd + 1;
    }

    return result;
}

/** Find the closing brace matching the one at position `start`. */
function findClosingBrace(str: string, start: number): number {
    let depth = 0;
    for (let i = start; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

/** Parse ICU plural rules: "zero {none} one {# item} other {# items}" → Map */
function parsePluralRules(rulesStr: string): Map<string, string> {
    const rules = new Map<string, string>();
    // Match: keyword {content} — content can contain nested braces one level deep
    const regex = /(=\d+|\w+)\s*\{([^{}]*(?:\{[^}]*\}[^{}]*)*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(rulesStr)) !== null) {
        rules.set(m[1], m[2]);
    }
    return rules;
}

// ─── CLDR Plural Rules ─────────────────────────────────────────────

/** Plural rules for ~30 languages per CLDR. */
const pluralRules: Record<string, PluralRule> = {
    // Germanic/Romance: one vs other
    en: (n) => n === 1 ? 'one' : 'other',
    de: (n) => n === 1 ? 'one' : 'other',
    it: (n) => n === 1 ? 'one' : 'other',
    es: (n) => n === 1 ? 'one' : 'other',
    fr: (n) => n >= 0 && n < 2 ? 'one' : 'other',
    pt: (n) => n >= 0 && n < 2 ? 'one' : 'other',
    nl: (n) => n === 1 ? 'one' : 'other',
    sv: (n) => n === 1 ? 'one' : 'other',
    da: (n) => n === 1 ? 'one' : 'other',
    no: (n) => n === 1 ? 'one' : 'other',
    fi: (n) => n === 1 ? 'one' : 'other',
    el: (n) => n === 1 ? 'one' : 'other',
    hu: (n) => n === 1 ? 'one' : 'other',
    tr: (n) => n === 1 ? 'one' : 'other',
    ko: () => 'other',
    ja: () => 'other',
    zh: () => 'other',
    vi: () => 'other',
    th: () => 'other',
    id: () => 'other',
    ms: () => 'other',

    // Slavic: one/few/many/other
    pl: (n) => {
        const mod10 = n % 10, mod100 = n % 100;
        if (n === 1) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    },
    ru: (n) => {
        const mod10 = n % 10, mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    },
    uk: (n) => {
        const mod10 = n % 10, mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    },
    cs: (n) => {
        if (n === 1) return 'one';
        if (n >= 2 && n <= 4) return 'few';
        return 'other';
    },
    hr: (n) => {
        const mod10 = n % 10, mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'other';
    },

    // Arabic: zero/one/two/few/many/other
    ar: (n) => {
        if (n === 0) return 'zero';
        if (n === 1) return 'one';
        if (n === 2) return 'two';
        const mod100 = n % 100;
        if (mod100 >= 3 && mod100 <= 10) return 'few';
        if (mod100 >= 11 && mod100 <= 99) return 'many';
        return 'other';
    },

    // Celtic: one/two/few/many/other
    ga: (n) => {
        if (n === 1) return 'one';
        if (n === 2) return 'two';
        if (n >= 3 && n <= 6) return 'few';
        if (n >= 7 && n <= 10) return 'many';
        return 'other';
    },
};

/** Get CLDR plural category for a locale and number. */
function getPluralCategory(loc: string, n: number): PluralCategory {
    const base = loc.split('-')[0];
    const rule = pluralRules[base];
    return rule ? rule(Math.abs(n)) : (n === 1 ? 'one' : 'other');
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Simple interpolation: replace {key} and {0} with params. */
function interpolate(message: string, params: Record<string, unknown>): string {
    return message.replace(/\{(\w+)\}/g, (_, key: string) => {
        return params[key] !== undefined ? String(params[key]) : `{${key}}`;
    });
}

/** Flatten nested object to dot-notation: { a: { b: 'c' } } → { 'a.b': 'c' } */
function flattenMessages(obj: Record<string, unknown>, prefix = ''): Messages {
    const result: Messages = {};
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            Object.assign(result, flattenMessages(value as Record<string, unknown>, fullKey));
        } else {
            result[fullKey] = String(value);
        }
    }
    return result;
}
