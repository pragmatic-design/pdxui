// Two script forms the alpha read wrongly and said nothing about, now errors (#278; decisions 12, 14).
//
// - A `$` rune outside its position: PDX_RUNE_POSITION, the compiler's own code.
// - An `@store` `persist` that is neither 'local' nor 'session': PDX_UNKNOWN_DECLARATION.
//
// Neither is mechanical — the author chooses the core function for the place, or the storage — so
// `pdx migrate` lists each, and rewrites nothing.

import { parseSFC } from '../parser/sfc';
import { misplacedRunes } from '../compiler/validate-rune-position';
import { maskNonCode } from '../compiler/tokenizer';
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

export const runePosition: LanguageChange = {
    id: 'rune-position',
    kind: 'removed',
    scope: 'pdx',
    issue: 278,
    message: 'a `$` rune is read only in its position — `$signal`, `$derived`, `$store` as the whole initialiser of a top-level `let`/`const`, '
        + '`$effect` and `$watch` as a top-level statement. Anywhere else call the core function: `signal()`, `computed()`, `store()`, `effect()`, `watch()`.',
    reportedAs: 'PDX_RUNE_POSITION',
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        return misplacedRunes(script.content).map((r) => ({ line: lineAt(text, script.start + r.at), found: r.text.split('\n')[0] }));
    },
    fix: 'flag',
};

// Match: `@store name { persist: 'x' }` opening its line. Groups: [1]=the declaration [2]=the value
const STORE_PERSIST = /^[ \t]*(@store\s+\w+\s*\{\s*persist\s*:\s*['"](\w+)['"]\s*\})/gm;

export const storePersist: LanguageChange = {
    id: 'store-persist',
    kind: 'removed',
    scope: 'pdx',
    issue: 278,
    message: "`@store`'s `persist` is 'local' or 'session': any other value kept the store in sessionStorage. Write the storage you meant.",
    reportedAs: 'PDX_UNKNOWN_DECLARATION',
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        const masked = maskNonCode(script.content);
        const out: LanguageChangeFinding[] = [];
        for (const m of script.content.matchAll(STORE_PERSIST)) {
            if (m[2] === 'local' || m[2] === 'session') continue;
            // A declaration in a comment or a string is not one: its `@` is blank in the masked script.
            const at = m.index + m[0].indexOf('@');
            if (masked[at] !== '@') continue;
            out.push({ line: lineAt(text, script.start + at), found: m[1] });
        }
        return out;
    },
    fix: 'flag',
};
