// Test helpers for @pdxui/ui unit tests.
// Provides mount/cleanup utilities for Web Component testing in happy-dom.

let _tagId = 0;

/** Generate a unique CE tag to avoid customElements.define collision across tests. */
export function uniqueTag(base: string): string {
    return `test-${base}-${_tagId++}`;
}

/** Mount an element, wait for CE upgrade + rAF, return it. */
export async function mount<T extends HTMLElement>(tag: string, attrs?: Record<string, string>): Promise<T> {
    const el = document.createElement(tag) as T;
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    // Wait for CE upgrade + requestAnimationFrame
    await tick();
    return el;
}

/** Wait for microtasks + rAF to flush. */
export async function tick(ms = 0): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 0));
}

/**
 * Resolve once `el` is defined and has rendered: for a component another one imports lazily, like the
 * pager's pdx-select (#407). A fixed tick before reading its markup passes only while the module is
 * quick to arrive, and a contended gate does not wait for it (#692). A null `el` resolves at once, and
 * the caller's own assertion reports it.
 */
export async function whenUpgraded(el: Element | null): Promise<void> {
    if (!el) return;
    await customElements.whenDefined(el.localName);
    await tick();
}

/** Clean up DOM between tests. */
export function cleanup(): void {
    document.body.innerHTML = '';
}
