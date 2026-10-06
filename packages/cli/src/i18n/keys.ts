// Shared i18n tooling helpers: scan source for $t() keys, load/flatten locale dictionaries.
// Used by the `pdx i18n` subcommands (extract / types / validate).

import fg from 'fast-glob';
import { readFileSync } from 'fs';
import { basename } from 'path';

/**
 * Match a `$t(` call whose first argument STARTS with a string literal.
 * Groups: [1] the quote, [2] the literal, [3] a `+` when the literal is concatenated with something.
 *
 * A key is only a key when the whole argument is that literal. `$t('nav.' + key)` and
 * `` $t(`nav.${key}`) `` compose one at runtime, and the literal is a PREFIX: recording it as a key
 * would report `nav.` as missing (it is not a key, so of course nothing translates it) and leave
 * every real `nav.*` entry among the orphans, because no static key names it.
 */
const T_CALL = /\$t\s*\(\s*(['"`])([^'"`]*)\1\s*(\+)?/g;

/** The keys and the prefixes a scan found, each mapped to the files it appears in. */
export interface UsedKeys {
    /** Whole-literal arguments: `$t('page.title')`. */
    keys: Map<string, Set<string>>;
    /** The literal part of a composed argument: `$t('nav.' + k)` → `nav.`. */
    prefixes: Map<string, Set<string>>;
}

/**
 * The component-string namespaces the library registers with `registerComponentStrings()`.
 *
 * They are NOT `$t` keys. `getComponentString('router', 'notFound')` reads a separate registry, set
 * with `setComponentStrings` / `setLocaleStrings`, and `$t('router.notFound')` renders the raw key —
 * on a 404 page, for instance. Two registries, easy to confuse when
 * the key exists in one of them, so a `$t` key under one of these namespaces is reported by name
 * instead of being counted as an ordinary missing translation.
 *
 * Kept in lockstep with the sources by `tests/i18n-component-namespaces.test.ts`.
 */
export const COMPONENT_STRING_NAMESPACES: readonly string[] = [
    'calendar', 'cascader', 'data-grid', 'date-picker', 'field-list', 'form', 'form-actions',
    'form-template', 'inline-edit', 'mention', 'router', 'select', 'time-picker', 'transfer',
    'tree-select', 'wizard',
];

/** Scan .pdx/.ts/.tsx under root for $t() arguments. */
export async function scanUsedKeys(root: string): Promise<UsedKeys> {
    const files = await fg(['**/*.{pdx,ts,tsx}'], {
        cwd: root,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/*.d.ts'],
    });
    const keys = new Map<string, Set<string>>();
    const prefixes = new Map<string, Set<string>>();
    const record = (map: Map<string, Set<string>>, value: string, file: string) => {
        const set = map.get(value) ?? new Set<string>();
        set.add(file);
        map.set(value, set);
    };
    for (const file of files) {
        let src: string;
        try { src = readFileSync(file, 'utf-8'); } catch { continue; }
        let m: RegExpExecArray | null;
        T_CALL.lastIndex = 0;
        while ((m = T_CALL.exec(src)) !== null) {
            const literal = m[2];
            const hole = literal.indexOf('${');
            if (hole >= 0) record(prefixes, literal.slice(0, hole), file);      // `nav.${k}`
            else if (m[3]) record(prefixes, literal, file);                     // 'nav.' + k
            else record(keys, literal, file);
        }
    }
    return { keys, prefixes };
}

/** What `validate` reports for one dictionary. */
export interface ValidationReport {
    /** Used as a whole literal, absent from the dictionary. */
    missing: string[];
    /** In the dictionary, named by no key and covered by no prefix. */
    orphan: string[];
    /** Asked of `$t` but owned by the component-string registry — a different registry, not a gap. */
    componentStrings: string[];
    /** A composed key whose prefix matches no entry at all: it resolves to the raw key, every time. */
    unmatchedPrefixes: string[];
}

/** Compare what the source asks for with what one dictionary holds. */
export function buildReport(
    keys: Map<string, Set<string>>,
    prefixes: Map<string, Set<string>>,
    messages: Map<string, string>,
): ValidationReport {
    const present = new Set(messages.keys());
    const prefixList = [...prefixes.keys()];
    const covered = (key: string) => prefixList.some(p => key.startsWith(p));
    const ownedByComponentRegistry = (key: string) =>
        COMPONENT_STRING_NAMESPACES.includes(key.split('.')[0]);

    const absent = [...keys.keys()].filter(k => !present.has(k));
    return {
        missing: absent.filter(k => !ownedByComponentRegistry(k)).sort(),
        componentStrings: absent.filter(ownedByComponentRegistry).sort(),
        orphan: [...present].filter(k => !keys.has(k) && !covered(k)).sort(),
        unmatchedPrefixes: prefixList.filter(p => ![...present].some(k => k.startsWith(p))).sort(),
    };
}

export interface LocaleDictionary {
    locale: string;
    file: string;
    messages: Map<string, string>;
}

export interface DictionaryLoad {
    dictionaries: LocaleDictionary[];
    /** Files that failed to parse — surfaced so the caller can hard-fail (don't skip silently). */
    malformed: { file: string; error: string }[];
    /** The globs that were searched, so a miss can be explained instead of guessed. */
    searched: string[];
}

/**
 * Where a dictionary lives, by convention, in the order they are searched.
 *
 * There are three conventions: `translations/`, and the recipe's
 * `import it from './locales/it.json'` two lines above
 * `createI18nLoader({ basePath: '/locales' })` — which serves `public/locales/`. All three are
 * documented somewhere, so all three are searched, and `--dicts` overrides the lot.
 */
export const DEFAULT_DICT_GLOBS: readonly string[] = [
    'translations/*.json',
    'locales/*.json',
    'public/locales/*.json',
];

/**
 * Load locale dictionaries, flattening nested objects to dot keys.
 * Skips the extraction artifact `template.json`. The file's base name is the locale (en.json → en).
 * Parse failures are RETURNED (not swallowed) so `validate` can treat them as errors.
 */
export async function loadDictionaries(
    bases: string | string[],
    globs: readonly string[] = DEFAULT_DICT_GLOBS,
): Promise<DictionaryLoad> {
    const roots = (Array.isArray(bases) ? bases : [bases]).filter((b, i, all) => all.indexOf(b) === i);
    const dictionaries: LocaleDictionary[] = [];
    const malformed: { file: string; error: string }[] = [];
    const searched: string[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
        for (const glob of globs) searched.push(`${root}/${glob}`);
        const files = await fg([...globs], { cwd: root, absolute: true, ignore: ['**/node_modules/**'] });
        for (const file of files) {
            if (seen.has(file)) continue;
            seen.add(file);
            const locale = basename(file, '.json');
            if (locale === 'template') continue;
            try {
                const json = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
                dictionaries.push({ locale, file, messages: flatten(json) });
            } catch (e) {
                malformed.push({ file, error: e instanceof Error ? e.message : String(e) });
            }
        }
    }
    return { dictionaries, malformed, searched };
}

/** Flatten a nested message object to a flat Map of dot-notation keys → string values. */
export function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
    const out = new Map<string, string>();
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            for (const [nk, nv] of flatten(v as Record<string, unknown>, key)) out.set(nk, nv);
        } else {
            out.set(key, String(v));
        }
    }
    return out;
}

/** Build a nested object from sorted dot-notation keys (leaf value = ''). For extract templates. */
export function nestKeys(keys: string[]): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    for (const key of [...keys].sort()) {
        const parts = key.split('.');
        let cur = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
            cur = cur[parts[i]] as Record<string, unknown>;
        }
        cur[parts[parts.length - 1]] = '';
    }
    return root;
}
