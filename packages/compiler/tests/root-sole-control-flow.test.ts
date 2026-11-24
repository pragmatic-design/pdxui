// A template whose only root is a control-flow node returns that node as the render (#1354). A block
// already did (#685, inline-sole-block.ts); the render's root cloned a markup of one marker, walked to
// it and replaced it with the node, which placed nothing of its own. pdx-field-group's root is an @if
// chain: −20 B gzip for the module.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(template: string, script = "let mode = $signal('a');\nlet items = $signal([]);"): string {
    const src = `<template>\n${template}\n</template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, 'root-sole.pdx', [], undefined, { production: true });
    return code;
}

describe('a control-flow node alone at the root is the render', () => {
    for (const [name, template] of [
        ['an @if chain', "@if (mode === 'a') { <p>a</p> } @else if (mode === 'b') { <p>b</p> } @else { <p>c</p> }"],
        ['an @if', "@if (mode) { <p>a</p> }"],
        ['a @switch', "@switch (mode) { @case ('a') { <p>a</p> } @default { <p>?</p> } }"],
        ['a @for', '@for (items as it; track it) { <p>{{ it }}</p> }'],
    ] as const) {
        it(`${name}: no marker root block and no replaceWith`, () => {
            const code = render(template);
            expect(code, code).not.toContain("staticMarkup('<!---->')");
            expect(code.slice(code.indexOf('render:')), code).not.toContain('replaceWith');
            expect(code).toMatch(/return __cf\d+;\n {2}\}\)\(\)/);
        });
    }

    it('the control: a root with an element beside the @if keeps its block', () => {
        const code = render("<h2>t</h2>@if (mode) { <p>a</p> }");
        expect(code.slice(code.indexOf('render:'))).toContain('replaceWith');
    });
});
