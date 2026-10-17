// A scoped slot outlet's fallback survives an interpolation or a block (#276).
//
// `<slot name="row" :item="first">…fallback…</slot>`: the code generators looked for `</slot>` in the
// HTML text they were given, and the parser cuts that text at every `{{ }}` and `@directive`. A
// fallback showing data — `{{ first }}`, the usual case — was split across nodes: the outlet got an
// empty default, and the fallback was emitted BESIDE it, rendered whether or not the parent filled
// the slot (on the template path with an orphan `</slot>` in the page).
//
// Compiled on both render paths and mounted, as render-parity.test.ts does: a child with the outlet,
// alone (no fill → the fallback, once) and inside a parent that fills it (→ only the fill).

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** Compile `src` as `app-<name>` on one path and define it. */
function define(name: string, template: string, script: string, build: boolean): void {
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const options = build ? { production: true } : {};
    const { code } = compile(src, `${name}.pdx`, [], undefined, options);
    const body = code
        .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
        .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
    new Function('__core', body)(core);
}

const settle = () => new Promise(r => setTimeout(r, 0));

/** The page's text with whitespace collapsed. */
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const FALLBACKS: { name: string; fallback: string; shown: string }[] = [
    { name: 'text', fallback: 'none', shown: 'none' },
    { name: 'an element', fallback: '<span>none</span>', shown: 'none' },
    { name: 'an interpolation', fallback: 'none {{ first }}', shown: 'none Ada' },
    { name: 'an element with an interpolation', fallback: '<span>{{ first }}</span>', shown: 'Ada' },
    { name: 'a block', fallback: '@if (first) { <b>x {{ first }}</b> }', shown: 'x Ada' },
];

for (const [path, build] of [['dev', false], ['build', true]] as const) {
    describe(`a scoped slot outlet's fallback — ${path}`, () => {
        beforeEach(() => { document.body.innerHTML = ''; });

        for (const f of FALLBACKS) {
            it(`${f.name}: rendered once when the slot is not filled`, async () => {
                const child = `sfchild${++seq}${build ? 'b' : 'd'}`;
                define(child, `<div class="box"><slot name="row" :item="first">${f.fallback}</slot></div>`,
                    "let first = $signal('Ada');", build);
                const el = document.createElement(`app-${child}`);
                document.body.appendChild(el);
                await settle();
                const box = el.querySelector('.box')!;
                expect(text(box), 'the fallback is not what the outlet shows').toBe(f.shown);
                expect(box.querySelector('slot'), 'a literal <slot> element is in the page').toBeNull();
                expect(el.textContent, 'an orphan </slot> is in the page').not.toContain('</slot>');
            });

            it(`${f.name}: not rendered when the parent fills the slot`, async () => {
                const child = `sfchild${++seq}${build ? 'b' : 'd'}`;
                define(child, `<div class="box"><slot name="row" :item="first">${f.fallback}</slot></div>`,
                    "let first = $signal('Ada');", build);
                const parent = `sfparent${seq}${build ? 'b' : 'd'}`;
                define(parent, `<app-${child}><slot name="row" let:item><em>filled {{ item }}</em></slot></app-${child}>`, '', build);
                const el = document.createElement(`app-${parent}`);
                document.body.appendChild(el);
                await settle();
                const box = el.querySelector('.box')!;
                expect(text(box), 'the fallback rendered beside the fill').toBe('filled Ada');
            });
        }
    });
}
