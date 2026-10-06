// Lazy loading with composite triggers and permission integration.
// Innovation: viewport | idle(2000) composite triggers + @require permission-aware.

import { signal, effect } from '../reactivity/signal';
import { placePartNode } from './part-nodes';


const isBrowser = typeof window !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────────

export interface DeferOptions {
    /** Trigger expression: 'viewport', 'idle', 'idle(2000)', 'hover', 'timer(1000)', 'immediate'.
     *  Composite: 'viewport | idle(2000)' (OR — any trigger fires). */
    trigger: string;
    /** Permission required before loading. */
    permission?: string;
    /** Placeholder shown before trigger fires. */
    placeholder?: () => Node | DocumentFragment;
    /** Loading state after trigger, before load completes. */
    loading?: () => Node | DocumentFragment;
    /** Error state if load fails. */
    error?: (err: Error, retry: () => void) => Node | DocumentFragment;
}

export type DeferState = 'placeholder' | 'triggered' | 'loading' | 'loaded' | 'error';

// ─── defer() ───────────────────────────────────────────────────────

/**
 * Lazy-load content when trigger conditions are met.
 *
 * Usage:
 *   ${defer({
 *     trigger: 'viewport | idle(2000)',
 *     placeholder: () => html`<div class="skeleton">...</div>`,
 *     loading: () => html`<spinner/>`,
 *   }, () => import('./heavy-chart.js'), (mod) => html`<heavy-chart/>`)}
 *
 * Simple usage (no dynamic import):
 *   ${defer({ trigger: 'viewport' },
 *     null,
 *     () => html`<div class="heavy">Loaded!</div>`)}
 */
export function defer(
    options: DeferOptions,
    loadFn: (() => Promise<unknown>) | null,
    renderFn: (module?: unknown) => Node | DocumentFragment
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('defer');
    const end = document.createComment('/defer');
    frag.appendChild(start);
    frag.appendChild(end);

    const state = signal<DeferState>('placeholder');
    const loadedModule = signal<unknown>(null);
    const loadError = signal<Error | null>(null);
    let sentinel: HTMLElement | null = null;
    let cleanups: (() => void)[] = [];

    function doLoad() {
        if (state.peek() !== 'placeholder' && state.peek() !== 'triggered') return;
        state.set('loading');
        cleanupTriggers();

        if (loadFn) {
            loadFn()
                .then(mod => {
                    loadedModule.set(mod);
                    state.set('loaded');
                })
                .catch(err => {
                    loadError.set(err instanceof Error ? err : new Error(String(err)));
                    state.set('error');
                });
        } else {
            // No async load — render immediately
            state.set('loaded');
        }
    }

    function retry() {
        loadError.set(null);
        state.set('placeholder');
        doLoad();
    }

    function cleanupTriggers() {
        for (const c of cleanups) c();
        cleanups = [];
        if (sentinel?.parentNode) sentinel.parentNode.removeChild(sentinel);
        sentinel = null;
    }

    // Set up triggers after mount
    effect(() => {
        const parent = end.parentNode;
        if (!parent || state() !== 'placeholder') return;

        // Parse and activate triggers
        const triggers = options.trigger.split('|').map(t => t.trim());

        for (const trigger of triggers) {
            const cleanup = activateTrigger(trigger, parent, end, () => {
                state.set('triggered');
                doLoad();
            });
            if (cleanup) cleanups.push(cleanup);
        }

        return cleanupTriggers;
    });

    // Render based on state
    let currentNodes: Node[] = [];

    effect(() => {
        const s = state();
        const parent = end.parentNode;
        if (!parent) return;

        for (const n of currentNodes) n.parentNode?.removeChild(n);
        currentNodes = [];

        let content: Node | DocumentFragment | null | undefined = null;

        switch (s) {
            case 'placeholder':
                content = options.placeholder?.();
                break;
            case 'loading':
                content = options.loading?.() ?? options.placeholder?.();
                break;
            case 'loaded':
                content = renderFn(loadedModule.peek());
                break;
            case 'error': {
                const err = loadError.peek();
                content = err ? options.error?.(err, retry) : null;
                break;
            }
        }

        if (content) {
            const nodes = content instanceof DocumentFragment
                ? Array.from(content.childNodes)
                : [content];
            for (const n of nodes) placePartNode(parent, n, end);
            currentNodes = nodes;
        }
    });

    return frag;
}

