// The skill's language page has to describe the language the compiler actually implements.
//
// Without it nothing describes the `.pdx` file format. An agent that writes `<template>` /
// `<script setup>`, `:prop`, `@event`, `{{ }}`, `@if` from memory can get it right by luck, and
// leaves no trace of the gap — and anyone without Vue's SFC shape already in their head cannot begin.
//
// A page written from memory drifts from the language, so this
// asserts the page against the source: every rune, declaration and block directive it teaches must be
// one the compiler knows, and the vocabulary it lists must be complete.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
// A SKILL of its own, not a reference file. An agent picks what to open from the skill names and
// descriptions; anything under `references/` is reached only if something sends it there, and a
// reference nothing sends an agent to goes unopened for a whole run. The page nobody can afford to
// miss cannot be a link.
const PAGE = join(REPO, 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui-language', 'SKILL.md');
const RUNES_DTS = join(REPO, 'packages', 'compiler', 'src', 'runes.d.ts');
const ANALYZER = join(REPO, 'packages', 'compiler', 'src', 'compiler', 'script-analyzer.ts');
const TEMPLATE = join(REPO, 'packages', 'compiler', 'src', 'parser', 'template.ts');

const page = (): string => readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');

/** The runes the compiler declares, e.g. `$signal`. */
function realRunes(): string[] {
    return [...readFileSync(RUNES_DTS, 'utf8').matchAll(/declare function (\$\w+|on[A-Z]\w+)/g)]
        .map(m => m[1]);
}

/** The block directives the template parser accepts, from its own DIRECTIVES list. */
function realDirectives(): string[] {
    const src = readFileSync(TEMPLATE, 'utf8');
    const block = src.match(/const DIRECTIVES = \[([\s\S]*?)\] as const;/);
    if (!block) throw new Error('DIRECTIVES list not found — this check would be vacuous');
    return [...block[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
}

describe('the language page matches the compiler', () => {
    it('has a page to check', () => {
        expect(page().length, 'language.md is empty or missing').toBeGreaterThan(2000);
        expect(realRunes().length, 'no runes found in runes.d.ts').toBeGreaterThan(4);
        expect(realDirectives().length, 'no directives found in the parser').toBeGreaterThan(10);
    });

    it('teaches every rune the compiler declares', () => {
        const text = page();
        const missing = realRunes().filter(r => !text.includes(r));
        expect(missing, 'declared by the compiler and absent from the page').toEqual([]);
    });

    it('invents no rune', () => {
        // The failure mode of a page written from memory: a plausible name nobody implements.
        const real = new Set(realRunes());
        const taught = [...new Set([...page().matchAll(/`(\$\w+)\(/g)].map(m => m[1]))];
        expect(taught.filter(r => !real.has(r)), 'taught by the page and unknown to the compiler')
            .toEqual([]);
    });

    it('lists every block directive the parser accepts', () => {
        const text = page();
        const missing = realDirectives().filter(d => !new RegExp(`\\b${d}\\b`).test(text));
        expect(missing, 'accepted by the parser and never mentioned').toEqual([]);
    });

    it('invents no declaration', () => {
        // Every `@thing` the page presents as a declaration must appear in the analyzer. Block
        // directives are excluded — they share the `@` sigil and live in the template, not the script.
        const analyzer = readFileSync(ANALYZER, 'utf8');
        const directives = new Set(realDirectives());
        const taught = [...new Set([...page().matchAll(/`(@[a-z0-9]+)`/gi)].map(m => m[1]))]
            .filter(d => !directives.has(d.slice(1)));
        const unknown = taught.filter(d => !analyzer.includes(d));
        expect(unknown, 'taught as a declaration and unknown to the analyzer').toEqual([]);
    });

    it('gets the token scales right, since inventing one silently removes the styling', () => {
        // `--pdx-space-4` cost the first run an afternoon: not a token, `var()` resolves to nothing,
        // the whole app loses its padding and nothing errors. So the page must carry the real scale.
        const tokens = readFileSync(join(REPO, 'packages', 'design', 'src', 'tokens.css'), 'utf8');
        const declared = new Set([...tokens.matchAll(/(--pdx-(?:space|text|radius)-[a-z0-9]+)\s*:/g)]
            .map(m => m[1]));
        const text = page();

        for (const scale of ['space', 'text', 'radius']) {
            const steps = [...declared].filter(t => t.startsWith(`--pdx-${scale}-`))
                .map(t => t.replace(`--pdx-${scale}-`, ''));
            const missing = steps.filter(s => !new RegExp(`\\b${s}\\b`).test(text));
            expect(missing, `${scale} steps the page does not mention`).toEqual([]);
        }
    });

    it('names no token that does not exist', () => {
        const css = readFileSync(join(REPO, 'packages', 'design', 'src', 'tokens.css'), 'utf8');
        const declared = new Set([...css.matchAll(/(--pdx-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
        // `--pdx-space-4` appears in the page ON PURPOSE, as the counter-example. Anything else that
        // looks like a token has to be real.
        const named = [...new Set([...page().matchAll(/--pdx-[a-z0-9-]+/g)].map(m => m[0]))]
            .filter(t => t !== '--pdx-space-4' && !t.endsWith('-'));
        expect(named.filter(t => !declared.has(t)), 'named by the page, declared nowhere').toEqual([]);
    });
});
