// `@await` on a source, with `as` (#145): three changed meanings, for `pdx migrate`.
//
// - `@await (x as T)`: in the alpha, `as T` is a TypeScript assertion; now the last top-level
//   `as <name>` binds the result. An alpha assertion is parenthesised, `@await ((x as T))`, which
//   keeps it one. Only an `as` whose name is a TYPE is rewritten — a primitive, or a name the file
//   declares as a type or imports with a capital — so a beta `@await (users as list)` is left alone
//   and a second run changes nothing.
// - a plain value: `null`, `0` and `''` were «not ready» and are now data (data.md, E5). Every
//   `@await` whose operand is not a declared source or a promise-typed name is flagged.
// - `maxMs`: it rendered the body over a promise still pending; now it is a timeout to `@error`.
//   Every `@await` with `maxMs` is flagged.

import { parseSFC } from '../parser/sfc';
import { splitAwaitBinding } from '../parser/await-binding';
import { findClosing } from '../compiler/tokenizer';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

interface AwaitSite {
    /** Index in the whole text of the `(` after `@await`. */
    open: number;
    /** Index of its matching `)`. */
    close: number;
    /** The text between them. */
    inner: string;
    /** The `{ … }` timing block after it, when there is one. */
    timing?: string;
}

/** Every `@await (…)` in the template of the .pdx `text`. */
function awaitSites(text: string): AwaitSite[] {
    const template = parseSFC(text).template;
    if (!template || template.src) return [];
    const from = template.start;
    const to = from + template.content.length;
    const out: AwaitSite[] = [];
    // Match: `@await (` — the directive and its opening parenthesis. Groups: none
    const re = /@await\s*\(/g;
    re.lastIndex = from;
    for (let m = re.exec(text); m && m.index < to; m = re.exec(text)) {
        const open = m.index + m[0].length - 1;
        const close = findClosing(text, open);
        if (close < 0 || close >= to) continue;
        const after = text.slice(close + 1);
        // Match: the `{ minMs: …, maxMs: … }` block right after the parentheses. Groups: [1]=its content
        const timing = /^\s*\{([^{}]*\b(?:minMs|maxMs)\b[^{}]*)\}/.exec(after);
        out.push({ open, close, inner: text.slice(open + 1, close), timing: timing?.[1] });
    }
    return out;
}

const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'any', 'unknown', 'never', 'object', 'bigint', 'symbol', 'undefined', 'null', 'void', 'const']);

/** The type names the file declares (`interface`, `type`, `class`, `enum`) or imports with a capital. */
function typeNames(text: string): Set<string> {
    const names = new Set(PRIMITIVE_TYPES);
    // Match: `interface User` / `type Row` / `class Store` / `enum Kind`. Groups: [1]=the name
    for (const m of text.matchAll(/\b(?:interface|type|class|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // Match: `import { A, type B, c as D } from` — the named list. Groups: [1]=the list
    for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
        for (const part of m[1].split(',')) {
            const local = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim() ?? '';
            if (/^[A-Z]/.test(local)) names.add(local);
        }
    }
    return names;
}

/** The `@await` sites whose last `as` names a type: alpha assertions. */
function assertionSites(text: string): AwaitSite[] {
    const types = typeNames(text);
    return awaitSites(text).filter((s) => {
        const { as } = splitAwaitBinding(s.inner);
        return as !== undefined && types.has(as);
    });
}

/** The names the file declares as an async source, or with a promise type or value. */
function awaitableNames(text: string): Set<string> {
    const names = new Set<string>();
    // Match: `@fetch users` / `@loader user` / `@action save` — a declared source. Groups: [1]=the name
    for (const m of text.matchAll(/@(?:fetch|loader|action)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // Match: `const users = resource(` / `useQuery(` / `httpResource(` / `mutation(`. Groups: [1]=the name
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:resource|useQuery|httpResource|mutation)\s*[<(]/g)) names.add(m[1]);
    // Match: `const p: Promise<…>` / `let p = $signal<Promise<…>>(` / `= new Promise(` / `= Promise.` / `= fetch(`.
    // Groups: [1]=the name
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*Promise\s*<|=\s*(?:\$signal\s*<\s*Promise\s*<|new\s+Promise\b|Promise\s*\.|fetch\s*\())/g)) names.add(m[1]);
    return names;
}

/** The operand of `@await`, as a bare name when it is one — `x`, `(x as T)`, `x as name`. */
function operandName(inner: string): string | null {
    const { expr } = splitAwaitBinding(inner);
    // Match: `x` or `(x as T)`. Groups: [1]=the name
    const m = /^\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:\s+as\s+[^)]*)?\)?\s*$/.exec(expr);
    return m ? m[1] : null;
}

const findingAt = (text: string, s: AwaitSite): LanguageChangeFinding =>
    ({ line: lineAt(text, s.open), found: `@await (${s.inner})` });

/** `@await (x as T)`, an alpha type assertion, parenthesised so it stays one. */
export const awaitAsAssertion: LanguageChange = {
    id: 'await-as-assertion',
    kind: 'changed',
    scope: 'pdx',
    issue: 145,
    message: '`@await (x as name)` binds the result to `name`: a type assertion is written in its own parentheses, `@await ((x as T))`.',
    detect: (text) => assertionSites(text).map((s) => findingAt(text, s)),
    fix: (text) => {
        let out = text;
        for (const s of assertionSites(text).reverse()) {
            out = out.slice(0, s.open + 1) + `(${s.inner.trim()})` + out.slice(s.close);
        }
        return out;
    },
};

/** `@await (x)` on a plain value: `null`, `0` and `''` now render the body. */
export const awaitPlainValue: LanguageChange = {
    id: 'await-plain-value',
    kind: 'changed',
    scope: 'pdx',
    issue: 145,
    message: "`@await` decides by the value's state, not its truthiness: `null`, `0` and `''` are data and render the body; only `undefined` and `false` wait. Check that a falsy value here did not mean «not yet».",
    detect: (text) => {
        const known = awaitableNames(text);
        return awaitSites(text)
            .filter((s) => {
                const name = operandName(s.inner);
                return name === null || !known.has(name);
            })
            .map((s) => findingAt(text, s));
    },
    fix: 'flag',
};

/** `@await (x) { maxMs }`: a timeout to `@error` now, where it rendered the body. */
export const awaitMaxMs: LanguageChange = {
    id: 'await-max-ms',
    kind: 'changed',
    scope: 'pdx',
    issue: 145,
    message: '`maxMs` is a timeout: with no result by then, `@error` renders with an AwaitTimeoutError (without `@error`, `@loading` stays). It used to render the body over a value still pending.',
    detect: (text) => awaitSites(text)
        .filter((s) => s.timing !== undefined && /\bmaxMs\b/.test(s.timing))
        .map((s) => findingAt(text, s)),
    fix: 'flag',
};
