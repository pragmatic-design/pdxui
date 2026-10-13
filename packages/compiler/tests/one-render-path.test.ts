// One render path for .pdx (#107): the inline path compiles a template in dev as in a production
// build, so a feature cannot exist in one and not the other. The tagged template stays in core for
// hand-written components; a .pdx module does not use it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SFC = `<template>
  <p :title="label" :class.active="on">{{ count }}</p>
  @if (on) { <span>on</span> }
  @for (items as item; track item) { <i>{{ item }}</i> }
</template>
<script setup>
let count = $signal(0);
let on = $signal(true);
const label = $derived('n' + count);
const items = $signal(['a', 'b']);
</script>
`;

describe('one render path', () => {
    it('a dev compile renders with DOM calls, not a tagged template', () => {
        const { code } = compile(SFC, 'one.pdx');
        expect(code, 'the dev render is still the tagged template').not.toMatch(/\bhtml`/);
        expect(code).toMatch(/document\.createElement\('p'\)/);
        expect(code).not.toMatch(/import \{[^}]*\bhtml\b[^}]*\} from '@pdxui\/core'/);
    });

    it('a dev compile and a production compile render the same way', () => {
        const render = (code: string) => code.slice(code.indexOf('render:'));
        const dev = compile(SFC, 'one.pdx').code;
        const prod = compile(SFC, 'one.pdx', [], undefined, { production: true }).code;
        expect(render(dev)).toBe(render(prod));
    });
});
