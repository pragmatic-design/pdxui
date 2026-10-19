// A .pdx takes the inline path without being asked, in dev and in a production build (#107).
//
// `inlineBindings` replaces the tagged template — and with it the innerHTML parse, the placeholder
// scan and the `bindAttribute` dispatch — with `createElement`/`appendChild` and a direct
// assignment per binding: **3.5x on the mount** of a 1500-row list (19 ms → 5.5 ms) for
// **+0.4 KB** gzipped. It is the one render path; `compile()`'s internal switch has no test left
// that sets it since the parity table records its expectations (#237), and is removed with #238.
//
// What this file holds is the DEFAULT: many tests of the inline path pass `inlineBindings: true`
// explicitly, so all of them would go on passing if the default silently went back to false.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { builds } from './static-markup-of';

const SOURCE = `<template>
  <div class="row" :title="label">{{ label }}</div>
</template>

<script>
@prop label: string = 'Hello';
</script>`;

/**
 * The inline path builds the block's static markup — written as HTML since #369 — and binds the
 * render's nodes itself; the template path hands a string to core's html``.
 */
const isInline = (code: string) => builds(code, 'div') && !code.includes('html`');

describe('inlineBindings is what a .pdx compiles with, dev and build', () => {
    it('dev compiles inline too: one render path (#107)', () => {
        const { code } = compile(SOURCE, 'probe.pdx', [], undefined, { production: false });
        expect(isInline(code), 'dev still compiled through the tagged template').toBe(true);
    });

    it('a production compile inlines its bindings with nothing asked for', () => {
        const { code } = compile(SOURCE, 'probe.pdx', [], undefined, { production: true });
        expect(isInline(code), 'production still compiled through the tagged template').toBe(true);
    });
});
