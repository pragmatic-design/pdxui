// A @store compiled and run: its $effect re-runs, onMount sees the restored state, and disposing the
// store runs onDestroy and stops the effect (#1458).
//
// The compiler half (what is emitted) is packages/compiler/tests/store-lifecycle.test.ts, the runtime
// half of core's StoreLifecycle packages/core/tests/global-store-lifecycle.test.ts. Here the .pdx is
// compiled with the real compiler and run against the real @pdxui/core: on main the factory threw
// `ctx is not defined` when the store was first used.
import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';

/** Compile a store .pdx, run the module, and return its hook. */
function load(source: string): () => { items: core.Signal<string[]> } {
    const { code } = compile(source, 'cart.pdx');
    const body = code
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/export function (use\w+)/, 'return $1; function $1');
    expect(body, 'the store module imports something besides @pdxui/core').not.toMatch(/^import /m);
    return new Function('__core', '__log', body)(core, log);
}

const log: string[] = [];
const flush = () => new Promise<void>((r) => queueMicrotask(r));

beforeEach(() => {
    core.clearStores();
    localStorage.clear();
    log.length = 0;
});

describe('a @store with $effect, onMount and onDestroy, compiled and run', () => {
    it('lives through its lifecycle', async () => {
        localStorage.setItem('__pdx_store_cart', JSON.stringify({ items: ['saved'] }));
        const useCart = load(`<script>
@store cart { persist: 'local' };
let items = $signal([] as string[]);
$effect(() => { __log.push('effect ' + items.join(',')); });
onMount(() => { __log.push('mounted ' + items.join(',')); });
onDestroy(() => { __log.push('destroyed'); });
</script>`);
        const cart = useCart();
        expect(log).toContain('mounted saved');

        cart.items.set(['a', 'b']);
        await flush();
        expect(log).toContain('effect a,b');

        expect(core.disposeStore('cart')).toBe(true);
        expect(log.at(-1)).toBe('destroyed');
        cart.items.set(['c']);
        await flush();
        expect(log).not.toContain('effect c');
    });
});
