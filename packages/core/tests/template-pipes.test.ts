// A template pipe renders the piped value, on both render paths (#199).
//
// `{{ x | upper }}` compiled to `pipe(ctx.x(), ctx.upper)`, and the `pipe` it imported from
// @pdxui/core is the SIGNAL operator (`pipe(source, ...operators)`), not the value chain core exports
// as `templatePipe`: the text showed a function's source. The inline path called a pipe with
// arguments without the value (`ctx.money('EUR')`), and both read an imported function as `ctx.fmt`.
//
// In core, because the compiled component runs on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** The component compiled on one path, run against core with `helpers` as its other imports, mounted. */
function mount(template: string, script: string, inline: boolean, helpers: Record<string, unknown> = {}): HTMLElement {
    const name = `pipes${++seq}${inline ? 'i' : 't'}`;
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, inline ? { production: true, inlineBindings: true } : { inlineBindings: false });
    const body = code
        .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
        .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'\.\/helpers';?\s*$/gm, 'const {$1} = __helpers;');
    new Function('__core', '__helpers', body)(core, helpers);
    const el = document.createElement(`pdx-${name}`);
    document.body.appendChild(el);
    return el;
}

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const SCRIPT = [
    "let name = $signal('ada');",
    'let price = $signal(12);',
    'function upper(v) { return String(v).toUpperCase(); }',
    "function money(v, currency) { return `${v} ${currency}`; }",
    'function exclaim(v) { return v + "!"; }',
].join('\n');

describe('template pipes', () => {
    for (const inline of [false, true]) {
        const path = inline ? 'inline path' : 'template path';

        it(`a pipe, a chain and a pipe with arguments render their value (${path})`, async () => {
            const el = mount('<p>{{ name | upper }}</p><p>{{ name | upper | exclaim }}</p><p>{{ price | money(\'EUR\') }}</p>', SCRIPT, inline);
            await settle();
            expect([...el.querySelectorAll('p')].map(text)).toEqual(['ADA', 'ADA!', '12 EUR']);
        });

        it(`follows the signal it pipes (${path})`, async () => {
            const el = mount('<p>{{ price | money(\'EUR\') }}</p><button @click="price = 13">+</button>', SCRIPT, inline);
            await settle();
            el.querySelector('button')!.click();
            await settle();
            expect(text(el.querySelector('p')!)).toBe('13 EUR');
        });

        it(`reaches a pipe the script imports (${path})`, async () => {
            const el = mount('<p>{{ name | shout }}</p>', "import { shout } from './helpers';\nlet name = $signal('ada');", inline,
                { shout: (v: string) => `${v.toUpperCase()}!` });
            await settle();
            expect(text(el.querySelector('p')!)).toBe('ADA!');
        });
    }
});
