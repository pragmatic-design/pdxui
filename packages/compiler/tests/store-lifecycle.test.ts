// A @store's $effect, onMount and onDestroy compile to the store's own lifecycle (#1458).
//
// The factory took the component's setup: `$effect` became `ctx.track(…)` and `onMount` / `onDestroy`
// stayed as written, none of them defined in a store's factory, which has no `ctx` and imports no
// hook — `ReferenceError` when the store was first used, and the compile said nothing. Now `$effect` is
// `effect()`, owned by the store, and the hooks are the store's: onMount once the store is created,
// onDestroy when it is disposed (core's StoreLifecycle).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const store = (body: string) => `<script>\n@store cart;\nlet items = $signal([]);\n${body}\n</script>`;

describe('the lifecycle of a @store', () => {
    it('$effect is effect(), and no ctx is read', () => {
        const { code } = compile(store('$effect(() => { console.log(items); });'), 'cart.pdx');
        expect(code).toMatch(/\n\s+effect\(\(\) => \{ console\.log\(__items\(\)\); \}/);
        expect(code).not.toMatch(/\bctx\./);
    });

    it('onMount and onDestroy register on the store the factory is given', () => {
        const { code } = compile(store("onMount(() => { console.log('ready'); });\nonDestroy(() => { console.log('gone'); });"), 'cart.pdx');
        expect(code).toMatch(/createGlobalStore\('cart', \(__store\) => \{/);
        expect(code).toMatch(/__store\.onMount\(\(\) => \{ console\.log\('ready'\); \}\)/);
        expect(code).toMatch(/__store\.onDestroy\(\(\) => \{ console\.log\('gone'\); \}\)/);
        expect(code).not.toMatch(/import \{[^}]*\bon(Mount|Destroy)\b/);
    });
});

describe('controls', () => {
    it('a store with no hook keeps its factory without a parameter', () => {
        const { code } = compile(store(''), 'cart.pdx');
        expect(code).toMatch(/createGlobalStore\('cart', \(\) => \{/);
    });

    it('a component keeps ctx.track, onMount and onDestroy', () => {
        const src = "<template><p>x</p></template>\n<script>\nlet n = $signal(0);\n$effect(() => { console.log(n); });\nonMount(() => {});\nonDestroy(() => {});\n</script>";
        const { code } = compile(src, 'w.pdx');
        expect(code).toContain('ctx.track(');
        expect(code).toMatch(/\n\s+onMount\(/);
        expect(code).toMatch(/\n\s+onDestroy\(/);
    });

    it('a script-only module keeps effect() and calls onMount at once', () => {
        const { code } = compile('let n = $signal(0);\n$effect(() => { console.log(n); });\nonMount(() => { console.log(1); });\nexport const r = () => n;', 'm.pdx.ts');
        expect(code).toMatch(/\beffect\(/);
        expect(code).toMatch(/\(\(\) => \{ console\.log\(1\); \}\)\(\);/);
    });
});
