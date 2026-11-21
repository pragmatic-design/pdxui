// @vitest-environment node
//
// Core, a compiled component and a library component imported where there is no DOM: plain Node,
// not happy-dom. ssr-import-launch.test.ts runs in happy-dom, which provides `DocumentFragment` and
// `customElements`, so it could not see that the guards were not there (#93). Importable means: the
// module evaluates, `component()` registers nothing, signals run. Rendering needs a DOM, and `html`
// says so instead of returning something.
import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

describe('in Node, without a DOM', () => {
    // Imported here, not in the test: the first import of a source module pays for its whole graph.
    let libraryImport: Promise<unknown>;
    beforeAll(async () => {
        // A library component written in TypeScript whose graph holds no .pdx: core's suite does not
        // compile .pdx, and the library moves to .pdx one component at a time (#1210) — pdx-button,
        // the component this imported, is one now, and every component that renders a button reaches
        // it. pdx-relative-time imports core, its stylesheet and a locale helper only. When it moves
        // too, this import has to be of a compiled module, which core's suite then has to compile.
        libraryImport = import('../../ui/src/relative-time/pdx-relative-time');
        // Settled here; a rejection is asserted by the test below, which names it, not by the hook.
        await libraryImport.catch(() => undefined);
    });

    it('has no DOM globals to fall back on', () => {
        expect(typeof document).toBe('undefined');
        expect(typeof customElements).toBe('undefined');
        expect(typeof HTMLElement).toBe('undefined');
    });

    it('signals, computeds and effects run', () => {
        const count = core.signal(1);
        const doubled = core.computed(() => count() * 2);
        let seen = 0;
        core.effect(() => { seen = doubled(); });
        count.set(4);
        expect(seen).toBe(8);
    });

    it('component() registers nothing, and does not throw', () => {
        expect(() => core.component('pdx-node-probe', {
            setup: () => ({}),
            render: () => core.html`<p></p>`,
        })).not.toThrow();
    });

    it('a compiled .pdx module evaluates', () => {
        const src = '<template><button @click="count++">{{ count }}</button></template>\n'
            + '<script>\nlet count = $signal(0);\n</script>\n';
        const { code } = compile(src, 'node-counter.pdx', [], undefined, {});
        expect(code).toMatch(/from '@pdxui\/core'/);
        const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
        expect(() => new Function('__core', body)(core)).not.toThrow();
    });

    it('a library component module imports', async () => {
        await expect(libraryImport).resolves.toBeDefined();
    });

    it('html`` throws an error that names the call instead of returning a fragment', () => {
        expect(() => core.html`<p></p>`).toThrow(/html`` needs a DOM/);
    });
});
