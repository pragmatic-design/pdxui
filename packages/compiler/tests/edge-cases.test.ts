// Edge-case tests for compiler robustness — strings, comments, multi-line.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import {
    extractBlock, extractCallBody, splitWatchArgs, normalizeStatements,
} from '../src/compiler/script-analyzer-helpers';

// ─── Signal Rewriter: strings and comments ──────────────────────────

describe('Signal rewriter — string safety', () => {
    it('does NOT rewrite signal name inside string literal', () => {
        const { code } = compile(`
<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
const label = "count++";
</script>`, 'test.pdx');

        // The string "count++" should NOT become "__count.set(..."
        expect(code).toContain('"count++"');
    });

    it('does NOT rewrite signal name inside template literal', () => {
        const { code } = compile(`
<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
const msg = \`The count is \${count}\`;
</script>`, 'test.pdx');

        // Template literal should keep the signal read, not double-rewrite
        expect(code).toContain('__count()');
    });

    it('handles multi-line array assignment correctly', () => {
        const { code } = compile(`
<template><div>{{ items }}</div></template>
<script setup>
let items = $signal([1, 2, 3]);

function reset() {
  items = [
    10,
    20,
    30,
  ];
}
</script>`, 'test.pdx');

        // Multi-line array should be wrapped in .set() completely
        expect(code).toContain('__items.set([');
        expect(code).toContain('30,');
        expect(code).toContain('])');
        // Should NOT have broken syntax like .set([)
        expect(code).not.toContain('.set([)');
    });

    it('handles compound assignment with multi-line expression', () => {
        const { code } = compile(`
<template><div>{{ total }}</div></template>
<script setup>
let total = $signal(0);
total += 5;
</script>`, 'test.pdx');

        expect(code).toContain('__total.set(__v => __v + 5)');
    });
});

// ─── extractBlock — string safety ───────────────────────────────────

describe('extractBlock — string safety', () => {
    it('handles braces inside string literals', () => {
        const lines = [
            'function foo() {',
            '  const x = "has { and } braces";',
            '  return x;',
            '}',
        ];
        const result = extractBlock(lines, 0);
        expect(result.endLine).toBe(3);
        expect(result.content).toContain('return x;');
    });

    it('handles braces inside template literals', () => {
        const lines = [
            'onMount(() => {',
            '  const msg = `Value: ${count}`;',
            '  console.log(msg);',
            '});',
        ];
        const result = extractCallBody(lines, 0, 'onMount');
        expect(result.endLine).toBe(3);
        expect(result.content).toContain('console.log(msg)');
    });
});

// ─── splitWatchArgs — string safety ─────────────────────────────────

describe('splitWatchArgs — string safety', () => {
    it('does NOT split on comma inside string', () => {
        const result = splitWatchArgs(`'hello, world', (val) => console.log(val)`);
        expect(result.source).toBe("'hello, world'");
        expect(result.callback).toContain('console.log');
    });
});

// ─── normalizeStatements — string safety ────────────────────────────

describe('normalizeStatements — string safety', () => {
    it('does NOT split on semicolon inside string', () => {
        const result = normalizeStatements(`const url = "http://example.com;extra"; nextLine()`);
        // The semicolon inside the string should NOT cause a line break
        expect(result).toContain('"http://example.com;extra"');
    });

    it('splits correctly on real semicolons', () => {
        const result = normalizeStatements(`let a = 1; let b = 2;`);
        const lines = result.split('\n').filter(l => l.trim());
        expect(lines.length).toBe(2);
    });
});

// ─── Compiler integration edge cases ────────────────────────────────

