// Phase 0.3 tests: @snippet directive.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('@snippet — reusable template blocks', () => {
    it('compiles @snippet into a function', () => {
        const source = `
<template>
  <div>{{ userCell({ name: 'Alice' }) }}</div>
</template>
<script setup>
  @snippet userCell(user) {
    <span class="cell">{{ user.name }}</span>
  }
</script>`;
        const { code } = compile(source, 'snippet.pdx');
        expect(code).toContain('function userCell(user)');
        expect(code).toContain('return html`');
        expect(code).toContain('user.name');
    });

    it('snippet is exported and available in template', () => {
        const source = `
<template>
  <div>{{ renderItem({ id: 1, label: 'Test' }) }}</div>
</template>
<script setup>
  @snippet renderItem(item) {
    <li data-id="{{ item.id }}">{{ item.label }}</li>
  }
</script>`;
        const { code } = compile(source, 'snippet-export.pdx');
        expect(code).toContain('function renderItem(item)');
        // Should be in the return (auto-exported)
        expect(code).toContain('renderItem');
    });

    it('multiple snippets in same component', () => {
        const source = `
<template><div>test</div></template>
<script setup>
  @snippet headerCell(col) {
    <th>{{ col.label }}</th>
  }
  @snippet dataCell(value) {
    <td>{{ value }}</td>
  }
</script>`;
        const { code } = compile(source, 'multi-snippet.pdx');
        expect(code).toContain('function headerCell(col)');
        expect(code).toContain('function dataCell(value)');
    });
});
