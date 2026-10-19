// Phase 0.3 tests: @snippet directive.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('@snippet — reusable template blocks', () => {
    // Its body is a template (#489, decision 9): `{{ user.name }}` is read, not copied into an
    // html`` literal as text.
    it('compiles @snippet into a function', () => {
        const source = `
<template>
  <div>{{ userCell({ name: 'Alice' }) }}</div>
</template>
<script>
  @snippet userCell(user) {
    <span class="cell">{{ user.name }}</span>
  }
</script>`;
        const { code } = compile(source, 'snippet.pdx');
        expect(code).toContain('function userCell(user)');
        expect(code).not.toContain('html`');
        expect(code).toContain('bindInterpolation(__t1,()=>user.name)');
        // The template calls it as a function of the render, not of the setup's context.
        expect(code).toContain("userCell({ name: 'Alice' })");
        expect(code).not.toContain('ctx.userCell');
    });

    it('snippet is exported and available in template', () => {
        const source = `
<template>
  <div>{{ renderItem({ id: 1, label: 'Test' }) }}</div>
</template>
<script>
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
<script>
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
