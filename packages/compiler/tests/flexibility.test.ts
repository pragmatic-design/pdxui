// Tests for flexibility features: @raw, complex props, shadow DOM, @use, @mixin, $inline.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('@raw block — escape hatch', () => {
    it('skips signal rewriting inside @raw block', () => {
        const source = `
<template><div>{{ count }}</div></template>
<script setup>
  let count = $signal(0);
  count++;
  @raw {
    const snapshot = count;
    localStorage.setItem('debug', JSON.stringify(snapshot));
  }
</script>`;
        const { code } = compile(source, 'raw-test.pdx');
        // count++ should be rewritten
        expect(code).toContain('__count.set');
        // Inside @raw: count should NOT be rewritten to __count()
        expect(code).toContain('snapshot = count');
        expect(code).not.toContain('snapshot = __count()');
    });

    it('handles single-line @raw', () => {
        const source = `
<template><div>{{ x }}</div></template>
<script setup>
  let x = $signal(0);
  @raw { console.log(x); }
</script>`;
        const { code } = compile(source, 'raw-single.pdx');
        expect(code).toContain('console.log(x)');
    });
});

describe('complex prop types', () => {
    it('compiles @prop with Object type', () => {
        const source = `
<template><div>{{ config }}</div></template>
<script setup>
  @prop config: { theme: string } = {};
</script>`;
        const { code } = compile(source, 'obj-prop.pdx');
        expect(code).toContain('type: Object');
    });

    it('compiles @prop with Array type', () => {
        const source = `
<template><div>{{ items }}</div></template>
<script setup>
  @prop items: Item[] = [];
</script>`;
        const { code } = compile(source, 'arr-prop.pdx');
        expect(code).toContain('type: Array');
    });

    it('compiles @prop with Function type', () => {
        const source = `
<template><div>click</div></template>
<script setup>
  @prop onSelect: (item: Item) => void;
</script>`;
        const { code } = compile(source, 'fn-prop.pdx');
        expect(code).toContain('type: Object');
    });
});

describe('Shadow DOM opt-in', () => {
    it('detects shadow attribute on template', () => {
        const source = `
<template shadow>
  <div>Shadow content</div>
</template>
<script setup>
  @prop label: string = 'test';
</script>`;
        const { code } = compile(source, 'shadow.pdx');
        expect(code).toContain('shadow: true');
    });

    it('no shadow flag without attribute', () => {
        const source = `
<template>
  <div>Light DOM</div>
</template>
<script setup>
  @prop label: string = 'test';
</script>`;
        const { code } = compile(source, 'light.pdx');
        expect(code).not.toContain('shadow: true');
    });
});

describe('@use external WC', () => {
    it('generates import for external package', () => {
        const source = `
<template><div><sl-button>Click</sl-button></div></template>
<script setup>
  @use 'sl-button' from '@shoelace-style/shoelace';
  @prop label: string = 'test';
</script>`;
        const { code } = compile(source, 'use-external.pdx');
        expect(code).toContain("import '@shoelace-style/shoelace'");
    });
});

describe('@mixin component composition', () => {
    it('generates import and setup call', () => {
        const source = `
<template><div>{{ pagination }}</div></template>
<script setup>
  @mixin './with-pagination.pdx' as pagination;
  @prop items: string[] = [];
</script>`;
        const { code } = compile(source, 'mixin.pdx');
        expect(code).toContain("import { setup as __mixin_pagination }");
        expect(code).toContain('const pagination = __mixin_pagination(ctx)');
    });
});

describe('$inline render-time blocks', () => {
    it('puts inline code in render function', () => {
        const source = `
<template>
  @for (sorted as item; track item.id) {
    <div>{{ item.name }}</div>
  }
</template>
<script setup>
  let items = $signal([]);
  $inline {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  }
</script>`;
        const { code } = compile(source, 'inline.pdx');
        // render should be a block function, not arrow expression
        expect(code).toMatch(/render:\s*\(ctx\)\s*=>\s*\{/);
        expect(code).toContain('sorted = [');
        expect(code).toContain('return html`');
    });
});

describe('plugin templateDirectives API', () => {
    it('TemplateDirectiveHandler interface is exported', async () => {
        // Just verify the types are importable
        const { PluginRunner } = await import('../src/plugin-system');
        const runner = new PluginRunner([{
            name: 'test-directive',
            templateDirectives: {
                animate: {
                    generate(expr, bodyCode, imports) {
                        imports.add('animate');
                        return `\${animate(() => ${expr}, () => ${bodyCode})}`;
                    }
                }
            }
        }], 'test.pdx', 'pdx-test');

        const directives = runner.getTemplateDirectives();
        expect(directives.has('animate')).toBe(true);
        expect(directives.get('animate')!.generate('x', 'html``', new Set())).toContain('animate');
    });
});
