// What a vite.config.ts gets: the inline render, whatever `inlineBindings` says (#107).
//
// The inline path swaps `html``` for imperative DOM construction, and since #107 it is the one
// render path of a .pdx, in dev and in a build. `pdx({ inlineBindings })` no longer selects
// anything: the plugin does not forward it, and says so with PDX_INLINE_BINDINGS_IGNORED.
//
// Read off a real Vite build, because what reaches the emitted module from a config is exactly the
// thing a unit test of `compile()` cannot see.

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

/** Build the same one-component app and return the JS it emits, and the codes of its warnings. */
async function buildWith(options: Parameters<typeof pdx>[0]): Promise<{ code: string; warnings: (string | undefined)[] }> {
    const warnings: (string | undefined)[] = [];
    const result = await build({
        root,
        logLevel: 'silent',
        plugins: [pdx(options)],
        build: {
            write: false,
            minify: false,
            lib: { entry: join(root, 'src', 'main.js'), formats: ['es'], fileName: 'app' },
            // A plugin's warning reaches onwarn as PLUGIN_WARNING, with the plugin's own code beside it.
            rollupOptions: { onwarn: (w) => { warnings.push(typeof w.pluginCode === 'string' ? w.pluginCode : w.code); } },
        },
    });
    const chunks = (Array.isArray(result) ? result[0] : result) as { output: { type: string; code?: string }[] };
    return { code: chunks.output.filter(o => o.type === 'chunk').map(o => o.code ?? '').join('\n'), warnings };
}

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pdx-inline-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'widget.pdx'), COMPONENT, 'utf-8');
    writeFileSync(join(root, 'src', 'main.js'), ENTRY, 'utf-8');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('what a vite.config.ts gets', () => {
    // The marker is the component's own MARKUP, `<p class="line"`, not the string `html\``: the
    // bundle contains the whole of `@pdxui/core`, and core's renderer uses `html\`` itself. An
    // assertion on that string is red on the inline build for a reason that has nothing to do with
    // the component — measured, not guessed.
    const MARKUP = '<p class="line"';

    it('by default: a production build builds its DOM imperatively, and says nothing', async () => {
        const { code, warnings } = await buildWith({ devtools: false });

        expect(code, 'a default production build did not take the inline path')
            .toContain('__d.createElement("p")');
        expect(code, 'the markup string is in the bundle: the template path was taken')
            .not.toContain(MARKUP);
        expect(warnings).not.toContain('PDX_INLINE_BINDINGS_IGNORED');
    }, 120_000);

    it('pdx({ inlineBindings: false }) is reported and changes nothing: the build is still inline', async () => {
        const { code, warnings } = await buildWith({ devtools: false, inlineBindings: false });
        expect(warnings).toContain('PDX_INLINE_BINDINGS_IGNORED');
        expect(code, 'inlineBindings: false still reached the compiler').not.toContain(MARKUP);
        expect(code).toContain('__d.createElement("p")');
    }, 120_000);
});
