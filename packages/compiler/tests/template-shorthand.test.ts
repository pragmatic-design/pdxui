// An object shorthand in a template expression must compile to JavaScript that parses.
//
// Compiled to `ctx.send({ ctx.productId(), ctx.n() })`, `@click="send({ productId, n })"` is a syntax
// error — `{ ctx.x }` — the module fails to load, and every component in it goes unregistered. The
// template twin of the same shorthand in <script setup>.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';

function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('out.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    return diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

const SCRIPT = [
    '<script setup>',
    '@prop productId: string = "p1";',
    'let n = $signal(1);',
    'function send(o) { console.log(o); }',
    'function pick(o) { console.log(o); }',
    'let items = $signal([{ id: 1 }]);',
    '</script>',
].join('\n');

function build(template: string): string {
    return compile(`<template>${template}</template>\n${SCRIPT}`, 'cart-line.pdx').code;
}

describe('an object shorthand in a template expression', () => {
    it('@click="send({ productId, n })" passes the values, and the module parses', () => {
        const code = build('<button @click="send({ productId, n })">Add</button>');
        expect(parseErrors(code), 'the generated module does not parse').toEqual([]);
        expect(code).toContain('productId: ctx.productId()');
        expect(code).toContain('n: ctx.n()');
    });

    it(':title="JSON.stringify({ productId })" parses, and the key is the name', () => {
        const code = build('<span :title="JSON.stringify({ productId })">x</span>');
        expect(parseErrors(code)).toEqual([]);
        expect(code).toContain('productId: ctx.productId()');
    });

    it('a shorthand inside an arrow that returns an object: () => ({ n })', () => {
        const code = build('<button @click="() => send(({ n }))">x</button>');
        expect(parseErrors(code)).toEqual([]);
        expect(code).toContain('n: ctx.n()');
    });

    it('@for (keyed, row getters): pick({ item }) passes the row\'s value', () => {
        const code = build('@for (items as item; track item.id) { <button @click="pick({ item })">x</button> }');
        expect(parseErrors(code)).toEqual([]);
        expect(code).toContain('item: item()');
    });

    it('@for with a destructured binding (plain locals, each()): pick({ id }) stays { id }', () => {
        const code = build('@for (items as { id }; track id) { <button @click="pick({ id })">x</button> }');
        expect(parseErrors(code)).toEqual([]);
        expect(code).toContain('ctx.pick({ id })');
    });

    it('controls — { a: b }, { ...rest }, obj.x and an arrow block compile as before, and parse', () => {
        const code = build([
            '<button @click="send({ key: productId })">a</button>',
            '<button @click="send({ ...items })">b</button>',
            '<span :title="items.length">c</span>',
            '<button @click="() => { send(n) }">d</button>',
        ].join(''));
        expect(parseErrors(code)).toEqual([]);
        expect(code).toContain('key: ctx.productId()');
        expect(code).toContain('...ctx.items()');
        expect(code).toContain('ctx.items().length');
        expect(code).not.toContain('n: ctx.n()');
    });
});
