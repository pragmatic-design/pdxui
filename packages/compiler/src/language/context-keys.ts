// The alpha's string context keys (#496). `@provide key = …` and `@inject key;` / `@inject key as
// alias;` turned an identifier into a string; the beta reads a value by a token the script imports,
// `@provide Token = …;` and `@inject name from Token;`. The compiler reports each string form as
// PDX_UNKNOWN_DECLARATION; `pdx migrate` lists them, and #497 rewrites them into a `contexts.ts`.

import { parseSFC } from '../parser/sfc';
import { maskNonCode } from '../compiler/tokenizer';
import { importedLocalNames } from '../compiler/import-names';
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

/**
 * Each line of the script that `re` matches at its start, with what it captured — skipping one in a
 * comment or a string, whose `@` is blank in the masked script.
 */
function declarations(text: string, re: RegExp): { line: number; found: string; groups: string[] }[] {
    const script = scriptOf(text);
    if (!script) return [];
    const masked = maskNonCode(script.content);
    const out: { line: number; found: string; groups: string[] }[] = [];
    for (const m of script.content.matchAll(re)) {
        const at = m.index + m[0].indexOf('@');
        if (masked[at] !== '@') continue;
        out.push({ line: lineAt(text, script.start + at), found: m[0].trim(), groups: m.slice(1) });
    }
    return out;
}

/** The names the script imports. */
function importsOf(text: string): Set<string> {
    const script = scriptOf(text);
    if (!script) return new Set();
    // Match: an import statement, on one line or several. Groups: none.
    const statements = script.content.match(/^[ \t]*import\b[^;]*;?/gm) ?? [];
    return new Set(statements.flatMap(s => importedLocalNames(s.replace(/\s+/g, ' '))));
}

// Match: `@provide key = …;` opening its line. Groups: [1]=the key
const PROVIDE = /^[ \t]*@provide\s+(\w+)\s*=[^\n]*/gm;
// Match: `@inject key;` / `@inject key as alias;` opening its line. Groups: [1]=the key
const ALPHA_INJECT = /^[ \t]*@inject[ \t]+(\w+)(?:[ \t]+as[ \t]+\w+)?[ \t]*;?[ \t]*$/gm;

export const contextStringProvide: LanguageChange = {
    id: 'context-string-provide',
    kind: 'removed',
    scope: 'pdx',
    issue: 496,
    message: "`@provide` takes a context token the script imports, not a string key: `@provide Token = …;`, with `Token = context<T>('key')` declared in a module.",
    reportedAs: 'PDX_UNKNOWN_DECLARATION',
    detect(text): LanguageChangeFinding[] {
        const imported = importsOf(text);
        return declarations(text, PROVIDE).filter(d => !imported.has(d.groups[0])).map(({ line, found }) => ({ line, found }));
    },
    fix: 'flag',
};

export const contextStringInject: LanguageChange = {
    id: 'context-string-inject',
    kind: 'removed',
    scope: 'pdx',
    issue: 496,
    message: "`@inject` reads a value by a context token: `@inject name from Token;`, with `Token = context<T>('key')` declared in a module and imported.",
    reportedAs: 'PDX_UNKNOWN_DECLARATION',
    detect(text): LanguageChangeFinding[] {
        return declarations(text, ALPHA_INJECT).map(({ line, found }) => ({ line, found }));
    },
    fix: 'flag',
};
