// The PDX grammar (packages/vscode-pdx/syntaxes/pdx.tmLanguage.json).
//
// Its rune alternations are generated from the compiler's one rune list, so a rune the compiler
// learns is highlighted with no hand edit; this fails when the committed grammar is not what
// `npm run gen-grammar` (packages/vscode-pdx) writes. And the hand-written rules are measured on the
// patterns themselves (no grammar engine is a dependency): a binding's value is TypeScript, and a
// block's opening tag may carry attributes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { RUNES } from '@pdxui/compiler';
import { TEMPLATE_AT_DIRECTIVES } from '../../compiler/src/parser/template-directives';
import { GRAMMAR_PATH, generateGrammar, grammarText } from '../../vscode-pdx/scripts/gen-grammar.mjs';

interface Rule { match?: string; begin?: string; contentName?: string; include?: string; patterns: Rule[] }
interface Grammar { repository: Record<string, Rule> }

// Line endings normalised: a Windows checkout writes the committed file with CRLF (no .gitattributes
// rule for it), the generator writes LF.
const committed = readFileSync(GRAMMAR_PATH, 'utf-8').replace(/\r\n/g, '\n');
const grammar = JSON.parse(committed) as Grammar;

/** A TextMate (Oniguruma) pattern as a JS RegExp — the ones here use no syntax the two disagree on. */
const re = (pattern: string) => new RegExp(pattern);

describe('the grammar\'s rune alternations', () => {
    it('are what the generator writes from the compiler\'s rune list', () => {
        expect(committed, 'stale grammar: run `npm run gen-grammar` in packages/vscode-pdx').toBe(grammarText(generateGrammar(grammar, RUNES, TEMPLATE_AT_DIRECTIVES)));
    });

    it('go stale the moment the list gains a rune', () => {
        const more = [...RUNES, { name: 'newrune', kind: 'decorator' as const }];
        expect(grammarText(generateGrammar(grammar, more, TEMPLATE_AT_DIRECTIVES))).not.toBe(committed);
    });

    it('highlight every declaration and every $ function', () => {
        const decorator = re(grammar.repository['pdx-decorators'].patterns[0].match!);
        const fn = re(grammar.repository['pdx-runes'].patterns[0].match!);
        for (const r of RUNES) {
            if (r.kind === 'decorator') expect(`  @${r.name} x;`, r.name).toMatch(decorator);
            else expect(`$${r.name}(x)`, r.name).toMatch(fn);
        }
    });
});

// The template's @-words are the parser's own list (#297), so a word the parser learns —
// `@render`, `@virtual`, `@keepAlive` — is highlighted the day it lands, with no hand edit.
describe('the grammar\'s template directives', () => {
    const directive = () => re(grammar.repository['pdx-directives'].patterns[0].match!);

    it('highlight every @-word the template parser reads', () => {
        for (const word of TEMPLATE_AT_DIRECTIVES) expect(`@${word} (x)`, word).toMatch(directive());
        // The three the hand-written list had missed.
        for (const line of ['@await (user) {', '@let x = 1;', '@raw {']) expect(line).toMatch(directive());
    });

    it('go stale the moment the parser\'s list gains a word', () => {
        expect(grammarText(generateGrammar(grammar, RUNES, [...TEMPLATE_AT_DIRECTIVES, 'render']))).not.toBe(committed);
    });

    it('mark the keywords inside a directive\'s parentheses, @defer\'s included', () => {
        const kw = re(grammar.repository['pdx-directives'].patterns[1].match!);
        for (const w of ['as', 'track', 'prefetch', 'when']) expect(` ${w} `, w).toMatch(kw);
    });
});

describe('the hand-written rules', () => {
    it('keep a binding value TypeScript when a modifier takes an argument', () => {
        const begins = grammar.repository['pdx-bindings'].patterns.filter(p => p.begin).map(r => re(r.begin!));
        expect(begins.some(b => b.test('::value.debounce(300)="q"')), '.debounce(300) breaks the binding').toBe(true);
    });

    it('read attach: as a binding, with and without a value', () => {
        const rules = grammar.repository['pdx-bindings'].patterns;
        const attach = rules.filter(r => (r.match ?? r.begin ?? '').startsWith('(attach:)'));
        expect(attach.length, 'no attach: rule').toBeGreaterThan(0);
        // First, so `attach:name` is not read as an attribute followed by a `:name` binding.
        expect((rules[0].match ?? rules[0].begin ?? '').startsWith('(attach:)')).toBe(true);
        const patterns = attach.map(r => re(r.match ?? r.begin!));
        expect(patterns.some(p => p.test('attach:autofocus')), 'attach:autofocus').toBe(true);
        expect(patterns.some(p => p.test("attach:tooltip=\"'x'\"")), "attach:tooltip=\"'x'\"").toBe(true);
    });

    it('mark @variant and its tests inside a style block, before the CSS', () => {
        const style = grammar.repository['style-block'].patterns;
        const at = style.findIndex(p => p.include === '#pdx-css-variant');
        expect(at, 'no @variant rule in the style block').toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(style.findIndex(p => p.include === 'source.css'));
        const variant = re(grammar.repository['pdx-css-variant'].patterns[0].match!);
        expect('@variant size(sm) and variant(ghost) {').toMatch(variant);
        expect('@variant size(sm) {').toMatch(variant);
    });

    it('embed TypeScript in a binding\'s value', () => {
        const valued = grammar.repository['pdx-bindings'].patterns.filter(p => p.begin);
        expect(valued.length, 'no binding rule with a value').toBeGreaterThan(0);
        for (const rule of valued) {
            expect(rule.contentName).toBe('source.ts');
            expect(rule.patterns).toContainEqual({ include: 'source.ts' });
        }
        const begins = valued.map(r => re(r.begin!));
        for (const attr of [':value="count"', '@click="save(item)"', '::model="name"', ":label='title'"]) {
            expect(begins.some(b => b.test(attr)), attr).toBe(true);
        }
    });

    it('open a block whose tag carries attributes, and not a self-closing one', () => {
        const open = (block: string) => re(grammar.repository[block].begin!);
        expect('<template>').toMatch(open('template-block'));
        expect('<template shadow>').toMatch(open('template-block'));
        expect('<script setup>').toMatch(open('script-block'));
        expect('<script setup lang="ts">').toMatch(open('script-block'));
        expect('<style scoped>').toMatch(open('style-block'));
        expect('<style scoped src="x.css">').toMatch(open('style-block'));
        // A block read from another file has no content and no closing tag to wait for.
        expect('<script setup src="./logic.ts" />').not.toMatch(open('script-block'));
    });
});
