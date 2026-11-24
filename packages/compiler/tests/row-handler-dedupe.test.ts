// Two handlers with the same compiled body in one @for are one function (#1346). A delegated handler in
// a row is declared once before the outermost @for (#375); pdx-page-header's breadcrumb wrote
// `@click="chooseCrumb(c)"` in two branches of its row, and the module declared it twice.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(row: string): string {
    const src = `<template><ul>@for (items as c, i; track i) {<li>${row}</li>}</ul></template>\n`
        + '<script>\nlet items = $signal([]);\nfunction pick(x) { return x; }\n</script>\n';
    const { code } = compile(src, 'row-dedupe.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
}

const handlers = (code: string) => (code.match(/eventHandler\(/g) ?? []).length;

describe('a row handler written twice is declared once', () => {
    it('the same @click in two branches of a row: one eventHandler, delegated from both', () => {
        const out = render('@if (c.a) { <a @click="pick(c)">x</a> } @else { <button @click="pick(c)">y</button> }');
        expect(handlers(out), out).toBe(1);
        expect((out.match(/delegate\(ctx\.el,__el\d+,'click',__rh\d+,/g) ?? []).length).toBe(2);
    });

    it('with a modifier too: the inner handler once', () => {
        const out = render('@if (c.a) { <a @click.prevent="pick(c)">x</a> } @else { <a @click.prevent="pick(c)">y</a> }');
        expect(handlers(out), out).toBe(1);
    });

    it('the control: two different bodies stay two', () => {
        const out = render('@if (c.a) { <a @click="pick(c)">x</a> } @else { <button @click="pick(i)">y</button> }');
        expect(handlers(out), out).toBe(2);
    });
});
