// LSP L2 — rename: local symbols, cross-file @prop/@event, component tag + file.

import { describe, it, expect } from 'vitest';
import { Range } from 'vscode-languageserver';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { prepareRename, getRenameEdits, InvalidRenameError } from '../src/capabilities/rename';
import { buildComponentIndex } from '../src/utils/component-index';

const COUNTER_URI = 'file:///counter.pdx';
const APP_URI = 'file:///app.pdx';

const counter = [
    '<template><button @click="emitChanged">{{ label }}</button></template>',
    '<script setup>',
    "@prop label: string = 'Hi';",
    '@event changed: number;',
    'let count = $signal(0);',
    'function emitChanged() { changed(count); count++; }',
    '</script>',
].join('\n');

const app = [
    '<template>',
    '  <pdx-counter :label="title" @changed="onChange" />',
    '  <pdx-counter label="static" />',
    '</template>',
    '<script setup>',
    "let title = $signal('x');",
    'function onChange(n) { return n; }',
    '</script>',
].join('\n');

const counterDoc = analyzeDocument(counter, 'counter.pdx');
const files = [{ uri: COUNTER_URI, content: counter }, { uri: APP_URI, content: app }];
const index = buildComponentIndex(files);
const dummyRange = Range.create(2, 6, 2, 11);

function symbolRename(word: string, newName: string) {
    return getRenameEdits({
        word, newName, source: counter, descriptor: counterDoc.descriptor, analysis: counterDoc.analysis,
        uri: COUNTER_URI, files, index,
    });
}

describe('prepareRename', () => {
    it('allows a local symbol, returning the range under the cursor', () => {
        expect(prepareRename({ word: 'count', source: counter, descriptor: counterDoc.descriptor, analysis: counterDoc.analysis, wordRange: dummyRange }))
            .toEqual(dummyRange);
    });

    it('allows a component tag (now renamable)', () => {
        expect(prepareRename({ word: 'pdx-counter', source: app, descriptor: null, analysis: null, wordRange: dummyRange }))
            .toEqual(dummyRange);
    });

    it('rejects unknown identifiers and missing word range', () => {
        expect(prepareRename({ word: 'nope', source: counter, descriptor: counterDoc.descriptor, analysis: counterDoc.analysis, wordRange: dummyRange })).toBeNull();
        expect(prepareRename({ word: 'count', source: counter, descriptor: counterDoc.descriptor, analysis: counterDoc.analysis, wordRange: null })).toBeNull();
    });
});

describe('rename — local symbol', () => {
    it('rewrites a signal across script + template of the current file only', () => {
        const edit = symbolRename('count', 'total')!;
        expect(Object.keys(edit.changes!)).toEqual([COUNTER_URI]);
        // declaration + changed(count) + count++ = 3
        expect(edit.changes![COUNTER_URI]).toHaveLength(3);
    });

    it('throws on an invalid identifier', () => {
        expect(() => symbolRename('count', '1bad')).toThrow(InvalidRenameError);
    });
});

describe('rename — @prop / @event cross-file', () => {
    it('updates the @prop declaration and every consumer attribute', () => {
        const edit = symbolRename('label', 'caption')!;
        // counter.pdx: @prop decl + {{ label }} = 2
        expect(edit.changes![COUNTER_URI]).toHaveLength(2);
        // app.pdx: :label + label="static" = 2
        expect(edit.changes![APP_URI]).toHaveLength(2);
        expect(edit.changes![APP_URI].every(e => e.newText === 'caption')).toBe(true);
    });

    it('updates the @event declaration and consumer listeners', () => {
        const edit = symbolRename('changed', 'updated')!;
        // counter.pdx: @event decl + changed(count) = 2
        expect(edit.changes![COUNTER_URI]).toHaveLength(2);
        // app.pdx: @changed = 1
        expect(edit.changes![APP_URI]).toHaveLength(1);
    });
});

describe('rename — component tag + source file', () => {
    it('renames every usage and renames the defining file', () => {
        const edit = getRenameEdits({
            word: 'pdx-counter', newName: 'pdx-tally', source: app, descriptor: null, analysis: null,
            uri: APP_URI, files, index,
        })!;
        expect(edit.documentChanges).toBeDefined();
        const dc = edit.documentChanges as any[];
        // a RenameFile op for counter.pdx → tally.pdx
        const rename = dc.find(c => c.kind === 'rename');
        expect(rename).toBeDefined();
        expect(rename.oldUri).toBe(COUNTER_URI);
        expect(rename.newUri).toBe('file:///tally.pdx');
        // text edits for the two usages in app.pdx
        const appEdit = dc.find(c => c.textDocument?.uri === APP_URI);
        expect(appEdit.edits).toHaveLength(2);
    });

    it('rejects an invalid tag name', () => {
        expect(() => getRenameEdits({
            word: 'pdx-counter', newName: 'Tally', source: app, descriptor: null, analysis: null,
            uri: APP_URI, files, index,
        })).toThrow(InvalidRenameError);
    });
});
