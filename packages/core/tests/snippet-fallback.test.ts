// An optional snippet's fallback, whatever it holds: text, an element, an interpolation, a block (#276).
//
// The alpha outlet `<slot name="row" :item="first">…fallback…</slot>` once lost a fallback that showed
// data: the generators cut it at the first `{{ }}` and rendered it beside the fill. Its beta form,
// `@render row?.(first) @else { … }` (#492), is held to the same cases.
//
// Compiled on both render paths and mounted, as render-parity.test.ts does: a child that renders the
// snippet, alone (no snippet → the fallback, once) and inside a parent that gives one (→ only that).

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** Compile `src` as `app-<name>` on one path and define it. */
function define(name: string, template: string, script: string, build: boolean): void {
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
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
    describe(`an optional snippet's fallback — ${path}`, () => {
        beforeEach(() => { document.body.innerHTML = ''; });
        const CHILD_SCRIPT = "@slot row?: (item: string);\nlet first = $signal('Ada');";

        for (const f of FALLBACKS) {
            it(`${f.name}: rendered once when the parent gives no snippet`, async () => {
                const child = `sfchild${++seq}${build ? 'b' : 'd'}`;
                define(child, `<div class="box">@render row?.(first) @else { ${f.fallback} }</div>`, CHILD_SCRIPT, build);
                const el = document.createElement(`app-${child}`);
                document.body.appendChild(el);
                await settle();
                const box = el.querySelector('.box')!;
                expect(text(box), 'the fallback is not what the child shows').toBe(f.shown);
            });

            it(`${f.name}: not rendered when the parent gives one`, async () => {
                const child = `sfchild${++seq}${build ? 'b' : 'd'}`;
                define(child, `<div class="box">@render row?.(first) @else { ${f.fallback} }</div>`, CHILD_SCRIPT, build);
                const parent = `sfparent${seq}${build ? 'b' : 'd'}`;
                define(parent, `<app-${child}>@snippet row(item) { <em>filled {{ item }}</em> }</app-${child}>`, '', build);
                const el = document.createElement(`app-${parent}`);
                document.body.appendChild(el);
                await settle();
                const box = el.querySelector('.box')!;
                expect(text(box), 'the fallback rendered beside the snippet').toBe('filled Ada');
            });
        }
    });
}
