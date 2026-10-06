// A production build takes the inline path without being asked.
//
// `inlineBindings` replaces the tagged template — and with it the innerHTML parse, the placeholder
// scan and the `bindAttribute` dispatch — with `createElement`/`appendChild` and a direct
// assignment per binding: **3.5x on the mount** of a 1500-row list (19 ms → 5.5 ms) for
// **+0.4 KB** gzipped. It is the default, and the flag stays as the way out.
//
// What this file holds is the DEFAULT: every other test of the inline path passes
// `inlineBindings: true` explicitly, so all of them would go on passing if the default silently
// went back to false.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SOURCE = `<template>
  <div class="row" :title="label">{{ label }}</div>
</template>

<script setup>
@prop label: string = 'Hello';
</script>`;

/** The inline path builds the DOM; the template path hands a string to core's html``. */
const isInline = (code: string) => code.includes('createElement') && !code.includes('html`');

describe('inlineBindings is what a production build does', () => {
    it('the control: dev is unchanged, and still compiles through the template', () => {
        // In dev there is no build and the template path is what HMR reloads. If this ever flips,
        // the assertions below would be measuring "inline everywhere" instead of "inline in a build".
        const { code } = compile(SOURCE, 'probe.pdx', [], undefined, { production: false });
        expect(isInline(code), 'dev took the inline path').toBe(false);
    });

    it('a production compile inlines its bindings with nothing asked for', () => {
        const { code } = compile(SOURCE, 'probe.pdx', [], undefined, { production: true });
        expect(isInline(code), 'production still compiled through the tagged template').toBe(true);
    });

    it('and the way out is still there', () => {
        // The reason the flag is kept rather than removed: an inlining that turns out to be wrong
        // in some case needs a switch, and a second render path with no way to select it is what
        // this issue was about in the first place.
        const { code } = compile(SOURCE, 'probe.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(isInline(code), 'inlineBindings: false did not reach the code generator').toBe(false);
    });
});
