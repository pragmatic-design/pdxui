// LSP L2 — find references: local symbols (current doc) + component tags (cross-file).

import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { getReferences } from '../src/capabilities/references';
import { findTagOccurrences } from '../src/utils/occurrences';

const URI = 'file:///comp.pdx';
const source = [
    '<template>',                                  // 0
    '  <div>{{ count }}</div>',                     // 1
    '  <pdx-button :label="count">x</pdx-button>', // 2
    '</template>',                                 // 3
    '<script setup>',                              // 4
    'let count = $signal(0);',                     // 5
    'function inc() { count++; }',                 // 6
    '</script>',                                   // 7
].join('\n');

const { analysis, descriptor } = analyzeDocument(source, 'comp.pdx');

function refs(word: string, includeDeclaration = true) {
    return getReferences({
        word, source, descriptor, analysis, uri: URI,
        files: [{ uri: URI, content: source }],
        includeDeclaration,
    });
}

describe('find references — local symbol', () => {
    it('finds every occurrence in script + template reactive zones', () => {
        const locs = refs('count');
        // declaration + count++ (script) + ${count} + :label="count" (template)
        expect(locs).toHaveLength(4);
        expect(locs.every(l => l.uri === URI)).toBe(true);
    });

    it('excludes the declaration when includeDeclaration is false', () => {
        const all = refs('count', true).length;
        const noDecl = refs('count', false).length;
        expect(noDecl).toBe(all - 1);
    });

    it('does not match inside raw text or partial identifiers', () => {
        // 'inc' is a function; used only at its declaration here → 1 occurrence
        expect(refs('inc')).toHaveLength(1);
    });

    it('returns nothing for an unknown identifier', () => {
        expect(refs('nope')).toHaveLength(0);
    });

    it('does not treat loop/slot variables as referenceable symbols', () => {
        // 'item' is not a declared symbol (it would be a loop var) → no references
        expect(refs('item')).toHaveLength(0);
    });
});

describe('tag occurrences — robustness', () => {
    it('ignores tags inside HTML comments', () => {
        const content = [
            '<template>',
            '  <!-- <pdx-card>old</pdx-card> -->',
            '  <pdx-card>real</pdx-card>',
            '</template>',
        ].join('\n');
        // Only the real open+close, the commented pair is masked.
        expect(findTagOccurrences(content, 'pdx-card')).toHaveLength(2);
    });

    it('does not match a longer tag with the same prefix', () => {
        const content = '<pdx-card-header /><pdx-card />';
        expect(findTagOccurrences(content, 'pdx-card')).toHaveLength(1);
    });
});

describe('find references — @prop / @event cross-file', () => {
    const counter = [
        '<template><button>{{ label }}</button></template>',
        '<script setup>',
        "@prop label: string = 'Hi';",
        '@event changed: number;',
        '</script>',
    ].join('\n');
    const app = '<template><pdx-counter :label="t" @changed="f" /><pdx-counter label="x" /></template>';
    const cDoc = analyzeDocument(counter, 'counter.pdx');
    const cUri = 'file:///counter.pdx';
    const aUri = 'file:///app.pdx';
    const files = [{ uri: cUri, content: counter }, { uri: aUri, content: app }];

    it('finds a prop in its declaration, own template, and consumer attributes', () => {
        const locs = getReferences({
            word: 'label', source: counter, descriptor: cDoc.descriptor, analysis: cDoc.analysis,
            uri: cUri, files, includeDeclaration: true,
        });
        // counter: decl + {{ label }} = 2 ; app: :label + label="x" = 2
        expect(locs.filter(l => l.uri === cUri)).toHaveLength(2);
        expect(locs.filter(l => l.uri === aUri)).toHaveLength(2);
    });

    it('finds an event listener in consumers', () => {
        const locs = getReferences({
            word: 'changed', source: counter, descriptor: cDoc.descriptor, analysis: cDoc.analysis,
            uri: cUri, files, includeDeclaration: true,
        });
        expect(locs.filter(l => l.uri === aUri)).toHaveLength(1);
    });
});

describe('find references — component tag (cross-file)', () => {
    it('scans every workspace file for the tag', () => {
        const fileA = { uri: 'file:///a.pdx', content: '<template><pdx-card>x</pdx-card></template>' };
        const fileB = { uri: 'file:///b.pdx', content: '<template><pdx-card /><pdx-card>y</pdx-card></template>' };
        const locs = getReferences({
            word: 'pdx-card', source: '', descriptor: null, analysis: null,
            uri: 'file:///a.pdx', files: [fileA, fileB], includeDeclaration: true,
        });
        // A: <pdx-card + </pdx-card> = 2 ; B: <pdx-card + <pdx-card + </pdx-card> = 3
        expect(locs).toHaveLength(5);
        expect(locs.filter(l => l.uri === fileB.uri)).toHaveLength(3);
    });
});