// ─── Trigger Activation ────────────────────────────────────────────

function activateTrigger(
    trigger: string,
    parent: Node,
    before: Node,
    onTrigger: () => void
): (() => void) | null {
    if (!isBrowser) return null;

    const timerMatch = trigger.match(/^timer\((\d+)\)$/);
    const idleMatch = trigger.match(/^idle(?:\((\d+)\))?$/);

    if (trigger === 'immediate') {
        onTrigger();
        return null;
    }

    if (trigger === 'viewport') {
        return setupViewportTrigger(parent, before, onTrigger);
    }

    if (idleMatch) {
        const timeout = idleMatch[1] ? parseInt(idleMatch[1]) : 2000;
        return setupIdleTrigger(timeout, onTrigger);
    }

    if (trigger === 'hover' || trigger === 'interaction') {
        return setupInteractionTrigger(before, onTrigger);
    }

    if (timerMatch) {
        const ms = parseInt(timerMatch[1]);
        const id = setTimeout(onTrigger, ms);
        return () => clearTimeout(id);
    }

    // Unknown trigger — fire immediately
    onTrigger();
    return null;
}

function setupViewportTrigger(
    parent: Node,
    before: Node,
    onTrigger: () => void
): () => void {
    const sentinel = document.createElement('span');
    sentinel.style.display = 'block';
    sentinel.style.height = '1px';
    sentinel.style.visibility = 'hidden';
    (parent as Element).insertBefore(sentinel, before);

    const observer = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) {
            onTrigger();
            observer.disconnect();
        }
    }, { rootMargin: '100px' });

    observer.observe(sentinel);

    return () => {
        observer.disconnect();
        sentinel.parentNode?.removeChild(sentinel);
    };
}

function setupIdleTrigger(timeout: number, onTrigger: () => void): () => void {
    const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(onTrigger, { timeout });
        return () => w.cancelIdleCallback?.(id);
    }
    // Fallback to setTimeout
    const id = setTimeout(onTrigger, timeout);
    return () => clearTimeout(id);
}

/**
 * `hover` / `interaction`: listen on the element the block ends up IN.
 *
 * Takes the end marker, not the parent the caller had: triggers are set up from
 * `end.parentNode`, and at that moment the fragment has not been inserted yet, so the "parent" is
 * the DocumentFragment. A fragment is not an `Element`, so that parent would fall back to
 * `document.body` — and `pointerenter` on the body fires the moment the pointer enters the page. A
 * trigger that means "when the user touches this" would behave like "when the user touches
 * anything": clicking a nav link would fetch the chart of a tab nobody had opened.
 *
 * So the element is resolved LATE, from the marker, once it has been placed. `viewport` solves
 * the same problem with its sentinel; this one cannot, because it has to listen on the real
 * container rather than on a 1px span.
 *
 * Bounded: a block whose fragment is never inserted simply never arms. Retrying forever would be
 * a frame callback per deferred block for the life of the page, and firing on the body is the
 * behaviour being removed.
 */
const INTERACTION_ATTACH_FRAMES = 10;

function setupInteractionTrigger(marker: Node, onTrigger: () => void): () => void {
    let el: Element | null = null;
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;
    let attempts = 0;

    const handler = (): void => { onTrigger(); cleanup(); };
    const cleanup = (): void => {
        if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
        el?.removeEventListener('pointerenter', handler);
        el?.removeEventListener('focusin', handler);
    };

    const attach = (): void => {
        frame = null;
        const host = marker.parentNode;
        if (host instanceof Element) {
            el = host;
            el.addEventListener('pointerenter', handler, { once: true });
            el.addEventListener('focusin', handler, { once: true });
            return;
        }
        if (++attempts <= INTERACTION_ATTACH_FRAMES) frame = requestAnimationFrame(attach);
    };

    attach();
    return cleanup;
}
