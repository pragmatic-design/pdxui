// The binding forms of the beta (#126), the compiler half: a closed list of modifiers
// (PDX_BINDING_MODIFIER), the general `{ get, set }` form compiled with its assignment rewritten,
// and `:x.once` written once. The runtime half — the compiled forms mounted — is
// packages/ui/tests/unit/two-way-modifiers-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function sfc(template: string, script = "let name = $signal('');\nlet cents = $signal(1250);"): string {
    return `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
}
const codes = (template: string) => compile(sfc(template), 'm.pdx', [], undefined, {}).warnings
    .filter(w => w.code === 'PDX_BINDING_MODIFIER').map(w => `${w.severity}: ${w.message}`);

describe('PDX_BINDING_MODIFIER', () => {
    it('a modifier outside the list is an error naming the list', () => {
        const found = codes('<input ::value.lazzy="name" />');
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/^error: /);
        expect(found[0]).toContain("'.lazzy'");
        expect(found[0]).toContain('.lazy, .trim, .number, .debounce(ms)');
    });

    it('on a plain binding only .once is a modifier', () => {
        const found = codes('<p :title.nope="name">x</p>');
        expect(found).toHaveLength(1);
        expect(found[0]).toContain('.once');
    });

    it('control: every listed modifier, .once, :class.x and :style.x are fine', () => {
        expect(codes('<input ::value.lazy.trim="name" /><input ::value.number.debounce(300)="cents" /><p :title.once="name" :class.on="name" :style.color="name">x</p>')).toEqual([]);
    });
});

for (const [path, opts] of Object.entries({ dev: {}, build: { production: true } })) {
    describe(`the forms compiled — ${path}`, () => {
        it('{ get, set }: reads are calls, the assignment in set writes the signal', () => {
            const { code } = compile(sfc('<input ::value="{ get: () => (cents / 100).toFixed(2), set: (s) => cents = Math.round(Number(s) * 100) }" />'), 'm.pdx', [], undefined, opts);
            const line = code.split('\n').find(l => l.includes('bindTwoWay(')) ?? '';
            expect(line).toMatch(/get: \(\) => \(ctx\.cents\(\) \/ 100\)\.toFixed\(2\)/);
            expect(line).toMatch(/set: \(s\) => ctx\.cents\.setRaw\(Math\.round\(Number\(s\) \* 100\)\)/);
        });

        it('.debounce(300) reaches core whole, with its value, and leaves no attribute in the markup', () => {
            const { code } = compile(sfc('<input class="q" ::value.debounce(300)="name" />'), 'm.pdx', [], undefined, opts);
            expect(code).toContain("bindTwoWay(__el0, 'value.debounce(300)', ctx.name)");
            expect(code).not.toContain('(300)=');
        });

        it(':title.once is assigned once, untracked, with no effect of its own', () => {
            const { code } = compile(sfc('<p :title.once="name">x</p>'), 'm.pdx', [], undefined, opts);
            expect(code).toContain('untracked(');
            expect(code).not.toContain('title.once');
            expect(code).not.toMatch(/effect\(\(\) => \{ const __b = [^;]*name/);
        });
    });
}
