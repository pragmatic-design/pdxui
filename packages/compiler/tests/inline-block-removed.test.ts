// `$inline { … }` is not part of the language (#361).
//
// It copied its body into the render function, where nothing it declared was reachable from the
// template (which reads `ctx.<name>`, and setup never returned it) and its signals were not
// rewritten (`items` instead of `__items()`): a ReferenceError at render, on both render paths. It
// was in no documentation page, no RUNES entry and no example. `$derived` says the same thing,
// reactively, in the one way the language teaches. The compile now stops at it and names that.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SOURCE = `<template>
  @for (sorted as item; track item.id) { <div>{{ item.name }}</div> }
</template>
<script setup>
  let items = $signal([]);
  $inline {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  }
</script>`;

describe('$inline blocks', () => {
    it('are reported, with $derived as the replacement', () => {
        const { warnings } = compile(SOURCE, 'inline.pdx');
        const found = warnings.find((w) => w.code === 'PDX_UNKNOWN_DECLARATION' && /\$inline/.test(w.message));
        expect(found, `no diagnostic for $inline: ${warnings.map((w) => w.code).join(', ')}`).toBeTruthy();
        expect(found!.severity).toBe('error');
        expect(found!.hint).toContain('$derived');
    });

    it('are not copied into the render', () => {
        const { code } = compile(SOURCE, 'inline.pdx');
        expect(code, 'the block\'s body reached the module').not.toContain('[...items].sort');
    });

    it('a block of several lines is dropped whole, and what follows it still compiles', () => {
        const { code, warnings } = compile(`<template><div>{{ count }}</div></template>
<script setup>
  let count = $signal(0);
  $inline {
    const a = count * 2;
    if (a > 1) {
      console.log(a);
    }
  }
  function bump() { count++; }
</script>`, 'inline-multi.pdx');
        expect(warnings.filter((w) => w.code === 'PDX_UNKNOWN_DECLARATION')).toHaveLength(1);
        expect(code).not.toContain('console.log(a)');
        expect(code, 'the code after the block was swallowed with it').toContain('function bump()');
    });
});
