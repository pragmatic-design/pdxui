// `pdx({ inlineBindings })` no longer selects a render path (#107): a .pdx compiles with the inline
// path in dev and in a build. A value given is reported once, as PDX_INLINE_BINDINGS_IGNORED, and
// the module still compiles inline.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';
import { builds } from './static-markup-of';

type Hooks = {
    config: (c: object, e: { command: string }) => unknown;
    configResolved: (r: { root: string; base?: string; server: { fs: { allow: string[] } } }) => void;
    buildStart: (this: { warn: (w: unknown) => void }) => void;
    transform: (code: string, id: string) => { code: string } | null;
};

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'pdx-inline-')); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const SFC = '<template>\n  <p :title="label">{{ label }}</p>\n</template>\n<script setup>\nlet label = $signal(\'x\');\n</script>\n';

function start(options: Parameters<typeof pdx>[0], command: 'build' | 'serve') {
    const plugin = pdx({ devtools: false, autoAlias: false, ...options }) as unknown as Hooks;
    plugin.config({}, { command });
    plugin.configResolved({ root, server: { fs: { allow: [] } } });
    const warnings: { code?: string; message?: string }[] = [];
    plugin.buildStart.call({ warn: (w) => warnings.push(w as { code?: string }) });
    return { plugin, warnings };
}

describe('pdx({ inlineBindings }) is ignored', () => {
    for (const command of ['build', 'serve'] as const) {
        it(`${command}: inlineBindings: false is reported and the module still compiles inline`, () => {
            const { plugin, warnings } = start({ inlineBindings: false }, command);
            const codes = warnings.map(w => w.code);
            expect(codes).toContain('PDX_INLINE_BINDINGS_IGNORED');
            expect(warnings.find(w => w.code === 'PDX_INLINE_BINDINGS_IGNORED')!.message).toMatch(/no longer selects a render path/);
            const out = plugin.transform(SFC, join(root, 'src', 'card.pdx'))!;
            expect(out.code).not.toMatch(/\bhtml`/);
            expect(builds(out.code, 'p')).toBe(true);
        });
    }

    it('control — no option, no warning', () => {
        const { warnings } = start({}, 'build');
        expect(warnings.map(w => w.code)).not.toContain('PDX_INLINE_BINDINGS_IGNORED');
    });
});
