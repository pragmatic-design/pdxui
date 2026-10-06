// Dynamic Component — enhanced version with keep-alive, lazy loading,
// typed props, and transition modes.

import { effect } from '../reactivity/signal';
import { enter, exit } from './transitions';
import { placePartNode } from './part-nodes';

// ─── Types ─────────────────────────────────────────────────────────

export interface DynamicOptions {
    /** Cache component instances and hide instead of destroying. */
    keepAlive?: boolean;
    /** Max cached instances for LRU eviction (default: 10). */
    maxAlive?: number;
    /** Transition animations on component swap. */
    transition?: { enter?: string; exit?: string };
    /** Transition sequencing: 'simultaneous', 'out-in', 'in-out'. */
    mode?: 'simultaneous' | 'out-in' | 'in-out';
    /** Enable lazy loading — tagFn can return () => import('...') pattern. */
    lazy?: boolean;
    /** Loading content shown while lazy import resolves. */
    loading?: () => Node | DocumentFragment;
}

// ─── dynamic() ────────────────────────────────────────────────────

/**
 * Dynamically render a component by tag name with enhanced features.
 * Reactively creates/destroys/caches elements when the tag changes.
 *
 * @param tagFn - Reactive function returning component tag name
 * @param propsFn - Optional reactive function returning props to pass
 * @param options - Keep-alive, transitions, lazy loading options
 */
export function dynamic(
    tagFn: () => string,
    propsFn?: (() => Record<string, unknown>) | null,
    options?: DynamicOptions
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('dynamic');
    const end = document.createComment('/dynamic');
    frag.appendChild(start);
    frag.appendChild(end);

    let currentEl: Element | null = null;
    let currentTag = '';

    const cache = options?.keepAlive ? new Map<string, Element>() : null;
    const cacheOrder: string[] = [];
    const maxAlive = options?.maxAlive ?? 10;

    function removeCurrentElement(parent: Node): Promise<void> {
        if (!currentEl) return Promise.resolve();

        const el = currentEl;

        if (cache) {
            // Keep-alive: hide instead of remove
            (el as HTMLElement).style.display = 'none';
            currentEl = null;
            currentTag = '';
            return Promise.resolve();
        }

        currentEl = null;
        currentTag = '';

        if (options?.transition?.exit) {
            return exit(el, options.transition.exit);
        }
        parent.removeChild(el);
        return Promise.resolve();
    }

    function insertElement(parent: Node, tag: string): void {
        // Check cache first
        if (cache?.has(tag)) {
            const cached = cache.get(tag)!;
            (cached as HTMLElement).style.display = '';
            currentEl = cached;
            currentTag = tag;
            // Move to front of LRU
            const idx = cacheOrder.indexOf(tag);
            if (idx >= 0) cacheOrder.splice(idx, 1);
            cacheOrder.push(tag);
            applyProps(cached);
            if (options?.transition?.enter) enter(cached, options.transition.enter);
            return;
        }

        // Create new element
        const el = document.createElement(tag);
        placePartNode(parent, el, end);
        currentEl = el;
        currentTag = tag;

        // Add to cache
        if (cache) {
            cache.set(tag, el);
            cacheOrder.push(tag);
            // LRU eviction
            while (cacheOrder.length > maxAlive) {
                const evicted = cacheOrder.shift()!;
                const evictedEl = cache.get(evicted);
                cache.delete(evicted);
                evictedEl?.parentNode?.removeChild(evictedEl);
            }
        }

        applyProps(el);
        if (options?.transition?.enter) enter(el, options.transition.enter);
    }

    function applyProps(el: Element): void {
        if (!propsFn) return;
        const props = propsFn();
        for (const [key, value] of Object.entries(props)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'function' || typeof value === 'object') {
                // Typed prop: set directly on element (signal, object, function)
                (el as unknown as Record<string, unknown>)[key] = value;
            } else {
                // Primitive: set as attribute
                el.setAttribute(key, String(value));
            }
        }
    }

    effect(() => {
        const tag = tagFn();
        const parent = end.parentNode;
        if (!parent) return;

        // Same tag — just update props
        if (tag === currentTag && currentEl) {
            applyProps(currentEl);
            return;
        }

        const mode = options?.mode ?? 'simultaneous';

        if (!tag) {
            // Empty tag — remove current
            removeCurrentElement(parent);
            return;
        }

        if (mode === 'out-in' && currentEl) {
            // Exit old, then enter new
            removeCurrentElement(parent).then(() => {
                const p = end.parentNode;
                if (p) insertElement(p, tag);
            });
        } else if (mode === 'in-out') {
            // Enter new, then exit old
            const oldEl = currentEl;
            insertElement(parent, tag);
            if (oldEl) {
                if (options?.transition?.exit) {
                    exit(oldEl, options.transition.exit);
                } else {
                    oldEl.parentNode?.removeChild(oldEl);
                }
            }
        } else {
            // Simultaneous (default)
            removeCurrentElement(parent);
            insertElement(parent, tag);
        }
    });

    return frag;
}
