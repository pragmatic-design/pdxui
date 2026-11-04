// The grammar and RUNES name the same runes (#159, part 2).
//
// `docs/language/beta/grammar.md` defines the script's declarations and runes; `RUNES`
// (`src/compiler/runes.ts`) is the one list the analyzer, the language server and the editor grammar
// read. language-reference.test.ts checks one way, that every rune has a section. This is the other:
// a declaration an issue added to the grammar but not to RUNES has no completion and reaches
// TypeScript as text, and a rune left in RUNES after its removal is still offered.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNES } from '../src/compiler/runes';

const GRAMMAR = join(__dirname, '..', '..', '..', 'docs', 'language', 'beta', 'grammar.md');

/** The EBNF of the page, its ```ebnf blocks joined, with each production's continuation lines on its first. */
function productions(markdown: string): Map<string, string> {
    const ebnf = [...markdown.matchAll(/```ebnf\n([\s\S]*?)```/g)].map(m => m[1]).join('\n');
    const rules = new Map<string, string>();
    let current: string | null = null;
    for (const line of ebnf.split('\n')) {
        // Match: `Name ::= body` — a production; a line that starts with spaces continues the last one.
        const head = /^([A-Z][A-Za-z0-9]*)\s*::=(.*)$/.exec(line);
        if (head) { current = head[1]; rules.set(current, head[2]); }
        else if (current && /^\s+\S/.test(line)) rules.set(current, rules.get(current) + ' ' + line.trim());
    }
    return rules;
}

/** A production's body without its comments: `(β …)` notes, `/* … *\/` and `(† …)`. */
function body(rule: string): string {
    return rule.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\((?:β|†|proposed|the |#)[^)]*\)\s*$/g, '');
}

/** The `@name` each declaration of the four declaration productions begins with. */
export function declarationKeywords(markdown: string): Set<string> {
    const rules = productions(markdown);
    const names = new Set<string>();
    for (const group of ['ComponentDecl', 'ModuleDecl', 'RouteDecl', 'DataDecl']) {
        const alternatives = body(rules.get(group) ?? '').split('|').map(s => s.trim()).filter(Boolean);
        for (const alt of alternatives) {
            // Match: the first `"@name"` literal of the alternative's own production.
            const first = /"@([a-z0-9]+)"/.exec(body(rules.get(alt) ?? ''));
            if (first) names.add(first[1]);
        }
    }
    return names;
}

/** The `$name`s the «Runes» section's productions spell. */
export function runeFunctions(markdown: string): Set<string> {
    const section = /### Runes\n([\s\S]*?)\n### /.exec(markdown)?.[1] ?? '';
    return new Set([...section.matchAll(/"\$([a-z]+)"/g)].map(m => m[1]));
}

describe('the scan can fail', () => {
    const page = [
        '```ebnf',
        'Declaration    ::= ComponentDecl | ModuleDecl | RouteDecl | DataDecl',
        'ComponentDecl  ::= PropDecl | ModelDecl',
        '                 | TagDecl',
        'ModuleDecl     ::= RawScriptBlock                     († `@mixin` removed — decisions.md 6)',
        'RouteDecl      ::= PageDecl',
        '                 /* † removed: @route — decisions.md 1 */',
        'DataDecl       ::= FetchDecl',
        'PropDecl       ::= "@prop" S Identifier End          (β #130)',
        'ModelDecl      ::= "@model" S Identifier End',
        'TagDecl        ::= "@tag" S StringLiteral End',
        'RawScriptBlock ::= "@raw" S? "{" "}"',
        'PageDecl       ::= "@page" S StringLiteral End',
        'FetchDecl      ::= "@fetch" S Identifier End',
        '```',
        '',
        '### Runes',
        '',
        '```ebnf',
        'Rune           ::= "$signal" | "$derived"',
        'EffectCall     ::= "$effect" S? "(" ")"',
        '```',
        '',
        '### Route declarations',
    ].join('\n');

    it('reads each declaration\'s keyword, across continuation lines, and not a removed one in a comment', () => {
        expect([...declarationKeywords(page)].sort()).toEqual(['fetch', 'model', 'page', 'prop', 'raw', 'tag']);
    });

    it('reads the $runes of the Runes section', () => {
        expect([...runeFunctions(page)].sort()).toEqual(['derived', 'effect', 'signal']);
    });
});

describe('grammar.md and RUNES', () => {
    const page = readFileSync(GRAMMAR, 'utf-8').replace(/\r\n/g, '\n');
    const declarations = declarationKeywords(page);
    const functions = runeFunctions(page);
    const decorators = new Set(RUNES.filter(r => r.kind === 'decorator').map(r => r.name));
    const runeFns = new Set(RUNES.filter(r => r.kind === 'function').map(r => r.name));

    it('reads a grammar with declarations and runes', () => {
        expect(declarations.size).toBeGreaterThan(25);
        expect(functions.size).toBeGreaterThan(5);
    });

    it('every declaration the grammar defines is a rune', () => {
        expect([...declarations].filter(n => !decorators.has(n)).sort()).toEqual([]);
    });

    it('every declaration rune is one the grammar defines', () => {
        expect([...decorators].filter(n => !declarations.has(n)).sort()).toEqual([]);
    });

    it('every $rune of the grammar is a rune, and every $rune is in the grammar', () => {
        expect([...functions].filter(n => !runeFns.has(n)).sort()).toEqual([]);
        expect([...runeFns].filter(n => !functions.has(n)).sort()).toEqual([]);
    });
});
