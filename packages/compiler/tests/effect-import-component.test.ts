// A component's $effect compiles to ctx.track(), and imports no `effect` (#1265).
//
// Every $effect added `effect` to the features the module imports, but in a component it compiles to
// `ctx.track(fn)`: the library build warned `"effect" is imported … but never used` once per component
// with an $effect. Only a script-only module calls `effect()`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** The names of the module's `import { … } from '@pdxui/core'`. */
function coreImport(code: string): string[] {
    // Match: import { a, b } from '@pdxui/core'; Groups: [1]=the specifier list
    const m = /import \{([^}]*)\} from '@pdxui\/core';/.exec(code);
    return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

describe('$effect in a component', () => {
    it('compiles to ctx.track( and imports no effect', () => {
        const src = '<template><p>{{ n }}</p></template>\n<script>\nlet n = $signal(0);\n$effect(() => { console.log(n); });\n</script>';
        const { code } = compile(src, 'w.pdx');
        expect(code).toContain('ctx.track(');
        expect(coreImport(code)).not.toContain('effect');
    });

    it('a script that calls effect() itself still imports it', () => {
        const src = "<template><p>{{ n }}</p></template>\n<script>\nimport { effect } from '@pdxui/core';\nlet n = $signal(0);\n$effect(() => { console.log(n); });\nconst stop = effect(() => n);\n</script>";
        const { code } = compile(src, 'w.pdx');
        expect(coreImport(code)).toContain('effect');
    });
});

describe('controls — where $effect compiles to effect()', () => {
    it('a script-only .pdx.ts imports and calls effect', () => {
        const src = 'let n = $signal(0);\n$effect(() => { console.log(n); });\nexport const read = () => n;';
        const { code } = compile(src, 'counter.pdx.ts');
        expect(code).toMatch(/\beffect\(/);
        expect(coreImport(code)).toContain('effect');
    });

    // A @store's $effect is effect(), owned by the store (#1458): its module imports and calls it.
    it('a @store module imports and calls effect', () => {
        const src = '<script>\n@store cart;\nlet items = $signal([]);\n$effect(() => { console.log(items); });\n</script>';
        const { code } = compile(src, 'cart.pdx');
        expect(code).toMatch(/\beffect\(/);
        expect(coreImport(code)).toContain('effect');
    });
});
