// Tests for scoped slot compilation.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('scoped slot compilation', () => {
    it('compiles <slot> with :bindings to renderSlot()', () => {
        const source = `
<template>
  <div>
    <slot name="cell" :row="currentRow" :col="currentCol" />
  </div>
</template>
<script setup>
@slot cell: { row: object, col: string };
let currentRow = $signal({});
let currentCol = $signal('name');
</script>`;

        const result = compile(source, 'grid.pdx');
        expect(result.code).toContain('renderSlot(');
        expect(result.code).toContain("'cell'");
        expect(result.code).toContain('ctx.currentRow()');
        expect(result.code).toContain('ctx.currentCol()');
    });

    it('compiles <slot> without :bindings as regular slot', () => {
        const source = `
<template>
  <div>
    <slot name="header">Default Header</slot>
  </div>
</template>
<script setup>
@slot header;
let x = $signal(0);
</script>`;

        const result = compile(source, 'panel.pdx');
        // Without :bindings, slot stays as HTML (basic slot projection)
        expect(result.code).toContain('<slot');
    });

    it('imports renderSlot when scoped slot is used', () => {
        const source = `
<template>
  <slot name="item" :data="itemData" />
</template>
<script setup>
@slot item: { data: object };
let itemData = $signal({});
</script>`;

        const result = compile(source, 'list.pdx');
        expect(result.code).toContain('renderSlot');
        // Should be in the import statement
        expect(result.code).toMatch(/import\s*\{[^}]*renderSlot[^}]*\}/);
    });

    it('compiles self-closing scoped slot', () => {
        const source = `
<template>
  <slot name="action" :item="current" />
</template>
<script setup>
@slot action: { item: object };
let current = $signal({});
</script>`;

        const result = compile(source, 'toolbar.pdx');
        expect(result.code).toContain('renderSlot(');
        expect(result.code).toContain("'action'");
    });
});

describe('parent-side @slot directive', () => {
    it('compiles @slot(name, { vars }) to slotCarrier()', () => {
        const { code } = compile(`
<template>
  <pdx-select :options="items">
    @slot(item, { value, index }) {
      <span class="custom">{{ value }} (#{{ index }})</span>
    }
  </pdx-select>
</template>
<script setup>
let items = $signal(['a', 'b']);
</script>`, 'parent.pdx');

        expect(code).toContain("slotCarrier('item'");
        expect(code).toContain('__scope');
        expect(code).toContain('{ value, index } = __scope');
        // scope vars should NOT be prefixed with ctx.
        expect(code).not.toContain('ctx.value');
        expect(code).not.toContain('ctx.index');
    });

    it('compiles scopeless @slot(name) to slotCarrier()', () => {
        const { code } = compile(`
<template>
  <pdx-select :options="items">
    @slot(empty) {
      <em>No results</em>
    }
  </pdx-select>
</template>
<script setup>
let items = $signal([]);
</script>`, 'parent.pdx');

        expect(code).toContain("slotCarrier('empty'");
        expect(code).toContain('() =>');
    });

    it('imports slotCarrier from @pdxui/core', () => {
        const { code } = compile(`
<template>
  <pdx-list>
    @slot(item, { data }) {
      <div>{{ data }}</div>
    }
  </pdx-list>
</template>
<script setup>
let x = $signal(0);
</script>`, 'parent.pdx');

        expect(code).toMatch(/import\s*\{[^}]*slotCarrier[^}]*\}/);
    });

    it('allows parent scope access inside slot body', () => {
        const { code } = compile(`
<template>
  <pdx-list>
    @slot(item, { data }) {
      <span @click="handleClick(data)">{{ title }}: {{ data }}</span>
    }
  </pdx-list>
</template>
<script setup>
let title = $signal('Items');
function handleClick(d) { console.log(d); }
</script>`, 'parent.pdx');

        // Parent signal `title` is on ctx (auto-return maps title → __title)
        expect(code).toContain('ctx.title');
        // Scope var `data` should NOT be prefixed with ctx.
        expect(code).not.toContain('ctx.data');
        // handleClick is a parent function — prefixed
        expect(code).toContain('ctx.handleClick');
    });

    it('supports multiple @slot directives on same component', () => {
        const { code } = compile(`
<template>
  <pdx-select>
    @slot(item, { value }) {
      <span>{{ value }}</span>
    }
    @slot(selected, { item }) {
      <strong>{{ item }}</strong>
    }
  </pdx-select>
</template>
<script setup>
let x = $signal(0);
</script>`, 'parent.pdx');

        expect(code).toContain("slotCarrier('item'");
        expect(code).toContain("slotCarrier('selected'");
    });
});

