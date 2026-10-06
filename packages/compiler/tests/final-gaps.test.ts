// Final gap tests: @for destructuring, plugin directives, @raw in functions, @defer combo.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('gap 4: @for with destructuring', () => {
    it('parses @for with object destructuring', () => {
        const source = `<template>
@for (entries as { key, value }; track key) {
  <div>{{ key }}: {{ value }}</div>
}
</template><script setup>
@prop entries: { key: string; value: string }[] = [];
</script>`;
        const { code } = compile(source, 'destr-for.pdx');
        expect(code).toContain('each(');
        expect(code).toContain('{ key, value }');
    });

    it('parses @for with array destructuring', () => {
        const source = `<template>
@for (pairs as [k, v]; track k) {
  <div>{{ k }}={{ v }}</div>
}
</template><script setup>
@prop pairs: [string, number][] = [];
</script>`;
        const { code } = compile(source, 'arr-destr.pdx');
        expect(code).toContain('each(');
        expect(code).toContain('[k, v]');
    });
});

describe('gap 7: @raw inside function body', () => {
    it('@raw inside function body skips signal rewriting', () => {
        const source = `
<template><div>{{ count }}</div></template>
<script setup>
  let count = $signal(0);
  function debug() {
    @raw {
      const snapshot = count;
      console.log(snapshot);
    }
  }
  count++;
</script>`;
        const { code } = compile(source, 'raw-in-fn.pdx');
        // count++ outside @raw → rewritten
        expect(code).toContain('__count.set');
        // Inside @raw inside function → NOT rewritten
        expect(code).toContain('snapshot = count');
        expect(code).not.toContain('snapshot = __count()');
    });
});

describe('gap 8: custom plugin directives in parser + codegen', () => {
    it('parses and generates custom directive via plugin', () => {
        const source = `
<template>
  @animate (fadeIn) {
    <div>Animated!</div>
  }
</template>
<script setup>
  @prop label: string = 'test';
</script>`;

        const { code } = compile(source, 'custom-dir.pdx', [{
            name: 'animate-plugin',
            templateDirectives: {
                animate: {
                    generate(expr, bodyCode, imports) {
                        imports.add('animate');
                        return `animate('${expr}', () => ${bodyCode})`;
                    }
                }
            }
        }]);

        expect(code).toContain('animate(');
        expect(code).toContain("'fadeIn'");
        expect(code).toContain('Animated!');
        // animate should be in the import
        expect(code).toMatch(/import.*animate.*from.*@pdxui\/core/);
    });

    it('cleans up custom directives between compilations', () => {
        // First compile with plugin
        const { code: first } = compile(
            `<template>@animate (x) { <p>hi</p> }</template><script setup>@prop a: string = '';</script>`,
            'a.pdx',
            [{ name: 'test', templateDirectives: { animate: { generate: () => `test()` } } }]
        );
        expect(first).toContain('test()');

        // Second compile WITHOUT plugin — @animate treated as plain text (not recognized)
        const { code: second } = compile(
            `<template><div>@animate ignored</div></template><script setup>@prop b: string = '';</script>`,
            'b.pdx'
        );
        expect(second).not.toContain('test()');
        expect(second).toContain('@animate ignored'); // just text
    });
});
