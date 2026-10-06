// Test fixture for the lazy-import race.
// Top-level await on a global gate the test controls, so the dynamic import()
// stays pending until the test resolves the gate — making the race deterministic.

await (globalThis as Record<string, unknown>).__lazyGate;

if (!customElements.get('pdx-lazypage')) {
    class LazyPage extends HTMLElement {}
    customElements.define('pdx-lazypage', LazyPage);
}

export {};
