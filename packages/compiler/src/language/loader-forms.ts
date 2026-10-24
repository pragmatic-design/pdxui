// The named route loader (#506). `@loader user: loadUser;` declares `user`, a source with the async
// vocabulary read from the router's state of the page's pattern; the alpha's anonymous `@loader
// loadUser;` and its untyped readers `currentLoaderData()` / `currentLoaderState()` leave the language.
//
// - the anonymous form is rewritten to the named one, named after its function: `@loader loadUser:
//   loadUser;`;
// - a reader is rewritten to the page's loader, `currentLoaderData()` → `loadUser.data()`, where the
//   page declares one; anywhere else there is no name to write, and it is flagged;
// - a loader that reads its params from `location` or `currentParams()` is flagged: the router hands
//   them to it, `({ params, signal })`, typed from the pattern.

import { parseSFC } from '../parser/sfc';
import { maskNonCode } from '../compiler/tokenizer';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** The inline script of a .pdx: its content and where the content starts in the file. */
function scriptOf(text: string): { content: string; start: number } | null {
    const script = parseSFC(text).script;
    return script && !script.src ? { content: script.content, start: script.start } : null;
}

// Match: `@loader loadUser;` opening its line — the anonymous form. Groups: [1]=the function
const ANONYMOUS = /^[ \t]*@loader[ \t]+(\w+)[ \t]*;?[ \t]*$/gm;
// Match: `@loader user: loadUser;` opening its line — the named form. Groups: [1]=the name [2]=the function
const NAMED = /^[ \t]*@loader[ \t]+(\w+)[ \t]*:[ \t]*(\w+)[ \t]*;?[ \t]*$/m;

/** Each anonymous `@loader` of a .pdx's script outside a comment or a string, placed in the file. */
function anonymousLoaders(text: string): { index: number; length: number; fn: string; found: string }[] {
    const script = scriptOf(text);
    if (!script) return [];
    const masked = maskNonCode(script.content);
    const out: { index: number; length: number; fn: string; found: string }[] = [];
    for (const m of script.content.matchAll(ANONYMOUS)) {
        const at = m.index + m[0].indexOf('@');
        if (masked[at] !== '@') continue;
        out.push({ index: script.start + at, length: m.index + m[0].length - at, fn: m[1], found: m[0].trim() });
    }
    return out;
}

export const loaderAnonymous: LanguageChange = {
    id: 'loader-anonymous',
    kind: 'removed',
    scope: 'pdx',
    issue: 506,
    message: '`@loader` names what it loads: `@loader user: loadUser;` declares `user`, read as `user.data()`, `user.state()`, `user.error()`.',
    marker: '@loader',
    detect: (text) => anonymousLoaders(text).map(({ index, found }) => ({ line: lineAt(text, index), found })),
    // `@loader loadUser;` → `@loader loadUser: loadUser;` — the name the function already has.
    fix: (text) => {
        let out = text;
        for (const { index, length, fn } of anonymousLoaders(text).reverse()) {
            out = out.slice(0, index) + `@loader ${fn}: ${fn};` + out.slice(index + length);
        }
        return out;
    },
};

// Match: `currentLoaderData()` / `currentLoaderState()`, not a member. Groups: [1]=`Data` or `State`
const READER = /(?<![\w$.])currentLoader(Data|State)\s*\(\s*\)/g;

/**
 * Each reader of a .pdx, outside a comment or a string of its script. Only the script is masked: the
 * template is markup, where an apostrophe in a sentence opens no string.
 */
function readers(text: string): { index: number; found: string; member: string }[] {
    const script = scriptOf(text);
    const masked = script
        ? text.slice(0, script.start) + maskNonCode(script.content) + text.slice(script.start + script.content.length)
        : text;
    return [...text.matchAll(READER)]
        .filter((m) => masked.slice(m.index, m.index + 'currentLoader'.length) === 'currentLoader')
        .map((m) => ({ index: m.index, found: m[0], member: m[1] === 'Data' ? 'data' : 'state' }));
}

/** The name the .pdx's `@loader` declares, once the anonymous form has been rewritten; null without one. */
function loaderName(text: string): string | null {
    const script = scriptOf(text);
    return script ? NAMED.exec(script.content)?.[1] ?? null : null;
}

export const loaderReaders: LanguageChange = {
    id: 'loader-readers',
    kind: 'removed',
    scope: 'pdx',
    issue: 506,
    message: "`currentLoaderData()` and `currentLoaderState()` are gone: the page reads its loader by its name, `user.data()` and `user.state()`; another level's, by `loaderData('/pattern')`.",
    marker: 'currentLoader',
    detect: (text) => readers(text).map(({ index, found }) => ({ line: lineAt(text, index), found })),
    // Rewritten where the page declares a loader (the anonymous one is named by `loader-anonymous`, which
    // runs first); left for a person where it does not — a component under the page has no name to write.
    fix: (text) => {
        const name = loaderName(text) ?? anonymousLoaders(text)[0]?.fn;
        if (!name) return text;
        let out = text;
        for (const { index, found, member } of readers(text).reverse()) {
            out = out.slice(0, index) + `${name}.${member}()` + out.slice(index + found.length);
        }
        return out;
    },
};

/** The body of the function `name` in `content`, a declaration or an arrow, with where it starts; null if absent. */
function functionBody(content: string, name: string): { body: string; start: number } | null {
    // Match: `function name(` / `const name = async (…) =>` / `const name = function` — up to the
    // first `{` after it, the body's. Groups: none
    const head = new RegExp(`(?:\\bfunction\\s+${name}\\s*\\(|\\b(?:const|let|var)\\s+${name}\\s*(?::[^=\\n]+)?=)`).exec(content);
    if (!head) return null;
    const open = content.indexOf('{', head.index + head[0].length);
    if (open < 0) return null;
    const masked = maskNonCode(content);
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        if (masked[i] === '{') depth++;
        else if (masked[i] === '}' && --depth === 0) return { body: content.slice(open, i + 1), start: open };
    }
    return null;
}

// Match: `location.` or `currentParams(` — a loader reading the address itself. Groups: none
const ADDRESS_READ = /(?<![\w$.])(?:location\s*\.|currentParams\s*\()/g;

export const loaderReadsAddress: LanguageChange = {
    id: 'loader-reads-address',
    kind: 'changed',
    scope: 'pdx',
    issue: 506,
    message: 'a loader is handed its params and an abort signal, `async function load({ params, signal })`, typed from the page\'s pattern: '
        + 'reading `location` or `currentParams()` reads the address before the navigation has published it.',
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        const fn = NAMED.exec(script.content)?.[2] ?? anonymousLoaders(text)[0]?.fn;
        const found = fn ? functionBody(script.content, fn) : null;
        if (!found) return [];
        const masked = maskNonCode(found.body);
        return [...found.body.matchAll(ADDRESS_READ)]
            .filter((m) => masked[m.index] === found.body[m.index])
            .map((m) => ({ line: lineAt(text, script.start + found.start + m.index), found: m[0].trim() }));
    },
    fix: 'flag',
};
