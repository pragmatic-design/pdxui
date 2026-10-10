// Every declaration the script analyzer recognises has an entry in RUNES (#106).
//
// RUNES is the one list of runes: completion, hover and the LSP's TypeScript projection read it, and
// so does the analyzer's own "unknown declaration" check. `@use` and `@raw` were parsed and missing
// from it, so the editor neither completed nor explained them, and nothing said so. The keywords
// are read from the analyzer's source — every `startsWith('@name` and `/^@name` it tests a line
// against — so a declaration added there without an entry here turns this red.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNES } from '../src/compiler/runes';

const ANALYZER = readFileSync(join(__dirname, '..', 'src', 'compiler', 'script-analyzer.ts'), 'utf8');

/** The `@keyword`s the analyzer tests a line against. */
function recognised(): string[] {
    const names = new Set<string>();
    // Match: startsWith('@name  or  /^@name   Groups: [1] or [2] = the name
    for (const m of ANALYZER.matchAll(/startsWith\('@(\w+)|\/\^@(\w+)/g)) names.add(m[1] ?? m[2]);
    return [...names].sort();
}

describe('RUNES covers what the analyzer recognises', () => {
    it('found the analyzer\'s declarations, so the check below is not vacuous', () => {
        expect(recognised()).toEqual(expect.arrayContaining(['prop', 'page', 'fetch', 'snippet', 'mixin']));
    });

    it('every declaration the analyzer recognises has a RUNES entry', () => {
        const listed = new Set(RUNES.filter((r) => r.kind === 'decorator').map((r) => r.name));
        expect(recognised().filter((name) => !listed.has(name))).toEqual([]);
    });

    it('@use and @raw show the shapes the analyzer reads', () => {
        const use = RUNES.find((r) => r.name === 'use' && r.kind === 'decorator');
        const raw = RUNES.find((r) => r.name === 'raw' && r.kind === 'decorator');
        expect(use?.shape).toMatch(/^@use '[^']+' from '[^']+'/);
        expect(raw?.shape).toMatch(/^@raw \{/);
    });
});
