// Component events stop bubbling by default (#138), and `$emit` leaves the language.
//
// `@event saved: T;` keeps its spelling and changes meaning: the event used to bubble and cross shadow
// roots, and now stays on the host unless declared `@event(bubbles)`. That is a `changed` entry: the
// compiler says nothing, `pdx migrate` writes `(bubbles)` on every existing `@event`, which keeps what
// the code did, and PDX_EVENT_BUBBLES_UNUSED then lists the ones no ancestor listens to.
//
// `$emit('saved', x)` is a `removed` form: the function `@event saved` declares is the only way to
// dispatch from a `.pdx`. `pdx migrate` rewrites a call whose name is an identifier to that function,
// and declares `@event saved: unknown;` when the script does not; a hyphenated name, which no `@event`
// can declare, is left for a person.
// Both are looked for in the `<script>` and the `<template>` of a `.pdx`, one declaration per line.

import { parseSFC } from '../parser/sfc';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** An `@event` declaration with no option: where `@event` ends in `text`, and the declaration. */
interface PlainEvent { keywordEnd: number; line: number; found: string }

/** Every `@event name…` in the script of `text` written without `(bubbles)`. */
function plainEvents(text: string): PlainEvent[] {
    const script = parseSFC(text).script;
    if (!script || script.src) return [];
    const out: PlainEvent[] = [];
    let offset = script.start;
    for (const raw of script.content.split('\n')) {
        const lead = raw.length - raw.trimStart().length;
        const trimmed = raw.trim();
        // Match: `@event` then blank space then a name — a declaration with no option.
        if (/^@event\s+[A-Za-z_$]/.test(trimmed)) {
            out.push({ keywordEnd: offset + lead + '@event'.length, line: lineAt(text, offset), found: trimmed });
        }
        offset += raw.length + 1;
    }
    return out;
}

export const eventBubbles: LanguageChange = {
    id: 'event-bubbles',
    kind: 'changed',
    scope: 'pdx',
    issue: 138,
    message: '`@event name: T;` no longer bubbles: `@event(bubbles) name: T;` keeps the event reaching the ancestors it reached.',
    detect: (text): LanguageChangeFinding[] => plainEvents(text).map(({ line, found }) => ({ line, found })),
    fix: (text) => {
        let out = text;
        for (const { keywordEnd } of plainEvents(text).reverse()) out = `${out.slice(0, keywordEnd)}(bubbles)${out.slice(keywordEnd)}`;
        return out;
    },
};

/** The script and template blocks of a .pdx: where `$emit` is looked for. */
function emitBlocks(text: string): { from: number; to: number }[] {
    const sfc = parseSFC(text);
    const out: { from: number; to: number }[] = [];
    for (const block of [sfc.script, sfc.template]) {
        if (block && !block.src) out.push({ from: block.start, to: block.start + block.content.length });
    }
    return out.sort((a, b) => a.from - b.from);
}

// Match: a call of `$emit` — the call up to its closing parenthesis on the same line, for the finding.
const EMIT_CALL = /\$emit\s*\([^)\n]*\)?/g;
// Match: `$emit('name'` / `$emit("name"` / `` $emit(`name` `` with an identifier for a name, and the comma
// after it when there is one. Groups: [1]=the quote [2]=the name
const EMIT_NAMED = /\$emit\s*\(\s*(['"`])([A-Za-z_$][\w$]*)\1\s*(?:,\s*)?/g;

export const emitRemoved: LanguageChange = {
    id: 'emit-removed',
    kind: 'removed',
    scope: 'pdx',
    issue: 138,
    message: 'dispatch with the function the declaration creates: `@event saved: T;` then `saved(x)`.',
    detect(text) {
        const findings: LanguageChangeFinding[] = [];
        for (const { from, to } of emitBlocks(text)) {
            for (const m of text.slice(from, to).matchAll(EMIT_CALL)) findings.push({ line: lineAt(text, from + m.index), found: m[0] });
        }
        return findings;
    },
    fix(text) {
        const used = new Set<string>();
        let out = '';
        let last = 0;
        for (const { from, to } of emitBlocks(text)) {
            out += text.slice(last, from) + text.slice(from, to).replace(EMIT_NAMED, (_m, _q: string, name: string) => {
                used.add(name);
                return `${name}(`;
            });
            last = to;
        }
        out += text.slice(last);
        // The declarations the script is missing, written at the top of the script.
        const script = parseSFC(out).script;
        if (!script || script.src) return out;
        const declared = new Set([...script.content.matchAll(/^[ \t]*@event(?:\(\s*bubbles\s*\))?\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
        const missing = [...used].filter((name) => !declared.has(name));
        if (missing.length === 0) return out;
        const at = script.start + (script.content.startsWith('\n') ? 1 : 0);
        return out.slice(0, at) + missing.map((name) => `@event ${name}: unknown;\n`).join('') + out.slice(at);
    },
};
