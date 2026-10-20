// Compound components: a parent that finds its children by selector.
// Pattern: <pdx-tabs><pdx-tab /><pdx-tab-panel /></pdx-tabs>
// `createCompoundParent`, the registry a parent provided to its children, left the public API (#144):
// a parent provides a token with `@provide`, and its children `@inject` it.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── DOM-based child discovery ─

export interface ChildDiscoveryOptions {
    /** CSS selector for child elements. */
    selector: string;
    /** Observe DOM mutations for dynamic children. Default: true. */
    observe?: boolean;
}

/**
 * Discover child elements via DOM query.
 * Alternative to provide/inject for simpler compound patterns
 * where children are known by selector (e.g. slot-based composition).
 *
 * @example
 * const children = discoverChildren(() => containerEl, {
 *     selector: 'pdx-tab',
 * });
 * // children.items() — reactive list of matching elements
 */
export function discoverChildren(
    parent: () => HTMLElement | null,
    options: ChildDiscoveryOptions,
): { items: ReadonlySignal<HTMLElement[]>; dispose: Dispose } {
    const _items = signal<HTMLElement[]>([]);
    let observer: MutationObserver | null = null;
    let cleanupEffect: Dispose | null = null;

    function scan(el: HTMLElement): void {
        const found = Array.from(el.querySelectorAll(options.selector)) as HTMLElement[];
        _items.set(found);
    }

    if (typeof document !== 'undefined') {
        cleanupEffect = effect(() => {
            const el = parent();
            if (!el) return;

            scan(el);

            if (options.observe !== false) {
                observer = new MutationObserver(() => scan(el));
                observer.observe(el, { childList: true, subtree: true });
            }

            return () => {
                observer?.disconnect();
                observer = null;
            };
        });
    }

    return {
        items: _items as ReadonlySignal<HTMLElement[]>,
        dispose: () => {
            cleanupEffect?.();
            observer?.disconnect();
        },
    };
}
