// `pdx({ target })`, the browser target the compiled output relies on (#121), and the option it
// replaced in the beta's list of removed forms, `inlineBindings`.
//
// No output depends on the target yet — #152, #132, #153 and #156 add it — so what is measured here
// is that the target reaches the code generators (`ctx.target`), from `compile()` and from the plugin,
// with 'baseline-2026' when nothing is said.

import { describe, it, expect, expectTypeOf, vi, beforeEach } from 'vitest';

const seen: { target?: unknown }[] = [];
vi.mock('../src/compiler/compile-context', async () => {
    const actual = await vi.importActual<typeof import('../src/compiler/compile-context')>('../src/compiler/compile-context');
    return {
        ...actual,
        createCompileContext: (options?: Parameters<typeof actual.createCompileContext>[0]) => {
            const ctx = actual.createCompileContext(options);
            seen.push({ target: ctx.target });
            return ctx;
        },
    };
});

const { compile, pdx } = await import('../src/plugin');
type PdxPluginOptions = import('../src/plugin').PdxPluginOptions;

const SOURCE = '<template><p>{{ n }}</p></template>\n<script>\nlet n = $signal(1);\n</script>\n';

beforeEach(() => { seen.length = 0; });

describe('the browser target', () => {
    it("is 'baseline-2026' when nothing is said", () => {
        compile(SOURCE, 'x.pdx');
        expect(seen.map((s) => s.target)).toEqual(['baseline-2026']);
    });

    it("reaches ctx.target from compile()'s options", () => {
        compile(SOURCE, 'x.pdx', [], undefined, { target: 'baseline-2024' });
        expect(seen.map((s) => s.target)).toEqual(['baseline-2024']);
    });

    it('reaches ctx.target from the plugin', async () => {
        const plugin = pdx({ target: 'baseline-2024', devtools: false })[0] as unknown as {
            transform: (code: string, id: string) => unknown;
        };
        await plugin.transform.call({ warn() {}, error(e: unknown) { throw e; }, addWatchFile() {} }, SOURCE, '/app/src/x.pdx');
        expect(seen.map((s) => s.target)).toContain('baseline-2024');
    });
});

describe('inlineBindings', () => {
    it('is not an option of pdx() any more', () => {
        expectTypeOf<PdxPluginOptions>().not.toHaveProperty('inlineBindings');
        expectTypeOf<PdxPluginOptions>().toHaveProperty('target');
    });
});
