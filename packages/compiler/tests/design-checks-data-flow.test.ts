// The data-flow pair of the component-design rules.
//
//   CD-S2  PDX_DERIVED_WRITE    what is $derived is never written — nor the objects it returns
//   CD-D2  PDX_EFFECT_STATE     an effect does not compute state that could be $derived (heuristic)
//
// Each check is held to a real case of the showcase, reproduced here: `syncSettings` writing
// `item.checked` into the objects `profileItems` ($derived) returns, and `noteRecent`, called from a
// `$watch` on the path, bumping `recentsVersion` to force a re-read. CD-D2's control is the one the
// design doc names: the tickets list's live watch, which writes state from what a side effect
// answered, and is right.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const warningsOf = (source: string, code: string) => compile(source, 'piece.pdx').warnings.filter(w => w.code === code);
const sfc = (script: string) => `<template><p>{{ label }}</p></template>\n<script setup>\n${script}\n</script>\n`;

describe('CD-S2 — PDX_DERIVED_WRITE', () => {
    it('the syncSettings shape: a member written through locals that came from a $derived', () => {
        const ws = warningsOf(sfc([
            "let scheme = $signal('light');",
            "const profileItems = $derived([{ key: 'settings', children: [{ key: 'dark', checked: scheme === 'dark' }] }]);",
            'const label = $derived(profileItems.length);',
            'function syncSettings() {',
            "  const settings = profileItems.find(i => i.key === 'settings');",
            '  for (const item of settings.children) {',
            "    item.checked = item.key === scheme;",
            '  }',
            '}',
        ].join('\n')), 'PDX_DERIVED_WRITE');
        expect(ws, 'the write into the derived objects was not reported').toHaveLength(1);
        expect(ws[0].message).toContain('CD-S2');
        expect(ws[0].message).toContain('profileItems');
        expect(ws[0].line, 'reported on another line than the write').toBe(9);
    });

    it('a member of the derived itself, written directly', () => {
        const ws = warningsOf(sfc([
            'const rows = $derived([{ n: 1 }]);',
            'const label = $derived(rows.length);',
            'function bump() { rows[0].n = 2; }',
        ].join('\n')), 'PDX_DERIVED_WRITE');
        expect(ws).toHaveLength(1);
    });

    it('control — a member of a $signal\'s value, or of a local object, is not reported', () => {
        expect(warningsOf(sfc([
            'let rows = $signal([{ n: 1 }]);',
            'const label = $derived(rows.length);',
            'function bump() { const copy = { n: 1 }; copy.n = 2; }',
        ].join('\n')), 'PDX_DERIVED_WRITE')).toHaveLength(0);
    });

    it('control — reading a derived, and copying it before writing, are not reported', () => {
        expect(warningsOf(sfc([
            'const rows = $derived([{ n: 1 }]);',
            'const label = $derived(rows.length);',
            'function next() { const copy = { ...rows[0] }; copy.n = 2; return copy; }',
        ].join('\n')), 'PDX_DERIVED_WRITE')).toHaveLength(0);
    });
});

