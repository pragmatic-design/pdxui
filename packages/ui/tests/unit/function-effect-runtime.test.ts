// An effect written as `function() { … }` subscribes to the signals it reads.
//
// The compiler half — no PDX_REWRITE_FALLBACK, `__count()` in the output — is
// packages/compiler/tests/function-expression-callbacks.test.ts. This is the half the author sees:
// the .pdx compiled with the real compiler, run against the real @pdxui/core, mounted and
// clicked. An effect that reads the signal's getter, not its value, runs once.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';

/** Compile a .pdx and run the module: the core import becomes the injected namespace. */
function load(filename: string, source: string): void {
    const { code } = compile(source, filename, [], undefined, {});
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const MIRROR = `<template>
<button class="bump" @click="count++">+</button>
<p class="seen">{{ seen }}</p>
</template>
<script setup>
let count = $signal(0);
let seen = $signal('');
$effect(function() { seen = 'count is ' + count; });
</script>`;

beforeAll(() => load('function-effect-mirror.pdx', MIRROR));
afterEach(() => cleanup());

describe('$effect(function () { … }), compiled and mounted', () => {
    it('runs again when the signal it reads changes', async () => {
        const el = document.createElement('pdx-function-effect-mirror');
        document.body.appendChild(el);
        await tick();
        const seen = () => el.querySelector('.seen')!.textContent!.trim();
        expect(seen()).toBe('count is 0');

        el.querySelector<HTMLButtonElement>('.bump')!.click();
        await tick();
        expect(seen(), 'the effect did not subscribe to count').toBe('count is 1');
    });
});
