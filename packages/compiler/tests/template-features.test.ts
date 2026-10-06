// Tests for @empty, @let, pipe arguments, :class/:style object binding.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';

function c(source: string) {
    return compile(source, 'test.pdx');
}

describe('@empty — fallback for empty lists', () => {
    it('parses @for with @empty block', () => {
        const ast = parseTemplate(`@for (items as item; track item.id) {
            <div>{{ item.name }}</div>
        } @empty {
            <p>No items found.</p>
        }`);
        const forNode = ast[0] as any;
        expect(forNode.type).toBe('for');
        expect(forNode.emptyBody).toBeDefined();
        expect(forNode.emptyBody.length).toBeGreaterThan(0);
    });

    it('compiles @for with @empty to when() wrapper', () => {
        const { code } = c(`
<template>
  @for (items as item; track item.id) {
    <div>{{ item.name }}</div>
  } @empty {
    <p>No items yet</p>
  }
</template>
<script setup>
  let items = $signal([]);
</script>`);
        expect(code).toContain('when(');
        expect(code).toContain('eachRow(');
        expect(code).toContain('No items yet');
    });

    it('compiles @for without @empty normally', () => {
        const { code } = c(`
<template>
  @for (items as item; track item.id) {
    <div>{{ item.name }}</div>
  }
</template>
<script setup>
  let items = $signal([]);
</script>`);
        expect(code).toContain('eachRow(');
        expect(code).not.toContain('when(');
    });
});

describe('@let — local template variables', () => {
    it('parses @let declaration', () => {
        const ast = parseTemplate(`@let total = items.length;
<p>{{ total }}</p>`);
        expect(ast[0]).toEqual(expect.objectContaining({
            type: 'let',
            name: 'total',
            expr: 'items.length',
        }));
    });

    it('compiles @let to ctx assignment', () => {
        const { code } = c(`
<template>
  @let total = count * price;
  <p>Total: {{ total }}</p>
</template>
<script setup>
  let count = $signal(5);
  let price = $signal(10);
</script>`);
        expect(code).toContain('ctx.total');
    });

    it('supports complex expressions', () => {
        const ast = parseTemplate(`@let label = firstName + ' ' + lastName;`);
        expect(ast[0]).toEqual(expect.objectContaining({
            type: 'let',
            name: 'label',
        }));
    });
});

describe('pipe arguments — {{ x | pipe(arg) }}', () => {
    it('compiles pipe with argument', () => {
        const { code } = c(`
<template><p>{{ price | currency('EUR') }}</p></template>
<script setup>
  let price = $signal(42);
  function currency(val, code) { return code + ' ' + val; }
</script>`);
        expect(code).toContain('pipe(');
        expect(code).toContain("(v) => ctx.currency(v, 'EUR')");
    });

    it('compiles pipe with multiple arguments', () => {
        const { code } = c(`
<template><p>{{ text | slice(0, 5) }}</p></template>
<script setup>
  let text = $signal('hello world');
  function slice(val, start, end) { return val.slice(start, end); }
</script>`);
        expect(code).toContain('(v) => ctx.slice(v, 0, 5)');
    });

    it('compiles simple pipe without arguments', () => {
        const { code } = c(`
<template><p>{{ name | uppercase }}</p></template>
<script setup>
  let name = $signal('hello');
  function uppercase(v) { return v.toUpperCase(); }
</script>`);
        expect(code).toContain('ctx.uppercase');
        expect(code).not.toContain('(v) =>');
    });

    it('compiles chained pipes with and without args', () => {
        const { code } = c(`
<template><p>{{ text | trim | slice(0, 10) | uppercase }}</p></template>
<script setup>
  let text = $signal('  hello world  ');
  function trim(v) { return v.trim(); }
  function slice(v, s, e) { return v.slice(s, e); }
  function uppercase(v) { return v.toUpperCase(); }
</script>`);
        expect(code).toContain('ctx.trim');
        expect(code).toContain('(v) => ctx.slice(v, 0, 10)');
        expect(code).toContain('ctx.uppercase');
    });
});

describe(':class object binding', () => {
    it('compiles :class object to multiple class toggles', () => {
        const { code } = c(`
<template>
  <div :class="{ active: isActive, disabled: isDisabled }">Content</div>
</template>
<script setup>
  let isActive = $signal(true);
  let isDisabled = $signal(false);
</script>`);
        expect(code).toContain(':class.active=');
        expect(code).toContain(':class.disabled=');
    });
});

describe(':style object binding', () => {
    it('compiles :style object to multiple style props', () => {
        const { code } = c(`
<template>
  <div :style="{ color: textColor, fontSize: size }">Styled</div>
</template>
<script setup>
  let textColor = $signal('red');
  let size = $signal('14px');
</script>`);
        expect(code).toContain(':style.color=');
        expect(code).toContain(':style.font-size=');
    });
});