describe('<slot let:> parent-side syntax', () => {
    it('compiles <slot let:var> to slotCarrier()', () => {
        const { code } = compile(`
<template>
  <pdx-list>
    <slot name="item" let:value let:index>
      <span class="custom">{{ value }} (#{{ index }})</span>
    </slot>
  </pdx-list>
</template>
<script setup>
let x = $signal(0);
</script>`, 'parent.pdx');

        expect(code).toContain("slotCarrier('item'");
        expect(code).toContain('__scope');
        expect(code).toContain('{ value, index } = __scope');
        expect(code).not.toContain('ctx.value');
        expect(code).not.toContain('ctx.index');
    });

    it('compiles default slot (no name) with let:', () => {
        const { code } = compile(`
<template>
  <pdx-widget>
    <slot let:data>
      <div>{{ data }}</div>
    </slot>
  </pdx-widget>
</template>
<script setup>
let x = $signal(0);
</script>`, 'parent.pdx');

        expect(code).toContain("slotCarrier('default'");
    });

    it('compiles self-closing <slot let: />', () => {
        const { code } = compile(`
<template>
  <pdx-widget>
    <slot name="empty" let:message />
  </pdx-widget>
</template>
<script setup>
let x = $signal(0);
</script>`, 'parent.pdx');

        expect(code).toContain("slotCarrier('empty'");
    });

    it('does NOT interfere with child-side <slot :binding>', () => {
        const { code } = compile(`
<template>
  <slot name="cell" :row="currentRow">default</slot>
</template>
<script setup>
@slot cell: { row: object };
let currentRow = $signal({});
</script>`, 'child.pdx');

        expect(code).toContain('renderSlot(');
        expect(code).not.toContain('slotCarrier');
    });
});

describe('@@ escape', () => {
    it('emits literal @ for @@ in template', () => {
        const { code } = compile(`
<template>
  <pre>Use @@slot(name) to escape</pre>
</template>
<script setup>
let x = $signal(0);
</script>`, 'test.pdx');

        expect(code).toContain('@slot(name)');
        expect(code).not.toContain('slotCarrier');
    });

    it('does not treat @@ as directive', () => {
        const { code } = compile(`
<template>
  <code>@@if (cond) { ... }</code>
</template>
<script setup>
let x = $signal(0);
</script>`, 'test.pdx');

        expect(code).toContain('@if');
        expect(code).not.toContain('when(');
    });
});

describe('@raw block', () => {
    it('emits content without processing {{ }}', () => {
        const { code } = compile(`
<template>
  @raw {<pre>{{ not.interpolated }}</pre>}
</template>
<script setup>
let x = $signal(0);
</script>`, 'test.pdx');

        expect(code).toContain('{{ not.interpolated }}');
        expect(code).not.toContain('ctx.not');
    });

    it('emits content without processing @directives', () => {
        const { code } = compile(`
<template>
  @raw {<code>@if (cond) { @for (items as item) { } }</code>}
</template>
<script setup>
let x = $signal(0);
</script>`, 'test.pdx');

        expect(code).toContain('@if (cond)');
        expect(code).toContain('@for (items');
        expect(code).not.toContain('when(');
        expect(code).not.toContain('each(');
    });

    it('preserves backticks and ${} inside @raw', () => {
        const { code } = compile(`
<template>
  @raw {<pre>return html\`<span>\${data}</span>\`;</pre>}
</template>
<script setup>
let x = $signal(0);
</script>`, 'test.pdx');

        expect(code).toContain('${data}');
        expect(code).not.toContain('ctx.data');
    });

    it('handles nested braces inside @raw', () => {
        const { code } = compile(`
<template>
  @raw {<code>function foo() { if (x) { bar(); } }</code>}
</template>
<script setup>
let x = $signal(0);
</script>`, 'test.pdx');

        expect(code).toContain('function foo()');
        expect(code).toContain('bar()');
    });
});
