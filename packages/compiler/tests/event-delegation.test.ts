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
    const src = `<template>${template}</template>\n<script setup>\nlet rows = $signal([]);\nlet n = $signal(0);\nlet text = $signal('');\nfunction pick(id) {}\n</script>\n`;
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
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'keydown',\(e\)=>\{if\(e instanceof KeyboardEvent/);
        expect(out).toMatch(/delegate\(ctx\.el,__el\d+,'click',\(e\)=>\{e\.stopPropagation\(\);/);
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
