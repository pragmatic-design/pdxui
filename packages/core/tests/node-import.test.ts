// @vitest-environment node
//
// Core, a compiled component and a library component imported where there is no DOM: plain Node,
// not happy-dom. ssr-import-launch.test.ts runs in happy-dom, which provides `DocumentFragment` and
// `customElements`, so it could not see that the guards were not there (#93). Importable means: the
// module evaluates, `component()` registers nothing, signals run. Rendering needs a DOM, and `html`
// says so instead of returning something.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

/** Evaluates a compiled module whose one import is core's, with core handed in. */
function evaluateWithCore(code: string): void {
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    // A module that imports anything else cannot be evaluated this way: say which, not a SyntaxError.
    expect(body.match(/^\s*import\b.*$/gm) ?? [], 'imports other than @pdxui/core').toEqual([]);
    new Function('__core', body)(core);
}

describe('in Node, without a DOM', () => {

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
        expect(() => evaluateWithCore(code)).not.toThrow();
    });

    // A library component, compiled from its .pdx (#1210 moved the library there). This imported a
    // component still in TypeScript, whose graph held no .pdx and no stylesheet, while there was one:
    // pdx-affix was the last. pdx-affix imports core alone, and reads the window and the document only
    // in a frame after mount.
    it('a library component, compiled, evaluates', () => {
        const file = join(__dirname, '..', '..', 'ui', 'src', 'affix', 'pdx-affix.pdx');
        const { code } = compile(readFileSync(file, 'utf8'), file, [], undefined, { production: true });
        // The tag's prefix is the project's (`pdx-` in the library's build), not this compile's.
        expect(code).toMatch(/defineComponent\('\w+-affix'/);
        expect(() => evaluateWithCore(code)).not.toThrow();
    });

    it('html`` throws an error that names the call instead of returning a fragment', () => {
        expect(() => core.html`<p></p>`).toThrow(/html`` needs a DOM/);
    });
});