describe('CD-D2 — PDX_EFFECT_STATE', () => {
    it('the noteRecent shape: a watch calls a same-file function that bumps a $signal', () => {
        const ws = warningsOf(sfc([
            "let path = $signal('/');",
            'let recentsVersion = $signal(0);',
            'const label = $derived(recentsVersion);',
            '$watch(path, (p) => noteRecent(p));',
            'function noteRecent(p) {',
            "  localStorage.setItem('recent', p);",
            '  recentsVersion++;',
            '}',
        ].join('\n')), 'PDX_EFFECT_STATE');
        expect(ws, 'the counter bumped from a watch was not reported').toHaveLength(1);
        expect(ws[0].message).toContain('CD-D2');
        expect(ws[0].message).toContain('recentsVersion');
        expect(ws[0].message, 'a heuristic that does not say so').toMatch(/heuristic/i);
    });

    it('a watch that writes a value computed from what it watches', () => {
        const ws = warningsOf(sfc([
            'let count = $signal(0);',
            'let doubled = $signal(0);',
            'const label = $derived(doubled);',
            '$watch(count, (c) => { doubled = c * 2; });',
        ].join('\n')), 'PDX_EFFECT_STATE');
        expect(ws).toHaveLength(1);
    });

    it('an $effect that writes a signal', () => {
        const ws = warningsOf(sfc([
            'let count = $signal(0);',
            'let label = $signal(\'\');',
            '$effect(() => { label = String(count); });',
        ].join('\n')), 'PDX_EFFECT_STATE');
        expect(ws).toHaveLength(1);
    });

    it('control — the tickets live watch: the writes follow what a side effect answered', () => {
        expect(warningsOf(sfc([
            'let lastEvent = $signal(null);',
            "let liveNotice = $signal('');",
            'let current = $signal(null);',
            'const label = $derived(liveNotice);',
            'const source = { applyServerChange: () => \'applied\' };',
            '$watch(lastEvent, (event) => {',
            '  if (!event) return;',
            '  const outcome = source.applyServerChange({ type: event.type });',
            "  if (outcome === 'shadowed') { liveNotice = 'shadowed'; return; }",
            "  if (outcome === 'applied') {",
            "    liveNotice = 'changed';",
            "    if (event.type === 'deleted') current = null;",
            '  }',
            '});',
        ].join('\n')), 'PDX_EFFECT_STATE')).toHaveLength(0);
    });

    it('control — a watch that writes storage, the URL or the DOM, and no signal', () => {
        expect(warningsOf(sfc([
            "let path = $signal('/');",
            'const label = $derived(path);',
            "$watch(path, (p) => { localStorage.setItem('last', p); document.title = p; });",
        ].join('\n')), 'PDX_EFFECT_STATE')).toHaveLength(0);
    });

    it('control — a callback written inside the effect runs on its own event: an observer\'s write is not reported', () => {
        // comp-navbar's shape: the ResizeObserver's callback writes the width when the frame resizes.
        expect(warningsOf(sfc([
            "let label = $signal('');",
            'let frame = $signal(null);',
            '$effect(() => {',
            '  if (!frame) return;',
            '  const observer = new ResizeObserver((entries) => { label = String(entries[0].contentRect.width); });',
            '  observer.observe(frame);',
            '});',
        ].join('\n')), 'PDX_EFFECT_STATE')).toHaveLength(0);
    });

    it('a flag only the effect writes is reported, constants or not', () => {
        const ws = warningsOf(sfc([
            'let count = $signal(0);',
            'let big = $signal(false);',
            'const label = $derived(big);',
            '$watch(count, (c) => { if (c > 5) big = true; else big = false; });',
        ].join('\n')), 'PDX_EFFECT_STATE');
        expect(ws).toHaveLength(1);
    });

    it('control — the asset picker: a watch resets to a constant what a handler chose', () => {
        expect(warningsOf(sfc([
            'let customer = $signal(0);',
            "let label = $signal('');",
            '$watch(customer, () => {',
            "  if (label) { label = ''; }",
            '});',
            "function onPick(row) { label = 'picked ' + row.name; }",
        ].join('\n')), 'PDX_EFFECT_STATE')).toHaveLength(0);
    });

    it('control — the catalog: a watch resets to a constant what a template handler chose', () => {
        const source = [
            '<template><input :value="query" @input="e => query = e.target.value"><p>{{ query }}</p></template>',
            '<script setup>',
            '@prop open: boolean = false;',
            "let query = $signal('');",
            "$watch(open, (isOpen) => { if (!isOpen) return; query = ''; });",
            '</script>',
        ].join('\n');
        expect(warningsOf(source, 'PDX_EFFECT_STATE')).toHaveLength(0);
    });

    it('control — the documents list: a write after an await runs on the answer, not in the effect', () => {
        expect(warningsOf(sfc([
            'let id = $signal(0);',
            'let documents = $signal([]);',
            'let loaded = $signal(false);',
            'const label = $derived(loaded && documents.length);',
            'async function reload() {',
            '  const res = await fetch(`/api/attachments?employee=${id}`);',
            '  documents = await res.json();',
            '  loaded = true;',
            '}',
            '$effect(() => { void id; reload(); });',
        ].join('\n')), 'PDX_EFFECT_STATE')).toHaveLength(0);
    });

    it('control — a $derived is the answer, and nothing is reported for it', () => {
        expect(warningsOf(sfc([
            'let count = $signal(0);',
            'const label = $derived(count * 2);',
        ].join('\n')), 'PDX_EFFECT_STATE')).toHaveLength(0);
    });
});
