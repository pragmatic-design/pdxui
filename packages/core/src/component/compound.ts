// Compound Component — parent↔child auto-wiring via provide/inject.
// Pattern: <pdx-tabs><pdx-tab /><pdx-tab-panel /></pdx-tabs>
// Parent discovers children, children access parent context.
// Used by: Tabs, Accordion, Form, Table, Menu, Splitter.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

export interface CompoundParentContext<TChild = unknown> {
    /** Unique ID for this compound group. */
    id: string;
    /** Registered children (reactive). */
    children: ReadonlySignal<TChild[]>;
    /** Register a child. Returns dispose function to unregister. */
    register(child: TChild): Dispose;
    /** Shared state accessible by children. */
    state: Record<string, unknown>;
    /** Notify parent of a child event. */
    notify(event: string, payload?: unknown): void;
}

export interface CompoundOptions<TChild = unknown> {
    /** Called when a child registers. */
    onChildAdded?: (child: TChild, index: number) => void;
    /** Called when a child unregisters. */
    onChildRemoved?: (child: TChild) => void;
    /** Called when a child notifies. */
    onNotify?: (event: string, payload?: unknown) => void;
}

// ─── createCompoundParent ─────────────────────────────────────

let _nextId = 1;

/**
 * Create a compound parent context.
 * The parent creates this and provides it to children via provide/inject.
 *
 * @example
 * // In parent component (e.g. pdx-tabs):
 * const compound = createCompoundParent<TabChild>({
 *     onChildAdded: (child, i) => { ... },
 *     onNotify: (event, payload) => { ... },
 * });
 * provide('pdx-tabs', compound);
 *
 * // In child component (e.g. pdx-tab):
 * const parent = inject<CompoundParentContext<TabChild>>('pdx-tabs');
 * const dispose = parent.register({ label: 'Tab 1', panel: panelEl });
 * onDestroy(() => dispose());
 */
export function createCompoundParent<TChild = unknown>(
    options?: CompoundOptions<TChild>,
): CompoundParentContext<TChild> {
    const id = `compound-${_nextId++}`;
    const _children = signal<TChild[]>([]);

    function register(child: TChild): Dispose {
        _children.set(prev => {
            const next = [...prev, child];
            options?.onChildAdded?.(child, next.length - 1);
            return next;
        });

        return () => {
            _children.set(prev => {
                const next = prev.filter(c => c !== child);
                options?.onChildRemoved?.(child);
                return next;
            });
        };
    }

    function notify(event: string, payload?: unknown): void {
        options?.onNotify?.(event, payload);
    }

    return {
        id,
        children: _children as ReadonlySignal<TChild[]>,
        register,
        state: {},
        notify,
    };
}

// ─── DOM-based child discovery (alternative to provide/inject) ─

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
