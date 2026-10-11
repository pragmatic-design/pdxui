// A text interpolation reads the same in dev and in a production build.
//
// The rule is core's, documented on `interpolationText`: `null`, `undefined` and `false` are empty
// text, everything else is `String(v)`. Both render paths interpolate through `bindInterpolation`
// (#100), and a bare `t.data = String(v)` on the inline path would show nothing in dev and the word
// `null` or `false` to the users of the built app.
//
// Mounted for real on both paths, with each value — the earlier copy of this test ran the inline
// output against a hand-made document in the compiler package, which has no DOM.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

/** The rule as the template path applies it, written out: the expectation, not an implementation. */
const documented = (v: unknown): string => (v == null || v === false ? '' : String(v));

const VALUES: [string, unknown][] = [
    ['false', false], ['null', null], ['undefined', undefined], ['0', 0],
    ["''", ''], ["'x'", 'x'], ['true', true], ['42', 42],
];

let seq = 0;
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

async function render(template: string, literal: string, inline: boolean): Promise<string> {
    const name = `interptext${++seq}${inline ? 'i' : 't'}`;
    const src = `<template>${template}</template>\n<script setup>\nlet v = $signal(${literal});\nfunction same(x) { return x; }\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, inline ? { production: true, inlineBindings: true } : {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`pdx-${name}`);
    document.body.appendChild(el);
    await settle();
    return el.querySelector('p')!.textContent ?? '';
}

describe('a text interpolation reads the same in dev and in a build', () => {
    for (const inline of [false, true]) {
        const path = inline ? 'inline path' : 'template path';
        for (const [literal, v] of VALUES) {
            it(`{{ v }} with v = ${literal} (${path})`, async () => {
                expect(await render('<p>{{ v }}</p>', literal, inline)).toBe(documented(v));
            });
            it(`{{ v | same }} with v = ${literal} — the piped branch too (${path})`, async () => {
                expect(await render('<p>{{ v | same }}</p>', literal, inline)).toBe(documented(v));
            });
        }
    }
});
