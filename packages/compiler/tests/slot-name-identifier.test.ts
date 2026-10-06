// A parent-side slot whose name is not an identifier compiles.
//
// `<slot name="col:name" let:row>` inside a pdx-data-grid — the slot the grid documents for a custom
// cell (`col:{field}`, `header:{field}`) — hoisted as `const __pdxSlot_col:name_0 = …` is not
// JavaScript: the build fails with "'const' declarations must be initialized", and no .pdx can
// use the grid's cell slots. A hyphen (`name="row-actions"`) breaks it the same way. The variable
// name is internal; the slot keeps its name where the grid reads it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function compileTemplate(template: string): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let rows = $signal([]);\n</script>`;
    return compile(source, 'slot-name.pdx').code;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

describe('a slot name that is not a JS identifier', () => {
    for (const name of ['col:name', 'header:status', 'row-actions', 'item']) {
        it(`name="${name}" compiles to a valid module and keeps its name`, () => {
            const code = compileTemplate(
                `<pdx-data-grid :data="rows"><slot name="${name}" let:row let:value><b>{{ value }}</b></slot></pdx-data-grid>`,
            );
            parses(code);
            // The carrier still registers the slot under the name the grid asks for.
            expect(code).toContain(`slotCarrier('${name}',`);
        });
    }

    it('two slots whose names differ only in a colon or a hyphen stay distinct', () => {
        const code = compileTemplate(
            `<pdx-data-grid :data="rows">`
            + `<slot name="col:a" let:value><i>{{ value }}</i></slot>`
            + `<slot name="col-a" let:value><u>{{ value }}</u></slot>`
            + `</pdx-data-grid>`,
        );
        parses(code);
        expect(code).toContain(`slotCarrier('col:a',`);
        expect(code).toContain(`slotCarrier('col-a',`);
    });
});
