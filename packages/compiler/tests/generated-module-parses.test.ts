// Modules the compiler wrote that did not parse, and nothing said so (#675).
//
// The type erasure used to hand back, unerased and in silence, any module that did not parse. Since it
// stops the compile when the script parses and the module does not, each of these surfaced: code the
// compiler wrote itself, which the browser would have refused.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** The module parses as JavaScript: imports dropped, `new Function` judges the rest. */
function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
    expect(() => new Function(body), `the module is not valid JavaScript:\n${code}`).not.toThrow();
}

describe('the module a .pdx compiles to parses', () => {
    it('a debug name taken from a Windows path is the file name, in a string that holds it', () => {
        // `packages\ui\…`: `\u` is an escape, and the whole path inside quotes was not a string.
        const source = '<template><p>{{ doubled }}</p></template>\n<script>\nlet count = $signal(1);\nconst doubled = $derived(count * 2);\n</script>';
        const { code } = compile(source, 'C:\\repo\\packages\\ui\\pilot\\counter.pdx');
        parses(code);
        expect(code).toContain("{ name: 'counter:count' }");
        expect(code).toContain("{ name: 'counter:doubled' }");
    });

    it('an async arrow handler keeps async and await as keywords', () => {
        // `async ev => { await go(ev.detail) }` is a documented handler form; prefixed as names it was
        // `ctx.async() ev => { ctx.await() ctx.go(…) }`.
        const source = '<template><x-c @pdx-go="async ev => { await go(ev.detail) }"></x-c></template>\n<script>\nasync function go(d: unknown) { return d; }\n</script>';
        const { code } = compile(source, 'async-handler.pdx');
        parses(code);
        expect(code).not.toMatch(/ctx\.async|ctx\.await/);
        // The handler itself, not a function returning it: wrapped in `() => …` it never called go().
        expect(code).toMatch(/batchHandler\(async ev => \{ await ctx\.go\(ev\.detail\) \}\)/);
    });
});
