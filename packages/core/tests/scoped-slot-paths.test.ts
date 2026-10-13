// A scoped slot outlet hands its scope to the parent's fill, on both render paths (#221).
//
// `renderSlot(ctx.__slots, …)` reads the parent's slot functions while the child renders, and the
// child collected them from its light children only after rendering: the parent's
// `@slot(cell, { row })` never ran, and the default was rendered for good. A self-closing outlet with
// no fill passed `null` as its default, and the mount threw `defaultFn is not a function`.
//
// In core, because the compiled components run on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** Compile one .pdx on one path and register it against core. */
function define(name: string, template: string, script: string, build: boolean): void {
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, build ? { production: true } : {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('a scoped slot outlet', () => {
    for (const build of [false, true]) {
        const path = build ? 'build' : 'dev';

        it(`passes its scope to the parent's fill, and follows it (${path})`, async () => {
            const n = ++seq;
            define(`slotchild${n}`, '<div class="cell"><slot name="cell" :row="r"><em>none</em></slot></div><button @click="r++">+</button>',
                'let r = $signal(1);', build);
            define(`slotparent${n}`, `<pdx-slotchild${n}>@slot(cell, { row }) { <b>row {{ row }}</b> }</pdx-slotchild${n}>`, '', build);
            const el = document.createElement(`pdx-slotparent${n}`);
            document.body.appendChild(el);
            await settle();
            expect(text(el.querySelector('.cell')!)).toBe('row 1');
            expect(el.querySelector('slot'), 'a literal <slot> element was rendered').toBeNull();
            el.querySelector('button')!.click();
            await settle();
            expect(text(el.querySelector('.cell')!)).toBe('row 2');
        });

        it(`renders its default without a fill (${path})`, async () => {
            const n = ++seq;
            define(`slotalone${n}`, '<div class="cell"><slot name="cell" :row="r"><em>none</em></slot></div>', 'let r = $signal(1);', build);
            const el = document.createElement(`pdx-slotalone${n}`);
            document.body.appendChild(el);
            await settle();
            expect(text(el.querySelector('.cell')!)).toBe('none');
            expect(el.querySelector('slot')).toBeNull();
        });

        it(`a self-closing outlet with no fill renders nothing, and the rest of the template (${path})`, async () => {
            const n = ++seq;
            define(`slotempty${n}`, '<div class="cell"><slot name="cell" :row="r" /></div><p>after</p>', 'let r = $signal(1);', build);
            const el = document.createElement(`pdx-slotempty${n}`);
            document.body.appendChild(el);
            await settle();
            expect(text(el.querySelector('.cell')!)).toBe('');
            expect(text(el.querySelector('p')!)).toBe('after');
        });
    }
});
