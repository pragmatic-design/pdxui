// Tests for @for $index feature.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('@for with index variable', () => {
    it('parses and generates index in render callback', () => {
        const source = `
<template>
@for (items as item, i; track item.id) {
  <div>{{ i }}: {{ item.name }}</div>
}
</template>
<script setup>
@prop items: { id: number; name: string }[] = [];
</script>`;
        const { code } = compile(source, 'for-index.pdx');
        expect(code).toContain('eachRow(');
        // Callback should have both item and i
        expect(code).toMatch(/\(item, i\)\s*=>/);
    });

    it('index variable is not prefixed with ctx.', () => {
        const source = `
<template>
@for (items as item, idx; track item.id) {
  <span class="{{ idx % 2 === 0 ? 'even' : 'odd' }}">{{ item.name }}</span>
}
</template>
<script setup>
@prop items: any[] = [];
</script>`;
        const { code } = compile(source, 'for-idx.pdx');
        // idx should NOT be prefixed with ctx. It is a row getter: a moved row
        // reads its new index.
        expect(code).toContain('idx() %');
        expect(code).not.toContain('ctx.idx');
    });

    it('@for without index still works (backward compat)', () => {
        const source = `
<template>
@for (items as item; track item.id) {
  <div>{{ item.name }}</div>
}
</template>
<script setup>
@prop items: any[] = [];
</script>`;
        const { code } = compile(source, 'for-no-idx.pdx');
        expect(code).toContain('eachRow(');
        // Callback should have only item (no trailing comma)
        expect(code).toMatch(/\(item\)\s*=>/);
    });

    it('destructuring + index combined', () => {
        const source = `
<template>
@for (entries as { key, value }, i; track key) {
  <div>{{ i }}: {{ key }}={{ value }}</div>
}
</template>
<script setup>
@prop entries: { key: string; value: string }[] = [];
</script>`;
        const { code } = compile(source, 'for-destr-idx.pdx');
        // A destructured binding keeps each(): its names are bound once (the row getter covers a
        // plain item only).
        expect(code).toContain('each(');
        expect(code).not.toContain('eachRow(');
        expect(code).toMatch(/\(\{ key, value \}, i\)\s*=>/);
    });
});
