// Tests for new runes: @expose, $store, $watch, @slot with scope type.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';

// ─── @expose ──────────────────────────────────────────────────────

describe('@expose', () => {
    it('detects single expose', () => {
        const a = analyzeScript(`
            @prop label: string = 'Hello';
            let open = $signal(false);
            function showModal() { open = true; }
            @expose showModal;
        `, 'test.pdx');
        expect(a.exposes).toEqual(['showModal']);
    });

    it('detects multiple expose names', () => {
        const a = analyzeScript(`
            let open = $signal(false);
            function show() { open = true; }
            function close() { open = false; }
            @expose show, close;
        `, 'test.pdx');
        expect(a.exposes).toEqual(['show', 'close']);
    });

    it('generates ctx.expose() in compiled output', () => {
        const source = `
<template><div>dialog</div></template>
<script setup>
let open = $signal(false);
function show() { open = true; }
function close() { open = false; }
@expose show, close;
</script>`;
        const result = compile(source, 'dialog.pdx');
        expect(result.code).toContain('ctx.expose({ show, close })');
    });
});

// ─── $store ───────────────────────────────────────────────────────

describe('$store', () => {
    it('detects $store declaration', () => {
        const a = analyzeScript(`
            let state = $store({ items: [], filter: 'all' });
        `, 'test.pdx');
        expect(a.stores).toHaveLength(1);
        expect(a.stores[0].name).toBe('state');
        expect(a.stores[0].initialExpr).toContain('items');
    });

    it('adds store to usedFeatures', () => {
        const a = analyzeScript(`
            let state = $store({ count: 0 });
        `, 'test.pdx');
        expect(a.usedFeatures.has('store')).toBe(true);
    });

    it('generates store() call in compiled output', () => {
        const source = `
<template><div>{{ state.count }}</div></template>
<script setup>
let state = $store({ count: 0, items: [] });
</script>`;
        const result = compile(source, 'store-test.pdx');
        expect(result.code).toContain('store(');
        expect(result.code).toContain("import { ");
        expect(result.code).toContain('store');
    });
});

// ─── $watch ───────────────────────────────────────────────────────

describe('$watch', () => {
    it('detects $watch with source and callback', () => {
        const a = analyzeScript(`
            let count = $signal(0);
            $watch(count, (n, o) => console.log(n, o));
        `, 'test.pdx');
        expect(a.watches).toHaveLength(1);
        expect(a.watches[0].source).toBe('count');
        expect(a.watches[0].callback).toContain('console.log');
    });

    it('detects $watch with options', () => {
        const a = analyzeScript(`
            let count = $signal(0);
            $watch(count, (n) => console.log(n), { immediate: true });
        `, 'test.pdx');
        expect(a.watches).toHaveLength(1);
        expect(a.watches[0].options).toContain('immediate');
    });

    it('adds watch to usedFeatures', () => {
        const a = analyzeScript(`
            let x = $signal(0);
            $watch(x, () => {});
        `, 'test.pdx');
        expect(a.usedFeatures.has('watch')).toBe(true);
    });

    it('generates watch() call in compiled output', () => {
        const source = `
<template><div>hello</div></template>
<script setup>
let count = $signal(0);
$watch(count, (n, o) => console.log('changed', n, o));
</script>`;
        const result = compile(source, 'watch-test.pdx');
        expect(result.code).toContain('watch(');
    });
});

// ─── @slot with scope type ────────────────────────────────────────

describe('@slot with scope type', () => {
    it('detects basic @slot', () => {
        const a = analyzeScript(`
            @slot content;
            let x = $signal(0);
        `, 'test.pdx');
        expect(a.slots).toHaveLength(1);
        expect(a.slots[0].name).toBe('content');
        expect(a.slots[0].scopeType).toBeUndefined();
    });

    it('detects @slot with scope type', () => {
        const a = analyzeScript(`
            @slot cell: { row: Item, column: string };
            let x = $signal(0);
        `, 'test.pdx');
        expect(a.slots).toHaveLength(1);
        expect(a.slots[0].name).toBe('cell');
        expect(a.slots[0].scopeType).toBe('{ row: Item, column: string }');
    });

    it('detects multiple slots with mixed types', () => {
        const a = analyzeScript(`
            @slot header;
            @slot cell: { row: object, index: number };
            @slot footer;
            let x = $signal(0);
        `, 'test.pdx');
        expect(a.slots).toHaveLength(3);
        expect(a.slots[0].scopeType).toBeUndefined();
        expect(a.slots[1].scopeType).toBe('{ row: object, index: number }');
        expect(a.slots[2].scopeType).toBeUndefined();
    });
});
