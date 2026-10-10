// The reference application says nothing in a language it cannot change.
//
// `i18n-no-literal-strings.test.ts` next door guards the LIBRARY's strings — what a component
// registers and `setLocaleStrings` can reach. This one guards the APP's: the prose a `.pdx`
// template writes between its tags, which only `$t` can move.
//
// The two belong together. A showcase that translates one and not the
// other has translated half a screen, and it is the half a reader notices first.
//
// Why a guard rather than a review: a literal does not fail. The page renders, in English, and the
// only way to find it is to switch the language and read every screen — which is what the guard
// does instead, once per commit.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { removeHtmlComments } from '../../compiler/src/text-scan';

const SHOWCASE_SRC = join(__dirname, '../../showcase/src');

function pdxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...pdxFiles(full));
        else if (name.endsWith('.pdx')) out.push(full);
    }
    return out;
}

/** The `<template>` block, with comments removed. */
function templateOf(source: string): string {
    const m = /<template[^>]*>([\s\S]*?)<\/template>\s*(?:<script|<style|$)/.exec(source);
    return removeHtmlComments(m?.[1] ?? '');
}

/**
 * The prose a reader would see, with everything that is not prose taken out first:
 * interpolations, tags, entities, and anything that is only punctuation or digits.
 */
function literalProse(template: string): string[] {
    const text = template
        .replace(/\{\{[\s\S]*?\}\}/g, '\u0000')   // an interpolation is not a literal
        .replace(/<[^>]*>/g, '\u0000')            // tags, with their attributes
        // A block directive is code between the tags, not text: `@for (rows as row; track row.id) {`
        // reads as two words to a regex and is read by nobody.
        //
        // The modifiers count as part of it — `@for (…) @move(160) {`, `@stagger(50)`, `@mode(…)`
        // are documented in CONTRIBUTING.md and sit between the parenthesis and the brace. Without the
        // middle group this guard reports the board's `@for` as untranslated prose.
        .replace(/@[a-z]+\s*\([^)]*\)(?:\s*@[a-z]+\s*\([^)]*\))*\s*\{/gi, '\u0000')
        .replace(/@(?:else|catch|placeholder|loading|error|then)\b[^{]*\{/gi, '\u0000')
        .replace(/[{}]/g, '\u0000')
        .replace(/&[a-zA-Z#0-9]+;/g, ' ');

    return text.split('\u0000')
        .map(s => s.replace(/\s+/g, ' ').trim())
        // Two or more words, at least one of them a real word: `· 2` or `—` is not prose.
        .filter(s => /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s));
}

/** Attribute values a user reads or hears, written as a literal rather than bound. */
const READABLE_ATTRS = /\s(?:aria-label|placeholder|title|label|alt)="([^"{}$]*[A-Za-z]{2,}\s+[A-Za-z]{2,}[^"{}$]*)"/g;

describe('the showcase writes no prose a locale cannot move', () => {
    const files = pdxFiles(SHOWCASE_SRC);

    it('finds the templates to check', () => {
        // A guard over an empty set passes and teaches nothing — the failure mode every
        // file-walking assertion has.
        expect(files.length, 'no .pdx files found under packages/showcase/src').toBeGreaterThan(3);
        expect(files.some(f => f.endsWith('app.pdx'))).toBe(true);
    });

    it('has no literal sentence in a template', () => {
        const offenders: string[] = [];
        for (const file of files) {
            for (const s of literalProse(templateOf(readFileSync(file, 'utf8')))) {
                offenders.push(`${file.replace(/^.*[/\\]showcase[/\\]/, '')}: "${s.slice(0, 60)}"`);
            }
        }
        expect(offenders, `prose that $t cannot move:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('and none in an attribute a user reads', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const template = templateOf(readFileSync(file, 'utf8'));
            for (const m of template.matchAll(READABLE_ATTRS)) {
                offenders.push(`${file.replace(/^.*[/\\]showcase[/\\]/, '')}: ${m[0].trim()}`);
            }
        }
        expect(offenders, `attributes to bind through $t:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
});
