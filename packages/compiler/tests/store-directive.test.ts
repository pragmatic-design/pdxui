// Tests for @store rune — global store module compilation.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function compileStore(source: string) {
    return compile(source, 'cart-store.pdx');
}

describe('@store — script analyzer', () => {
    it('parses @store name;', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store cart;
let items = $signal([]);
</script>
        `);
        expect(code).toContain("createGlobalStore('cart'");
        expect(code).toContain('useCart');
    });

    it('parses @store name with persist option', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store cart { persist: 'local' };
let items = $signal([]);
</script>
        `);
        expect(code).toContain("createGlobalStore('cart'");
        expect(code).toContain("persist: 'local'");
        expect(code).toContain('useCart');
    });

    it('parses @store with session persist', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store auth { persist: 'session' };
let token = $signal('');
</script>
        `);
        expect(code).toContain("persist: 'session'");
        expect(code).toContain('useAuth');
    });
});

describe('@store — codegen', () => {
    it('generates createGlobalStore wrapping setup body', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store cart;
let items = $signal([]);
const total = $derived(items.length);
function addItem(item) { items = [...items, item]; }
</script>
        `);
        // Should wrap in createGlobalStore factory
        expect(code).toContain("createGlobalStore('cart', () => {");
        // Signal declarations inside factory
        expect(code).toContain('signal([]');
        // Derived inside factory
        expect(code).toContain('computed(');
        // Auto-return with exports
        expect(code).toMatch(/return \{[^}]*items/);
        expect(code).toMatch(/return \{[^}]*total/);
        expect(code).toMatch(/return \{[^}]*addItem/);
    });

    it('generates export function useXxx()', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store notifications;
let list = $signal([]);
</script>
        `);
        expect(code).toContain('export function useNotifications()');
        expect(code).toContain('return __store_notifications');
    });

    it('does NOT generate component() call', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store cart;
let items = $signal([]);
</script>
        `);
        expect(code).not.toContain("component('pdx-");
    });

    it('imports createGlobalStore from @pdxui/core', () => {
        const { code } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store cart;
let items = $signal([]);
</script>
        `);
        expect(code).toContain('createGlobalStore');
        expect(code).toContain("from '@pdxui/core'");
    });

    it('produces no warnings', () => {
        const { warnings } = compileStore(`
<template><div>Store</div></template>
<script setup>
@store cart;
let items = $signal([]);
</script>
        `);
        expect(warnings).toEqual([]);
    });
});
