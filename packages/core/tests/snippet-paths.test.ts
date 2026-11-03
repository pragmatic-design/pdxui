// A child hands its arguments to the parent's snippet, on both render paths (#221, #364, #492).
//
// The alpha scoped slot this replaces failed twice: the child read the parent's fills before it had
// collected them, and rendered its default for good (#221); and the fill's body was an html`` template
// core parsed at runtime, which evaluated `${…}` in an unbound attribute and put an HTML comment in
// the DOM (#364). The beta form, `@slot row?: (…)` + `@render` in the child and `@snippet` in the
// parent's tag, is held to both.
//
// In core, because the compiled components run on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** Compile one .pdx on one path, register it against core, and return its module. */
function define(name: string, template: string, script: string, build: boolean): string {
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, build ? { production: true } : {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    return code;
}

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

describe("a parent's snippet", () => {
    for (const build of [false, true]) {
        const path = build ? 'build' : 'dev';

        it(`receives the child's arguments, and follows them (${path})`, async () => {
            const n = ++seq;
            define(`snipchild${n}`, '<div class="cell">@render cell?.(r) @else { <em>none</em> }</div><button @click="r++">+</button>',
                '@slot cell?: (row: number);\nlet r = $signal(1);', build);
            define(`snipparent${n}`, `<app-snipchild${n}>@snippet cell(row) { <b>row {{ row }}</b> }</app-snipchild${n}>`, '', build);
            const el = document.createElement(`app-snipparent${n}`);
            document.body.appendChild(el);
            await settle();
            expect(text(el.querySelector('.cell')!)).toBe('row 1');
            el.querySelector('button')!.click();
            await settle();
            expect(text(el.querySelector('.cell')!), 'a changed argument did not reach the snippet').toBe('row 2');
        });

        it(`with no fallback and no snippet renders nothing, and the rest of the template (${path})`, async () => {
            const n = ++seq;
            define(`snipempty${n}`, '<div class="cell">@render cell?.(r)</div><p>after</p>', '@slot cell?: (row: number);\nlet r = $signal(1);', build);
            const el = document.createElement(`app-snipempty${n}`);
            document.body.appendChild(el);
            await settle();
            expect(text(el.querySelector('.cell')!)).toBe('');
            expect(text(el.querySelector('p')!)).toBe('after');
        });

        it(`its body is the inline path's: \`\${…}\` in an unbound attribute is text, a comment is not in the DOM (${path})`, async () => {
            const n = ++seq;
            define(`snipowner${n}`, '<p class="own">@render cell?.(r)</p>', '@slot cell?: (row: number);\nlet r = $signal(1);', build);
            const parent = define(`snipfiller${n}`,
                `<app-snipowner${n}>@snippet cell(row) { <!-- a note --><b title="\${row}">row {{ row }}</b> }</app-snipowner${n}>`, '', build);
            expect(parent, 'the snippet body is an html`` template').not.toMatch(/\bhtml`/);
            const el = document.createElement(`app-snipfiller${n}`);
            document.body.appendChild(el);
            await settle();
            expect(el.querySelector('.own b')?.getAttribute('title'), '`${row}` was evaluated').toBe('${row}');
            const comments: string[] = [];
            const walker = document.createTreeWalker(el.querySelector('.own')!, NodeFilter.SHOW_COMMENT);
            while (walker.nextNode()) comments.push((walker.currentNode as Comment).data);
            expect(comments.filter((c) => c.includes('a note')), 'the HTML comment was put in the DOM').toEqual([]);
        });
    }
});
