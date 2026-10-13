// The names a template block binds are in scope inside it, on both render paths (#201).
//
// `@catch (problem, again)` compiled `{{ problem.message }}` to `ctx.problem().message`, and
// `@error (fail, again)` compiled `again()` to `ctx.again()`: only names the compiler already left
// unprefixed (`err`, `retry`, …) worked. The names here are deliberately off that list.
//
// In core, because the compiled component runs on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

function mount(template: string, script: string, build: boolean): HTMLElement {
    const name = `bound${++seq}${build ? 'b' : 'd'}`;
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, build ? { production: true } : {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`pdx-${name}`);
    document.body.appendChild(el);
    return el;
}

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('names a block binds', () => {
    for (const build of [false, true]) {
        const path = build ? 'build' : 'dev';

        it(`@catch (problem, again): both names are the block's (${path})`, async () => {
            const el = mount(
                '@try { <p class="body">{{ boom() }}</p> } @catch (problem, again) { <p class="caught">{{ problem.message }}</p><i>{{ typeof again }}</i> }',
                "function boom() { throw new Error('broke'); }",
                build,
            );
            await settle();
            expect(text(el.querySelector('.caught'))).toBe('broke');
            expect(text(el.querySelector('i'))).toBe('function');
        });

        it(`@await … @error (fail, again): both names are the block's (${path})`, async () => {
            const el = mount(
                '@await (job) { <p class="ok">ok</p> } @loading { <p>…</p> } @error (fail, again) { <p class="failed">{{ fail.message }}</p><i>{{ typeof again }}</i> }',
                "let job = $signal(Promise.reject(new Error('down')));",
                build,
            );
            await settle();
            expect(text(el.querySelector('.failed'))).toBe('down');
            expect(text(el.querySelector('i'))).toBe('function');
        });
    }
});

describe('a destructured @for', () => {
    it('binds every name in its pattern, not the pattern as one name', () => {
        const src = "<template><ul>@for (pairs as { key, value }; track key) { <li>{{ key }}={{ value }}</li> }</ul></template>\n<script setup>\nlet pairs = $signal([{ key: 'a', value: 1 }]);\n</script>\n";
        const { errors, warnings } = compile(src, 'pairs.pdx') as { errors?: { code?: string }[]; warnings?: { code?: string }[] };
        const codes = [...(errors ?? []), ...(warnings ?? [])].map((d) => d.code);
        expect(codes).not.toContain('PDX_UNDECLARED_REF');
    });

    for (const build of [false, true]) {
        it(`renders each name (${build ? 'build' : 'dev'})`, async () => {
            const el = mount(
                '<ul>@for (pairs as { key, value }; track key) { <li>{{ key }}={{ value }}</li> }</ul>',
                "let pairs = $signal([{ key: 'a', value: 1 }, { key: 'b', value: 2 }]);",
                build,
            );
            await settle();
            expect([...el.querySelectorAll('li')].map(text)).toEqual(['a=1', 'b=2']);
        });
    }
});
