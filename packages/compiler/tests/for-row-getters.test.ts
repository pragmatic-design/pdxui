// @for compiles to eachRow: the item and index are row getters, read as `item()`.
//
// What the runtime does with them is in core (each-row.test.ts) and end to end in ui
// (for-row-updates.test.ts). This file pins the rewrite itself, including the places where a name
// that LOOKS like the loop variable is not a reference to it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function tpl(template: string, script = 'let rows = $signal([]);'): string {
    return compile(`<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`, 'rows.pdx').code;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

describe('@for row getters', () => {
    it('a plain item compiles to eachRow and reads through item()', () => {
        const code = tpl('@for (rows as r, i; track r.id) { <b>{{ i }} {{ r.name }}</b> }');
        parses(code);
        expect(code).toContain('eachRow(');
        expect(code).toContain('${() => r().name}');
        expect(code).toContain('${() => i()}');
    });

    it('a property with the same name as the loop variable is not a reference', () => {
        const code = tpl('@for (rows as r; track r.id) { <b>{{ r.r }} {{ other.r }}</b> }', 'let rows = $signal([]);\nlet other = $signal({ r: 1 });');
        parses(code);
        expect(code).toContain('r().r');
        expect(code).not.toContain('r().r()');
        expect(code).toContain('ctx.other().r');
    });

    it('an arrow parameter that shadows the loop variable is left alone', () => {
        const code = tpl('@for (rows as r; track r.id) { <b>{{ r.tags.filter(r => r.on).length }}</b> }');
        parses(code);
        expect(code).toContain('r().tags.filter(r => r.on)');
    });

    it('an object key with the loop name is not rewritten', () => {
        const code = tpl('@for (rows as r; track r.id) { <b :title="JSON.stringify({ r: r.id })"></b> }');
        parses(code);
        expect(code).toContain('{ r: r().id }');
    });

    it('an inner loop reusing the name does not take it out of scope for the rest of the outer body', () => {
        // The inner loop binds `r` again. Deleting the name on its way out (what the scope code
        // did) would leave the outer `r.name` below as `ctx.r`.
        const code = tpl('@for (rows as r; track r.id) { @for (r.kids as r; track r.id) { <i>{{ r.n }}</i> } <b>{{ r.name }}</b> }');
        parses(code);
        expect(code).toContain('() => r().kids');
        expect(code).toContain('${() => r().n}');
        expect(code, 'the outer item lost its getter after the inner loop').toContain('${() => r().name}');
        expect(code).not.toMatch(/ctx\.r\b/);
    });

    it('a :ref inside a row gets the ref object, not an arrow — bindRef only accepts .set()', () => {
        const code = tpl('@for (rows as r; track r.id) { <b :ref="r.ref"></b> }');
        parses(code);
        expect(code).toContain(':ref=${r().ref}');
        expect(code).not.toContain(':ref=${() =>');
    });

    it('control — a destructured binding keeps each(), bound once', () => {
        const code = tpl('@for (rows as { id, name }; track id) { <b>{{ name }}</b> }');
        parses(code);
        expect(code).toContain('each(');
        expect(code).not.toContain('eachRow(');
    });

    it('control — outside a loop nothing is a row getter', () => {
        const code = tpl('<b>{{ item }}</b>', 'let item = $signal(1);');
        expect(code).not.toContain('item()()');
        expect(code).toContain('ctx.item');
    });
});
