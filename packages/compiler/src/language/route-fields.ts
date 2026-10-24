// `@page` is the one home of every route field, and `@head` is gone (#277; decisions 1, 2, 3, 7, 8, 19).
//
// A route field had two or three homes: a path, a prefetch policy, a transition or route data could be
// written in `@page`, in `@route { … }`, or in a declaration of its own. Each of these is now a form the
// beta removed (PDX_REMOVED_FORM), and `pdx migrate` rewrites it into `@page` and the declarations that
// stay:
//   @route { path: '/a', guard: 'g', prefetch: 'hover', search: { q?: string } }
//       → @page '/a' { prefetch: 'hover' };  @guard 'g';  @search { q?: string };
//   @alias '/b';                  → a further path: @page '/a', '/b';
//   @prefetch 'x'; @transition 'x';  (in the script)  → @page '/a' { prefetch: 'x', transition: 'x' };
//   @meta { requiresAuth: true }; → @page '/a' { meta: { requiresAuth: true } };
//   @head { title: 'T', meta: [{ name: 'description', content: 'D' }] }
//       → @title 'T';  @meta description: 'D';
// A route field on a component with no `@page` (and no `@route` path) did nothing, and is left for a
// person; so is an `@head` whose content is not a string.

import { parseSFC } from '../parser/sfc';
import { findClosing, maskNonCode, splitAtDepthZero } from '../compiler/tokenizer';
import { declarationEnd } from '../compiler/statement-extent';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The inline script of a .pdx: its content and where the content starts in the file. */
function scriptOf(text: string): { content: string; start: number } | null {
    const script = parseSFC(text).script;
    return script && !script.src ? { content: script.content, start: script.start } : null;
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** A declaration of the script: where it starts and ends, and its text. */
interface Decl { from: number; to: number; text: string }

/**
 * The declaration that starts at `at`: to its `;`, or to the end of its line, a `{ … }` read whole on
 * the way. Read on the masked code, so a brace or a `;` in a string is not one.
 */
function declarationAt(code: string, masked: string, at: number): Decl {
    const to = declarationEnd(code, masked, at);
    return { from: at, to, text: code.slice(at, to) };
}

/** Every declaration whose line opens with `re` (a global, multiline regex with no groups). */
function declarations(code: string, re: RegExp): Decl[] {
    const masked = maskNonCode(code);
    return [...masked.matchAll(re)].map((m) => declarationAt(code, masked, m.index + m[0].length - m[0].trimStart().length));
}

// Match: each removed form, opening its line. Read on the masked script, where a string's quotes and
// content are blank: a keyword is matched, not what follows it. `@transition` in a script is the page
// transition; the template's modifier is not in the script.
const ROUTE_BLOCK = /^[ \t]*@route\s*\{/gm;
const ALIAS = /^[ \t]*@alias\b/gm;
const PREFETCH = /^[ \t]*@prefetch\b/gm;
const TRANSITION = /^[ \t]*@transition\b/gm;
const ROUTE_META = /^[ \t]*@meta\s*\{/gm;
const HEAD_BLOCK = /^[ \t]*@head\s*\{/gm;
const PAGE = /^[ \t]*@page\b/gm;

/** The inside of the first `{ … }` of a declaration. */
function braceBody(text: string): string | null {
    const open = maskNonCode(text).indexOf('{');
    const close = open >= 0 ? findClosing(text, open) : -1;
    return close > open ? text.slice(open + 1, close) : null;
}

/** `key: value` fields of a block, separated by `,` or `;` at depth zero. */
function fields(body: string): { key: string; value: string }[] {
    const out: { key: string; value: string }[] = [];
    for (const part of splitAtDepthZero(body, ',').flatMap((p) => splitAtDepthZero(p, ';'))) {
        const t = part.trim();
        if (!t) continue;
        const colon = t.indexOf(':');
        out.push(colon < 0 ? { key: t, value: '' } : { key: t.slice(0, colon).trim(), value: t.slice(colon + 1).trim() });
    }
    return out;
}

/** The single quoted string of a one-string declaration: `@alias '/b';` → `'/b'`. */
function stringOf(text: string): string | null {
    // Match: the first string literal. Groups: [0]=it, quotes included
    return /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/.exec(text)?.[0] ?? null;
}

/** An `@page` declaration, read into its paths and options as written. */
interface Page { decl: Decl; paths: string[]; options: { key: string; value: string }[] }

function readPage(decl: Decl): Page {
    const body = braceBody(decl.text);
    const head = body === null ? decl.text : decl.text.slice(0, maskNonCode(decl.text).indexOf('{'));
    const paths = head.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) ?? [];
    return { decl, paths, options: body === null ? [] : fields(body) };
}

function writePage(page: Page): string {
    const options = page.options.map((o) => (o.value ? `${o.key}: ${o.value}` : o.key));
    return `@page ${page.paths.join(', ')}${options.length ? ` { ${options.join(', ')} }` : ''};`;
}

/** Set an option, replacing one of the same key. */
function setOption(page: Page, key: string, value: string): void {
    const at = page.options.findIndex((o) => o.key === key);
    if (at >= 0) page.options[at] = { key, value };
    else page.options.push({ key, value });
}

/** What one removed declaration becomes: route fields for `@page`, and the lines that take its place. */
interface Conversion { paths: string[]; options: { key: string; value: string }[]; lines: string[] }

/** The keys of `@route { … }` that are a declaration of their own, and how each is written. */
const ROUTE_DECLARATIONS: Record<string, (value: string) => string> = {
    guard: (v) => `@guard ${v};`,
    // Named after its function (#506): the anonymous `@loader fn;` is a removed form too.
    loader: (v) => `@loader ${v}: ${v};`,
    layout: (v) => `@layout ${v};`,
    scroll: (v) => `@scroll ${v};`,
    search: (v) => `@search ${v};`,
    params: (v) => `@params ${v};`,
};

function convertRoute(decl: Decl): Conversion | null {
    const body = braceBody(decl.text);
    if (body === null) return null;
    const out: Conversion = { paths: [], options: [], lines: [] };
    for (const { key, value } of fields(body)) {
        if (key === 'path') out.paths.push(value);
        else if (key in ROUTE_DECLARATIONS) out.lines.push(ROUTE_DECLARATIONS[key](value));
        else if (key === 'prefetch' || key === 'transition' || key === 'meta') out.options.push({ key, value });
        else if (key === 'keepAlive') out.options.push({ key, value: value === 'true' ? '' : value });
        else if (key === 'preload') { if (value === 'true') out.options.push({ key, value: '' }); }
        // Any other key was ignored by the alpha, as it is here.
    }
    return out;
}

function convertHead(decl: Decl): Conversion | null {
    const body = braceBody(decl.text);
    if (body === null) return null;
    const lines: string[] = [];
    for (const { key, value } of fields(body)) {
        if (key === 'title') {
            if (!/^(['"]).*\1$/.test(value)) return null;
            lines.push(`@title ${value};`);
        } else if (key === 'meta') {
            const list = value.startsWith('[') ? value.slice(1, value.lastIndexOf(']')) : null;
            if (list === null) return null;
            for (const tag of splitAtDepthZero(list, ',').map((t) => t.trim()).filter(Boolean)) {
                const inner = braceBody(tag);
                if (inner === null) return null;
                const f = Object.fromEntries(fields(inner).map((x) => [x.key, x.value]));
                const content = f.content;
                if (!content || !/^(['"]).*\1$/.test(content)) return null;
                const name = f.name?.slice(1, -1);
                const property = f.property?.slice(1, -1);
                if (name) lines.push(`@meta ${name}: ${content};`);
                else if (property) lines.push(`@meta property ${property}: ${content};`);
                else return null;
            }
        } else {
            return null;
        }
    }
    return { paths: [], options: [], lines };
}

type Kind = 'route' | 'alias' | 'prefetch' | 'transition' | 'meta' | 'head';

const PATTERNS: Record<Kind, RegExp> = {
    route: ROUTE_BLOCK, alias: ALIAS, prefetch: PREFETCH, transition: TRANSITION, meta: ROUTE_META, head: HEAD_BLOCK,
};

function convert(kind: Kind, decl: Decl): Conversion | null {
    switch (kind) {
        case 'route': return convertRoute(decl);
        case 'head': return convertHead(decl);
        case 'alias': {
            const path = stringOf(decl.text);
            return path ? { paths: [path], options: [], lines: [] } : null;
        }
        case 'prefetch':
        case 'transition': {
            const value = stringOf(decl.text);
            return value ? { paths: [], options: [{ key: kind, value }], lines: [] } : null;
        }
        case 'meta': {
            const body = braceBody(decl.text);
            return body === null ? null : { paths: [], options: [{ key: 'meta', value: `{${body}}` }], lines: [] };
        }
    }
}

/**
 * The script with every declaration of `kind` rewritten: its route fields into `@page`, its own
 * declarations in its place. One that cannot be read, or a route field with no page to go to, is left.
 */
function rewriteScript(code: string, kind: Kind): string {
    const found = declarations(code, PATTERNS[kind]);
    if (found.length === 0) return code;
    const pageDecl = declarations(code, PAGE)[0];
    const page = pageDecl ? readPage(pageDecl) : null;
    // The edits, applied from the end so earlier offsets stay valid.
    const edits: { from: number; to: number; text: string }[] = [];
    for (const decl of found) {
        const c = convert(kind, decl);
        if (!c) continue;
        const lines = [...c.lines];
        if (page) {
            for (const p of c.paths) if (!page.paths.includes(p)) page.paths.push(p);
            for (const o of c.options) setOption(page, o.key, o.value);
        } else if (kind === 'route' && c.paths.length > 0) {
            // `@route { path }` on a component with no `@page` (a file has one `@route`): the page is
            // written where the block was.
            lines.unshift(writePage({ decl, paths: c.paths, options: c.options }));
        } else if (c.paths.length > 0 || c.options.length > 0) {
            // A route field with no page: it did nothing, and a person decides.
            continue;
        }
        const indent = indentOf(code, decl.from);
        edits.push({ ...wholeLines(code, decl), text: lines.map((l) => indent + l + '\n').join('') });
    }
    if (page && edits.length > 0) edits.push({ from: page.decl.from, to: page.decl.to, text: writePage(page) });
    edits.sort((a, b) => b.from - a.from);
    let out = code;
    for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
    return out;
}

/** The indentation of the line `at` is on. */
function indentOf(code: string, at: number): string {
    const start = code.lastIndexOf('\n', at - 1) + 1;
    return /^[ \t]*/.exec(code.slice(start))![0];
}

/** A declaration widened to its whole lines: from the start of its line through its newline. */
function wholeLines(code: string, decl: Decl): { from: number; to: number } {
    const from = code.lastIndexOf('\n', decl.from - 1) + 1;
    let to = decl.to;
    while (code[to] === ' ' || code[to] === '\t') to++;
    if (code[to] === '\r') to++;
    if (code[to] === '\n') to++;
    return { from, to };
}

function detectIn(text: string, kind: Kind): LanguageChangeFinding[] {
    const script = scriptOf(text);
    if (!script) return [];
    return declarations(script.content, PATTERNS[kind]).map((d) => ({
        line: lineAt(text, script.start + d.from),
        found: d.text.split('\n')[0].trim(),
    }));
}

function fixIn(text: string, kind: Kind): string {
    const script = scriptOf(text);
    if (!script) return text;
    const next = rewriteScript(script.content, kind);
    return text.slice(0, script.start) + next + text.slice(script.start + script.content.length);
}

/** The keyword every declaration of a kind opens with, its `PATTERNS` entry's (#648). */
const MARKERS: Record<Kind, string> = {
    route: '@route', alias: '@alias', prefetch: '@prefetch', transition: '@transition', meta: '@meta', head: '@head',
};

function change(kind: Kind, id: string, message: string): LanguageChange {
    return {
        id, kind: 'removed', scope: 'pdx', issue: 277, message, marker: MARKERS[kind],
        detect: (text) => detectIn(text, kind), fix: (text) => fixIn(text, kind),
    };
}

export const routeBlock = change('route', 'route-block',
    "`@route { … }` is removed: write the path and the options `keepAlive`, `preload`, `prefetch`, `transition`, `meta` in `@page '/path' { … }`, "
    + "and `guard`, `loader`, `layout`, `scroll`, `search`, `params` as their own declarations (`@guard 'name';`).");

export const pageAlias = change('alias', 'page-alias',
    "`@alias` is removed: an alias is a further path of `@page` — `@page '/users', '/people';`.");

export const pagePrefetch = change('prefetch', 'page-prefetch',
    "`@prefetch` is removed: it is `@page`'s `prefetch` option — `@page '/users' { prefetch: 'hover' };`.");

export const pageTransition = change('transition', 'page-transition',
    "the script's `@transition` is removed: the page transition is `@page`'s `transition` option — `@page '/users' { transition: 'fade' };` "
    + "(the template's `@transition` modifier of `@if` and `@for` stays).");

export const routeMeta = change('meta', 'route-meta',
    "`@meta { … }` is removed: route data is `@page`'s `meta` option — `@page '/users' { meta: { requiresAuth: true } };`; "
    + "`@meta name: '…';` writes a head tag.");

export const headBlock = change('head', 'head-block',
    "`@head { … }` is removed: write the title with `@title 'Title';` and each tag with `@meta description: '…';` or `@meta property og:title: '…';`.");
