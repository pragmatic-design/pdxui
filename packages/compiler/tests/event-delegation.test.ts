// Bubbling events inside a @for are delegated to one listener per type on the component (#113).
//
// A row's `@click` is stored on its element and core's single listener calls it; the order within
// the component stays the order of the DOM, so when a type is delegated every handler of that type in
// the component is — a direct listener on an ancestor would otherwise run before the row's, and the
// row's `.stop` would no longer stop it. What a listener cannot be delegated for stays direct: a
// handler on a component, under one, or in a @portal (its events do not reach the component as they
// did), and a type that also has a `.self`, `.once` or `.passive` handler, or `input`/`change` beside
// a `::` binding.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(template: string): string {
    const src = `<template>${template}</template>\n<script>\nlet rows = $signal([]);\nlet n = $signal(0);\nlet text = $signal('');\nfunction pick(id) {}\n</script>\n`;
    const { code } = compile(src, 'delegation.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
}

const ROW = (attrs: string) => `<ul>@for (rows as r; track r.id) {<li ${attrs}>x</li>}</ul>`;

describe('a @for row\'s bubbling event is delegated', () => {
    it('@click in a row is stored with core\'s delegate, not added as a listener', () => {
        const out = render(ROW('@click="pick(r.id)"'));
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'click',/);
        expect(out).not.toContain("addEventListener('click'");
    });

    it('a key filter and .stop/.prevent stay inside the stored handler', () => {
        const out = render(ROW('@keydown.enter.prevent="pick(r.id)" @click.stop="n++"'));
        // Declared once for the rows (#375), the stored handler is the modifiers' wrapper.
        const keydown = /const (__rh\d+)=\(e,__s\)=>\{if\(e instanceof KeyboardEvent[^\n]*e\.preventDefault\(\);/.exec(out);
        const click = /const (__rh\d+)=\(e,__s\)=>\{e\.stopPropagation\(\);/.exec(out);
        expect(keydown, 'no keydown handler with its filter').not.toBeNull();
        expect(click, 'no click handler with its .stop').not.toBeNull();
        expect(out).toContain(`delegate(ctx.el,__el1,'keydown',${keydown![1]},r);`);
        expect(out).toContain(`delegate(ctx.el,__el1,'click',${click![1]},r);`);
    });

    it('once a type is delegated, a handler of that type outside the @for is delegated too', () => {
        const out = render(`<div @click="n++">${ROW('@click.stop="pick(r.id)"')}</div>`);
        expect(out.match(/delegate\(ctx\.el,__el\d+,'click',/g)).toHaveLength(2);
        expect(out).not.toContain("addEventListener('click'");
    });

    it('a type nothing in a @for uses stays a direct listener', () => {
        const out = render(`<button @click="n++">+</button>${ROW('@dblclick="pick(r.id)"')}`);
        expect(out).toContain("addEventListener('click'");
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'dblclick',/);
    });
});

// A row's handler was three closures per row — the arrow, batchHandler's, safeHandler's (#375). It is
// declared once, outside the @for, and reads the row's names from the scope the row stores with it.
describe('a delegated row handler is declared once per @for, not once per row', () => {
    /** The row's render function: from the list call to the end. */
    const rowOf = (out: string, helper = 'eachRow') => out.slice(out.indexOf(`${helper}(`));

    it('the row stores its getter with a handler declared before the list', () => {
        const out = render(ROW('@click="pick(r.id)"'));
        const row = rowOf(out);
        expect(row, 'the row still builds its own handler').not.toContain('batchHandler(');
        expect(row).toMatch(/delegate\(ctx\.el,__el\d+,'click',__rh\d+,r\);/);
        const declared = out.slice(0, out.indexOf('eachRow('));
        expect(declared.match(/const __rh\d+=safeHandler\(batchHandler\(/g)).toHaveLength(1);
    });

    it('a nested loop\'s handler takes the outer row and the index too, and is declared outside both', () => {
        const out = render('@for (rows as r; track r.id) { <ul>@for (r.kids as k, i; track k) {<li @click="pick(r.id + k + i)">x</li>}</ul> }');
        const outer = out.indexOf('eachRow(');
        expect(out.slice(outer), 'a handler is still built inside a row').not.toContain('batchHandler(');
        expect(out.slice(0, outer)).toMatch(/const __rh\d+=safeHandler\(batchHandler\(/);
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'click',__rh\d+,\[r,k,i\]\);/);
    });

    it('a handler with modifiers is hoisted with them', () => {
        const out = render(ROW('@keydown.enter.prevent="pick(r.id)"'));
        expect(rowOf(out)).not.toContain('KeyboardEvent');
        expect(out.slice(0, out.indexOf('eachRow('))).toMatch(/const __rh\d+=\(e,__s\)=>\{if\(e instanceof KeyboardEvent/);
    });

    it('a destructured @for passes its names', () => {
        const out = render('<ul>@for (rows as { id, label }; track id) {<li @click="pick(id)">{{ label }}</li>}</ul>');
        expect(rowOf(out, 'each')).not.toContain('batchHandler(');
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'click',__rh\d+,\[id,label\]\);/);
    });

    it('a handler outside any @for is not hoisted: it is built once already', () => {
        const out = render(`<div @click="n++">${ROW('@click="pick(r.id)"')}</div>`);
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'click',safeHandler\(batchHandler\(\(\) => ctx\.n\.set/);
    });
});

describe('what stays a direct listener', () => {
    it('.capture, .once, .passive and .self on the row itself', () => {
        for (const mod of ['capture', 'once', 'passive', 'self']) {
            const out = render(ROW(`@click.${mod}="n++"`));
            expect(out, mod).not.toContain('delegate(');
        }
    });

    it('a .once handler of the same type anywhere keeps the whole type direct', () => {
        const out = render(`<div @click.once="n++">${ROW('@click="pick(r.id)"')}</div>`);
        expect(out).not.toContain('delegate(');
    });

    it('a .capture handler elsewhere does not: it runs in the capture phase either way', () => {
        const out = render(`<div @click.capture="n++">${ROW('@click="pick(r.id)"')}</div>`);
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'click',/);
        expect(out).toContain("addEventListener('click',");
    });

    it('a handler on a component, or under one, stays direct', () => {
        const out = render('<ul>@for (rows as r; track r.id) {<x-item @click="n++"><b @click="pick(r.id)">b</b></x-item>}</ul>');
        expect(out).not.toContain('delegate(');
    });

    it('a handler in a @portal stays direct: its events do not reach the component', () => {
        const out = render('@for (rows as r; track r.id) {@portal(\'body\') {<p @click="n++">p</p>}}');
        expect(out).not.toContain('delegate(');
    });

    it('input beside a :: binding stays direct: the two-way listener sits on the element', () => {
        const out = render(`<input ::value="text">${ROW('@input="n++"')}`);
        expect(out).not.toContain("delegate(ctx.el,");
    });
});
