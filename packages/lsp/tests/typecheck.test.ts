// `typecheckPdx` — the editor's type-check without an editor, which `pdx check --types` runs.
// What it promises: each .pdx's TypeScript errors, by TypeScript code, at the position on the .pdx;
// nothing for a file that type-checks; no entry at all for a file with no script.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { typecheckPdx } from '../src/typecheck';

const ROOT = join(__dirname, '..', '..', '..');
const at = (name: string) => join(ROOT, name);

const broken = [
    '<template>',
    '  <p>{{ count }}</p>',
    '</template>',
    '<script setup>',
    'let count = $signal(0);',
    "const label: number = 'not a number';",
    '</script>',
].join('\n');

const clean = [
    '<template>',
    '  <p>{{ count }}</p>',
    '</template>',
    '<script setup>',
    'let count = $signal(0);',
    '</script>',
].join('\n');

const templateOnly = '<template>\n  <p>static</p>\n</template>\n';

describe('typecheckPdx', () => {
    const result = typecheckPdx(ROOT, [
        { path: at('broken.pdx'), content: broken },
        { path: at('clean.pdx'), content: clean },
        { path: at('template-only.pdx'), content: templateOnly },
    ]);

    it('reports a type error by its TypeScript code, on the line and column of the .pdx', () => {
        const errors = result.get(at('broken.pdx'))!;
        expect(errors).toHaveLength(1);
        expect(errors[0].tsCode).toBe(2322);
        expect(errors[0].line).toBe(6);
        expect(errors[0].column).toBe(7);
        expect(errors[0].message).toMatch(/not assignable to type 'number'/);
    });

    it('reports nothing for a file that type-checks', () => {
        expect(result.get(at('clean.pdx'))).toEqual([]);
    });

    it('does not check a file with no script', () => {
        expect(result.has(at('template-only.pdx'))).toBe(false);
    });
});
