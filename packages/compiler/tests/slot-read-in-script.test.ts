// A script that reads its own typed snippet (#1291). Core keeps the parent's snippet in a signal on the
// context, `ctx.row`, which `@render row(…)` reads in the template. A component that draws from its
// script (pdx-field-list builds a row per item and calls its `row` snippet for each) reads it there too,
// as a prop is read: `const row = ctx.row;`, and `row()` is the function or undefined.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (script: string) => `<template></template>\n<script>\n${script}\n</script>`;
const SLOT = '@slot row?: (item: { [field: string]: unknown }, index: number);';

describe('a typed @slot read by the script (#1291)', () => {
    it('is the snippet on the context, read as a call', () => {
        const { code } = compile(pdx(`${SLOT}\n@host el;\nfunction draw() { const fn = row; if (fn) el.appendChild(fn({}, 0)); }\nrequestAnimationFrame(draw);`), 'test.pdx');
        expect(code).toContain('const row = ctx.row;');
        expect(code).toContain('const fn = row();');
    });

    it('the control: a script that does not read it gets no accessor', () => {
        const { code } = compile(pdx(`${SLOT}\nlet a = $signal(0);`), 'test.pdx');
        expect(code).not.toContain('const row = ctx.row;');
    });

    it('a projection slot, which is not a value, gets none', () => {
        const { code } = compile(pdx('@slot brand;\nfunction f() { return 1; }\nf();'), 'test.pdx');
        expect(code).not.toContain('ctx.brand');
    });
});