describe('Compiler — edge cases', () => {
    it('object literal with signal values in script body', () => {
        const { code } = compile(`
<template><div>{{ data }}</div></template>
<script setup>
let count = $signal(0);
const data = { total: count, label: 'test' };
</script>`, 'test.pdx');

        // 'total' should NOT become ctx.total in script (it's an object key)
        expect(code).toContain('total:');
    });

    it('@i18n + $t in same component compiles', () => {
        const analysis = analyzeScript(`
@i18n {
  locales: ['en'],
  default: 'en',
}
let x = $signal($t('hello'));
`, 'test.pdx');

        expect(analysis.i18n).toBeDefined();
        expect(analysis.usedFeatures.has('$t')).toBe(true);
    });

    it('@transition and @layout appear in route manifest', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/test' { preload };
@transition 'fade';
@layout 'admin';
</script>`, 'test.pdx');

        expect(code).toContain('transition:"fade"');
        // The chain the outlet reads, not the name: the compiler resolves it at build time.
        expect(code).toContain('layouts:["pdx-admin-layout"]');
    });
});

// ─── Tokenizer-based parsing hardening ────────────────────────────

describe('Tokenizer-based type extraction', () => {
    it('@prop with generic type: Map<string, Item[]>', () => {
        const a = analyzeScript(`@prop items: Map<string, Item[]>;`, 'test.pdx');
        expect(a.props).toHaveLength(1);
        expect(a.props[0].name).toBe('items');
        expect(a.props[0].tsType).toBe('Map<string, Item[]>');
        expect(a.props[0].runtimeType).toBe('Object');
    });

    it('@prop with nested generics: Record<string, Array<Set<number>>>', () => {
        const a = analyzeScript(`@prop data: Record<string, Array<Set<number>>>;`, 'test.pdx');
        expect(a.props).toHaveLength(1);
        expect(a.props[0].tsType).toBe('Record<string, Array<Set<number>>>');
    });

    it('@prop with union type containing generics', () => {
        const a = analyzeScript(`@prop value: Map<string, number> | null = null;`, 'test.pdx');
        expect(a.props).toHaveLength(1);
        expect(a.props[0].tsType).toBe('Map<string, number> | null');
        expect(a.props[0].default).toBe('null');
    });

    it('@prop with function type: (item: T) => boolean', () => {
        const a = analyzeScript(`@prop filter: (item: T) => boolean;`, 'test.pdx');
        expect(a.props).toHaveLength(1);
        expect(a.props[0].tsType).toBe('(item: T) => boolean');
    });

    it('@event with complex payload type: { old: T, new: T }', () => {
        const a = analyzeScript(`@event change: { old: string, new: string };`, 'test.pdx');
        expect(a.events).toHaveLength(1);
        expect(a.events[0].name).toBe('change');
        expect(a.events[0].payloadType).toBe('{ old: string, new: string }');
    });

    it('@slot with generic scope type: { item: Item<T> }', () => {
        const a = analyzeScript(`@slot content: { item: Item<T> };`, 'test.pdx');
        expect(a.slots).toHaveLength(1);
        expect(a.slots[0].name).toBe('content');
        expect(a.slots[0].scopeType).toBe('{ item: Item<T> }');
    });

    it('@fetch with complex type: as Result<User, Error>[]', () => {
        const a = analyzeScript(`@fetch users: 'GET /api/users' as Result<User, Error>[];`, 'test.pdx');
        expect(a.fetches).toHaveLength(1);
        expect(a.fetches[0].type).toBe('Result<User, Error>[]');
    });

    it('@fetch with nested options: { cache: { ttl: 5000 } }', () => {
        const a = analyzeScript(`@fetch data: 'GET /api/data' as Item[] { cache: { ttl: 5000 } };`, 'test.pdx');
        expect(a.fetches).toHaveLength(1);
        expect(a.fetches[0].type).toBe('Item[]');
        expect(a.fetches[0].options).toBe('{ cache: { ttl: 5000 } }');
    });

    it('@search with nested braces: { filter: { status: string } }', () => {
        const a = analyzeScript(`
@page '/list';
@search { filter: { status: string }, page: number = 1 };
`, 'test.pdx');
        expect(a.route.search).toContain('filter');
        expect(a.route.search).toContain('status: string');
    });
});
