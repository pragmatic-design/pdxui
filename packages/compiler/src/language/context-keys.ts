// The alpha's string context keys (#496). `@provide key = …` and `@inject key;` / `@inject key as
// alias;` turned an identifier into a string; the beta reads a value by a token the script imports,
// `@provide Token = …;` and `@inject name from Token;`. The compiler reports each string form as
// PDX_UNKNOWN_DECLARATION. `pdx migrate` rewrites them (#497): it maps each key to a token — the
// library's own for the library's keys, otherwise one it writes into the project's `contexts.ts` —
// and hands the map to these entries in `LanguageChangeContext.contextTokens`, with the file's path.

import { parseSFC } from '../parser/sfc';
import { maskNonCode } from '../compiler/tokenizer';
import { importedLocalNames } from '../compiler/import-names';
import type { LanguageChange, LanguageChangeContext, LanguageChangeFinding } from './changes';

/**
 * A context token a key is migrated to: its exported name, and the module that exports it — a package
 * specifier (`@pdxui/router`), or the absolute path of a project module without its extension, with
 * `/` separators, which each file imports by its relative path.
 */
export interface ContextTokenRef {
    name: string;
    module: string;
}

/** The keys the library provided under before #495, and the tokens that replaced them. */
export const LIBRARY_CONTEXT_TOKENS: ReadonlyMap<string, ContextTokenRef> = new Map([
    ['errorContext', { name: 'ErrorContext', module: '@pdxui/ui/error-boundary' }],
    ['dataSource', { name: 'DataSourceContext', module: '@pdxui/ui/data-source' }],
    ['routeParams', { name: 'RouteParams', module: '@pdxui/router' }],
]);

/** The token name a key becomes: `user` → `User`, `row_density` → `RowDensity`. */
export function contextTokenName(key: string): string {
    return key.split('_').filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('') || 'Context';
}

/** The inline script of a .pdx: its content and where the content starts in the file. */
function scriptOf(text: string): { content: string; start: number } | null {
    const script = parseSFC(text).script;
    return script && !script.src ? { content: script.content, start: script.start } : null;
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

interface Declaration { index: number; length: number; line: number; found: string; groups: string[] }

/**
 * Each line of the script that `re` matches at its start, with what it captured and where it is in
 * the script — skipping one in a comment or a string, whose `@` is blank in the masked script.
 */
function declarationsIn(content: string, re: RegExp): Declaration[] {
    const masked = maskNonCode(content);
    const out: Declaration[] = [];
    for (const m of content.matchAll(re)) {
        const at = m.index + m[0].indexOf('@');
        if (masked[at] !== '@') continue;
        out.push({ index: at, length: m.index + m[0].length - at, line: lineAt(content, at), found: m[0].trim(), groups: m.slice(1) });
    }
    return out;
}

// Match: an import statement, on one line or several. Groups: none.
const IMPORT_STATEMENT = /^[ \t]*import\b[^;]*;?/gm;

/** The names a script imports. */
function importsIn(content: string): Set<string> {
    const statements = content.match(IMPORT_STATEMENT) ?? [];
    return new Set(statements.flatMap((s) => importedLocalNames(s.replace(/\s+/g, ' '))));
}

// Match: `@provide key = …;` opening its line. Groups: [1]=the key
const PROVIDE = /^[ \t]*@provide\s+(\w+)\s*=[^\n]*/gm;
// Match: `@inject key;` / `@inject key as alias;` opening its line. Groups: [1]=the key [2]=the alias
const ALPHA_INJECT = /^[ \t]*@inject[ \t]+(\w+)(?:[ \t]+as[ \t]+(\w+))?[ \t]*;?[ \t]*$/gm;

/** The string-keyed `@provide` lines of a script: those whose key the script does not import. */
const stringProvides = (content: string): Declaration[] => {
    const imported = importsIn(content);
    return declarationsIn(content, PROVIDE).filter((d) => !imported.has(d.groups[0]));
};

/** Every string key a .pdx provides or injects, in the order they are written. */
export function stringContextKeys(text: string): string[] {
    const script = scriptOf(text);
    if (!script) return [];
    return [...stringProvides(script.content), ...declarationsIn(script.content, ALPHA_INJECT)]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.groups[0]);
}

