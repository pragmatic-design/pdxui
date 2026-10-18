// One vocabulary for async state (#141): data(), error(), state(), pending(), stale().
//
// The alpha names leave the language: `isPending()` is `pending()`, which `pdx migrate` rewrites;
// `loading()`, `status()`, `isLoading()`, `hasData()`, `isStale()` and a comparison of `state()` with
// a removed value (`'loading'`, `'reloading'`, `'stale'`, `'local'`) have no one-word replacement —
// `loading()` is `state() === 'pending' && !data()` — so they are flagged. Only the names the file
// declares as an async source are looked at (`@fetch x`, `x = resource(…)`, `useQuery`,
// `httpResource`, `mutation`): a DataSource keeps its own `isLoading()`.
//
// A route loader's state changes words too, `'loading'` → `'pending'` and `'done'` → `'success'`:
// a comparison of `currentLoaderState()` or `loaderState(…)` with an old word still compiles and is
// never true, so it is a `changed` entry, rewritten.

import { escapeForRegExp } from '../compiler/regexp-escape';
import { parseSFC } from '../parser/sfc';
import type { LanguageChange, LanguageChangeFinding, LanguageChangeScope } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** The names `text` declares as an async source. */
function asyncSources(text: string): string[] {
    const names = new Set<string>();
    // Match: `@fetch users` — the declared name. Groups: [1]=the name
    for (const m of text.matchAll(/@fetch\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // Match: `const users = resource(` / `useQuery<T>(` / `httpResource(` / `mutation(`. Groups: [1]=the name
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:resource|useQuery|httpResource|mutation)\s*[<(]/g)) names.add(m[1]);
    return [...names];
}

/**
 * Every `name.<member>(` of an async source in `text`, for the members in `members`. In the `pdx`
 * scope only the template's are returned: the script of a .pdx is the `script` entries' (the
 * registry reads it for them), and a finding there would be reported twice. The sources are read
 * from the whole text either way — a template's are declared in its script.
 */
function memberCalls(text: string, members: string, scope: LanguageChangeScope): { index: number; found: string }[] {
    const out: { index: number; found: string }[] = [];
    let from = 0;
    let to = text.length;
    if (scope === 'pdx') {
        const template = parseSFC(text).template;
        if (!template || template.src) return [];
        from = template.start;
        to = template.start + template.content.length;
    }
    const inRange = (i: number) => i >= from && i < to;
    for (const name of asyncSources(text)) {
        // Match: `users.isPending(` — the source, a member of the list, the call. Groups: none
        for (const m of text.matchAll(new RegExp(`(?<![\\w$.])${escapeForRegExp(name)}\\s*\\.\\s*(?:${members})\\s*\\(\\s*\\)`, 'g'))) {
            if (inRange(m.index)) out.push({ index: m.index, found: m[0] });
        }
        // Match: `users.state() === 'loading'` — a comparison with a removed value. Groups: none
        if (members.includes('loading')) {
            for (const m of text.matchAll(new RegExp(`(?<![\\w$.])${escapeForRegExp(name)}\\s*\\.\\s*state\\s*\\(\\s*\\)\\s*[!=]==?\\s*['"\`](?:loading|reloading|stale|local)['"\`]`, 'g'))) {
                if (inRange(m.index)) out.push({ index: m.index, found: m[0] });
            }
        }
    }
    return out.sort((a, b) => a.index - b.index);
}

const findings = (text: string, calls: { index: number; found: string }[]): LanguageChangeFinding[] =>
    calls.map(({ index, found }) => ({ line: lineAt(text, index), found }));

/** `x.isPending()` → `x.pending()`, in a scope. */
function isPendingRenamed(scope: LanguageChangeScope): LanguageChange {
    return {
        id: scope === 'pdx' ? 'async-is-pending' : 'async-is-pending-script',
        kind: 'removed',
        scope,
        issue: 141,
        message: '`isPending()` is `pending()`: any request in flight, first load or refresh.',
        detect: (text) => findings(text, memberCalls(text, 'isPending', scope)),
        fix: (text) => {
            let out = text;
            for (const { index, found } of memberCalls(text, 'isPending', scope).reverse()) {
                out = out.slice(0, index) + found.replace(/isPending/, 'pending') + out.slice(index + found.length);
            }
            return out;
        },
    };
}

/** The alpha names with no one-word replacement, flagged, in a scope. */
function alphaNamesFlagged(scope: LanguageChangeScope): LanguageChange {
    return {
        id: scope === 'pdx' ? 'async-alpha-names' : 'async-alpha-names-script',
        kind: 'removed',
        scope,
        issue: 141,
        message: 'the async vocabulary is data(), error(), state(), pending(), stale(): `loading()` is '
            + "`state() === 'pending' && !data()`, a refresh is `state() === 'success' && pending()`, `isStale()` is `stale()`, `hasData()` is `data() !== undefined`.",
        detect: (text) => findings(text, memberCalls(text, 'loading|status|isLoading|hasData|isStale', scope)),
        fix: 'flag',
    };
}

// Match: `currentLoaderState() === 'done'` / `loaderState('/x') !== "loading"` — a loader state compared
// with an alpha word. Groups: [1]=everything before the word, quote included [2]=the word
const LOADER_COMPARISON = /((?<![\w$.])(?:currentLoaderState\s*\(\s*\)|loaderState\s*\([^()\n]*\))\s*[!=]==?\s*['"`])(loading|done)(?=['"`])/g;

/** The part of `text` a scope reads: a .pdx's template for `pdx` (its script is `script`'s), all of it otherwise. */
function rangeOf(text: string, scope: LanguageChangeScope): { from: number; to: number } | null {
    if (scope !== 'pdx') return { from: 0, to: text.length };
    const template = parseSFC(text).template;
    return template && !template.src ? { from: template.start, to: template.start + template.content.length } : null;
}

/** A route loader's state words, `'loading'` → `'pending'`, `'done'` → `'success'`, in a scope. */
function loaderWords(scope: LanguageChangeScope): LanguageChange {
    return {
        id: scope === 'pdx' ? 'loader-state-words' : 'loader-state-words-script',
        kind: 'changed',
        scope,
        issue: 141,
        message: "a loader's state is 'idle' | 'pending' | 'success' | 'error': 'loading' is 'pending' and 'done' is 'success'.",
        detect: (text) => {
            const range = rangeOf(text, scope);
            if (!range) return [];
            return [...text.slice(range.from, range.to).matchAll(LOADER_COMPARISON)]
                .map((m) => ({ line: lineAt(text, range.from + m.index), found: m[0] + m[0].slice(-1) }));
        },
        fix: (text) => {
            const range = rangeOf(text, scope);
            if (!range) return text;
            const part = text.slice(range.from, range.to)
                .replace(LOADER_COMPARISON, (_m, before: string, word: string) => before + (word === 'loading' ? 'pending' : 'success'));
            return text.slice(0, range.from) + part + text.slice(range.to);
        },
    };
}

export const asyncIsPending = isPendingRenamed('pdx');
export const asyncIsPendingScript = isPendingRenamed('script');
export const asyncAlphaNames = alphaNamesFlagged('pdx');
export const asyncAlphaNamesScript = alphaNamesFlagged('script');
export const loaderStateWords = loaderWords('pdx');
export const loaderStateWordsScript = loaderWords('script');
