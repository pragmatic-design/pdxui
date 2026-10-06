// `$watch(() => open, cb)` calls back when the prop changes, as `$watch(open, cb)` does.
//
// The compiler half — one getter, not `() => () => open()` — is in
// packages/compiler/tests/watch-source.test.ts. This is the half the author sees: the .pdx compiled
// with the real compiler, run against the real @pdxui/core, mounted, its prop set. A getter form that
// never calls back fails silently: a catalogue opens without focusing its search.
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

const panel = (source: string) => `<template>
<p class="seen">{{ seen }}</p>
</template>
<script setup>
@prop open: boolean = false;
let seen = $signal('closed');
$watch(${source}, (isOpen) => { seen = isOpen ? 'opened' : 'closed'; });
</script>`;

beforeAll(() => {
    load('watch-getter-panel.pdx', panel('() => open'));
    load('watch-name-panel.pdx', panel('open'));
});
afterEach(() => cleanup());

describe('$watch over a @prop, compiled and mounted', () => {
    for (const [spelling, tag] of [['() => open', 'pdx-watch-getter-panel'], ['open', 'pdx-watch-name-panel']] as const) {
        it(`$watch(${spelling}, cb) calls back when the prop changes`, async () => {
            const el = document.createElement(tag) as HTMLElement & { open: boolean };
            document.body.appendChild(el);
            await tick();
            const seen = () => el.querySelector('.seen')!.textContent!.trim();
            expect(seen()).toBe('closed');

            el.open = true;
            await tick();
            expect(seen(), 'the callback did not run on the change').toBe('opened');

            el.open = false;
            await tick();
            expect(seen()).toBe('closed');
        });
    }
});