/** The specifier a file at `file` imports `module` by: a package as it is, a project module by its relative path. */
function specifierFor(module: string, file: string | undefined): string | null {
    if (!/^(?:\/|[A-Za-z]:\/)/.test(module)) return module;
    if (!file) return null;
    const from = file.replace(/\\/g, '/').split('/').slice(0, -1);
    const to = module.split('/');
    let common = 0;
    while (common < from.length && common < to.length && from[common] === to[common]) common++;
    const up = from.length - common;
    const rest = to.slice(common).join('/');
    return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

/**
 * `names` imported from `specifier` in a script: added to an import of that module the script has
 * (not a type-only one), or as a new first line.
 */
function addImport(content: string, specifier: string, names: string[]): string {
    const imported = importsIn(content);
    const missing = names.filter((n) => !imported.has(n));
    if (missing.length === 0) return content;
    const quoted = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match: `import { a, b } from 'specifier';`, a value import of that module. Groups: [1]=the names
    const existing = new RegExp(`^([ \\t]*import\\s*\\{)([^}]*)(\\}\\s*from\\s*['"]${quoted}['"])`, 'm');
    const m = existing.exec(content);
    if (m) {
        const list = [...m[2].split(',').map((s) => s.trim()).filter(Boolean), ...missing].join(', ');
        return content.slice(0, m.index) + `${m[1]} ${list} ${m[3]}` + content.slice(m.index + m[0].length);
    }
    const line = `import { ${missing.join(', ')} } from '${specifier}';\n`;
    return content.startsWith('\n') ? `\n${line}${content.slice(1)}` : line + content;
}

/**
 * Rewrite each declaration of a .pdx's script that `pick` returns with the line `rewrite` makes from
 * its token, and import every token used. A key without a token in the map, or a file whose module
 * cannot be named, is left for `pdx migrate` to flag.
 */
function rewriteScript(
    text: string,
    context: LanguageChangeContext | undefined,
    pick: (content: string) => Declaration[],
    rewrite: (d: Declaration, token: string) => string,
): string {
    const tokens = context?.contextTokens;
    const script = scriptOf(text);
    if (!tokens || !script) return text;
    let content = script.content;
    const imports = new Map<string, string[]>();
    // From the last to the first, so each declaration's index still holds.
    for (const d of pick(content).reverse()) {
        const ref = tokens.get(d.groups[0]);
        const specifier = ref && specifierFor(ref.module, context?.file);
        if (!ref || !specifier) continue;
        content = content.slice(0, d.index) + rewrite(d, ref.name) + content.slice(d.index + d.length);
        imports.set(specifier, [ref.name, ...(imports.get(specifier) ?? []).filter((n) => n !== ref.name)]);
    }
    for (const [specifier, names] of imports) content = addImport(content, specifier, names);
    return text.slice(0, script.start) + content + text.slice(script.start + script.content.length);
}

export const contextStringProvide: LanguageChange = {
    id: 'context-string-provide',
    kind: 'removed',
    scope: 'pdx',
    issue: 496,
    message: "`@provide` takes a context token the script imports, not a string key: `@provide Token = …;`, with `Token = context<T>('key')` declared in a module.",
    reportedAs: 'PDX_UNKNOWN_DECLARATION',
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        return stringProvides(script.content).map(({ index, found }) => ({ line: lineAt(text, script.start + index), found }));
    },
    // `@provide user = v;` → `@provide User = v;`
    fix: (text, context) => rewriteScript(text, context, stringProvides,
        (d, token) => d.found.replace(/^@provide\s+\w+/, `@provide ${token}`)),
};

export const contextStringInject: LanguageChange = {
    id: 'context-string-inject',
    kind: 'removed',
    scope: 'pdx',
    issue: 496,
    message: "`@inject` reads a value by a context token: `@inject name from Token;`, with `Token = context<T>('key')` declared in a module and imported.",
    reportedAs: 'PDX_UNKNOWN_DECLARATION',
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        return declarationsIn(script.content, ALPHA_INJECT).map(({ index, found }) => ({ line: lineAt(text, script.start + index), found }));
    },
    // `@inject user;` → `@inject user from User;`, `@inject user as me;` → `@inject me from User;`
    fix: (text, context) => rewriteScript(text, context, (content) => declarationsIn(content, ALPHA_INJECT),
        (d, token) => `@inject ${d.groups[1] ?? d.groups[0]} from ${token};`),
};
