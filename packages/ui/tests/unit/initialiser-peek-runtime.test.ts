// A `$signal` initialised from a prop's `.peek()` mounts and shows the prop's value (#1419).
//
// The compiler half (one `.peek()` in the module) is packages/compiler/tests/initialiser-peek-once.test.ts.
// Here the .pdx is compiled with the real compiler, run against the real @pdxui/core, and mounted:
// peeked twice, `ctx.start.peek().peek()` asked the string for a `peek` it has not, and mount threw.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** Compile a .pdx and run the module: the core import becomes the injected namespace. */
function load(filename: string, source: string): void {
    const { code } = compile(source, filename);
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

beforeAll(() => {
    load('peek-copy.pdx', `<template><p class="out">{{ copy }}</p></template>
<script>
@tag 'pdx-peek-copy';
@prop start: string = '';
let copy = $signal(start.peek());
</script>`);
});
afterEach(() => cleanup());

describe('$signal(prop.peek()), compiled and mounted', () => {
    it("shows the prop's value at setup", async () => {
        const el = document.createElement('pdx-peek-copy') as HTMLElement & { start: string };
        el.start = 'Ada';
        document.body.appendChild(el);
        await tick();
        expect(el.querySelector('.out')!.textContent).toBe('Ada');
    });
});
