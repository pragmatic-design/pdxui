// `navigate(string)` → `navigate.url(string)` (#150), for `pdx migrate`.
//
// With typed routes `navigate()` takes a declared pattern and its params; a concrete URL goes through
// `navigate.url()`, explicitly. A call whose first argument is a string literal that is not a
// pattern is rewritten. A pattern is a literal with a `:param`, or one of the project's route keys
// when the project's routes are known. Without them — the compiler's own report, which has no
// project — only a literal with a query or a hash is surely a URL. A call whose first argument is
// not a literal, or a URL passed with more arguments, is flagged: a person decides between a pattern
// and its params, and `navigate.url()`. Only the router's `navigate` is read: a file that declares a
// `navigate` of its own (a calendar's, a focus group's) is left alone.

import { findClosing } from '../compiler/tokenizer';
import type { LanguageChange, LanguageChangeContext, LanguageChangeFinding } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

interface NavigateCall {
    /** Index of `navigate` in the text. */
    start: number;
    /** The call's text, `navigate(…)`. */
    text: string;
    /** The first argument when it is a string literal, quotes excluded. */
    literal?: string;
    /** Whether the call has a second argument. */
    more: boolean;
}

/** Every call of the router's `navigate(` in `text` — none when the file declares its own. */
function navigateCalls(text: string): NavigateCall[] {
    // Match: `function navigate`, `const navigate =`, a method or a parameter named so. Groups: none
    if (/\b(?:function|const|let|var)\s+navigate\b|\bnavigate\s*\([^)]*\)\s*(?::[^{=]*)?\{/.test(text)) return [];
    const out: NavigateCall[] = [];
    // Match: a bare `navigate(` — not `x.navigate(`, not `navigate.url(`. Groups: none
    const re = /(?<![\w$.])navigate\s*\(/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        const open = m.index + m[0].length - 1;
        const close = findClosing(text, open);
        if (close < 0) continue;
        const args = text.slice(open + 1, close);
        // Match: the first argument as one string literal, then `,` or the end. Groups: [1]=quote [2]=content [3]=what follows
        const lit = /^\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*(,|$)/.exec(args);
        const literal = lit && !(lit[1] === '`' && lit[2].includes('${')) ? lit[2] : undefined;
        out.push({ start: m.index, text: text.slice(m.index, close + 1), literal, more: lit ? lit[3] === ',' : args.includes(',') });
    }
    return out;
}

/** Whether `literal` is a route pattern rather than a concrete URL; `undefined` when it cannot tell. */
function isPattern(literal: string, context?: LanguageChangeContext): boolean | undefined {
    if (/:[A-Za-z_]/.test(literal)) return true;
    if (/[?#]/.test(literal)) return false;
    if (context?.routePatterns) return context.routePatterns.has(literal);
    return undefined;
}

/** The calls the mechanical rewrite takes: one argument, a literal that is a URL. */
const rewritable = (text: string, context?: LanguageChangeContext): NavigateCall[] =>
    navigateCalls(text).filter((c) => c.literal !== undefined && !c.more && isPattern(c.literal, context) === false);

const findingOf = (text: string, c: NavigateCall): LanguageChangeFinding => ({ line: lineAt(text, c.start), found: c.text });

/** `navigate('/users/42')` → `navigate.url('/users/42')`. */
export const navigateUrl: LanguageChange = {
    id: 'navigate-url',
    kind: 'removed',
    scope: 'script',
    issue: 150,
    message: '`navigate()` takes a declared route pattern and its params, `navigate(\'/users/:id\', { id })`; a concrete URL is `navigate.url(\'/users/42\')`.',
    detect: (text, context) => rewritable(text, context).map((c) => findingOf(text, c)),
    fix: (text, context) => {
        let out = text;
        for (const c of rewritable(text, context).reverse()) {
            out = out.slice(0, c.start) + 'navigate.url' + out.slice(c.start + 'navigate'.length);
        }
        return out;
    },
};

/** `navigate(someUrl)` and a URL passed with more arguments: a person decides. */
export const navigateUrlManual: LanguageChange = {
    id: 'navigate-url-manual',
    kind: 'changed',
    scope: 'script',
    issue: 150,
    message: '`navigate()` takes a declared route pattern and its params: pass the pattern and its params, `navigate(\'/users/:id\', { id })`, or a built URL to `navigate.url(url)`.',
    detect: (text, context) => navigateCalls(text)
        .filter((c) => c.literal === undefined || (c.more && isPattern(c.literal, context) === false))
        .map((c) => findingOf(text, c)),
    fix: 'flag',
};
