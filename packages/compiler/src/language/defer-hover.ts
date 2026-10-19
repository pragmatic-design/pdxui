// `@defer (hover)` is removed: it was `interaction` under another name (#281, decision 37).
//
// PDX_REMOVED_FORM names `interaction`, and `pdx migrate` rewrites each `hover` trigger of a
// `@defer (…)` — in the render triggers and after `; prefetch` alike. A `hover` inside `when ( … )` is
// the expression's own name, and is left.

import { parseDeferTriggers, REMOVED_TRIGGER } from '../compiler/defer-triggers';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** Every `@defer (…)` of a text: where its parentheses' content starts and what it holds. */
function defers(text: string): { at: number; content: string }[] {
    const out: { at: number; content: string }[] = [];
    // Match: `@defer (` — its content is read to the balanced `)`.
    for (const m of text.matchAll(/@defer\s*\(/g)) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        for (; i < text.length && depth > 0; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') depth--;
        }
        out.push({ at: start, content: text.slice(start, i - 1) });
    }
    return out;
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

// Match: `hover` standing as a trigger of its own — after the opening, a `|`, or `; prefetch` — and
// followed by the end, a `|` or a `;`. A `hover` inside `when ( … )` follows a `(`, and is not one.
// Groups: [1]=what precedes it
const HOVER_TRIGGER = /(^|\||;\s*prefetch\s)(\s*)hover(?=\s*(?:$|\||;))/g;

export const deferHover: LanguageChange = {
    id: 'defer-hover',
    kind: 'removed',
    scope: 'pdx',
    issue: 281,
    message: '`@defer (hover)` is removed: write `interaction` — the same trigger, on the first pointer or focus entry into the block.',
    detect(text): LanguageChangeFinding[] {
        return defers(text)
            .filter((d) => parseDeferTriggers(d.content).unknown.includes(REMOVED_TRIGGER))
            .map((d) => ({ line: lineAt(text, d.at), found: `@defer (${d.content})` }));
    },
    fix(text) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const d of defers(text).reverse()) {
            if (!parseDeferTriggers(d.content).unknown.includes(REMOVED_TRIGGER)) continue;
            const next = d.content.replace(HOVER_TRIGGER, (_m, before: string, space: string) => `${before}${space}interaction`);
            out = out.slice(0, d.at) + next + out.slice(d.at + d.content.length);
        }
        return out;
    },
};
