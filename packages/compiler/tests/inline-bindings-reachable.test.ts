// `inlineBindings` has to be reachable from a vite.config.ts.
//
// The flag swaps `html``` for imperative DOM construction — the "direct property assignment inline"
// the Dual Mode table promises for production. It has its own generator
// (`codegen-template-inline.ts`, a whole second render path), and an option that `PdxPluginOptions`
// does not carry, or that the plugin's call to `compile()` does not pass, is one no application can
// turn on: its only caller would be the compiler's own suite, calling `compile()` directly.
//
// A second implementation of the render path kept green by the tests that are its only caller is
// worse than no implementation: it costs maintenance, it looks shipped, and nothing measures it.
//
// So the assertion is not "the generator works" — the tests beside this one cover that. It is that
// the option travels from `pdx({ … })` to the emitted module, and that the DEFAULT is unchanged.
// Both are read off a real Vite build, because "reachable from a config" is exactly the thing a
// unit test of `compile()` cannot see.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

const COMPONENT = `<template>
  <p class="line" :title="label">{{ label }}</p>
</template>
<script setup>
@prop label: string = 'hello';
</script>`;

const ENTRY = `import './widget.pdx';\ndocument.createElement('pdx-widget');\n`;

let root: string;

/** Build the same one-component app and return the JS it emits. */
async function buildWith(options: Parameters<typeof pdx>[0]): Promise<string> {
    const result = await build({
        root,
        logLevel: 'silent',
        plugins: [pdx(options)],
        build: {
            write: false,
            minify: false,
            lib: { entry: join(root, 'src', 'main.js'), formats: ['es'], fileName: 'app' },
        },
    });
    const chunks = (Array.isArray(result) ? result[0] : result) as { output: { type: string; code?: string }[] };
    return chunks.output.filter(o => o.type === 'chunk').map(o => o.code ?? '').join('\n');
}

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pdx-inline-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'widget.pdx'), COMPONENT, 'utf-8');
    writeFileSync(join(root, 'src', 'main.js'), ENTRY, 'utf-8');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the flag a vite.config.ts can set', () => {
    // The marker is the component's own MARKUP, `<p class="line"`, not the string `html\``: the
    // bundle contains the whole of `@pdxui/core`, and core's renderer uses `html\`` itself. An
    // assertion on that string is red on the inline build for a reason that has nothing to do with
    // the component — measured, not guessed.
    const MARKUP = '<p class="line"';

    it('on by default: a production build builds its DOM imperatively', async () => {
        // This is what a build does with nothing asked for, and this file is where that default is
        // asserted end to end — through a real
        // `vite build` with a real `vite.config.ts`, which is the only place the plugin's default
        // and the code generator's meet.
        const code = await buildWith({ devtools: false });

        expect(code, 'a default production build did not take the inline path')
            .toContain('document.createElement("p")');
        expect(code, 'the markup string is still in the bundle, so the default did not move')
            .not.toContain(MARKUP);
    }, 120_000);

    it('the way out: pdx({ inlineBindings: false }) goes back to the template path', async () => {
        // The control, and the reason the flag was kept rather than removed: an inlining that turns
        // out to be wrong in some case needs a switch. Without this assertion the one above would
        // pass on a build that emitted neither path.
        const code = await buildWith({ devtools: false, inlineBindings: false });
        expect(code, 'inlineBindings: false did not reach the compiler').toContain(MARKUP);
    }, 120_000);
});
