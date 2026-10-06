// Error Boundary — catches errors from content rendering and effect execution.
// Tracks async error handler lifecycle to prevent stack leaks on retry.

import { pushErrorHandler, popErrorHandler, collectDisposers, onDispose, setErrorOwnerResolver, effect, untracked } from '../reactivity/signal';
import type { Dispose } from '../utils/types';
import { nodesBetween } from './helpers';
import { placePartNode } from './part-nodes';

// A boundary's range is the nodes between its two comments. Marking them lets an error find its
// boundary through the DOM, which is what encloses a component: the handler stack only covers the
// moment the content is built, and a child component renders later, when it connects.
interface BoundaryMark {
    handler: (err: unknown) => void;
    /** False while the fallback is shown: an error from the fallback belongs to the next boundary out. */
    accepts: () => boolean;
}
const boundaryStarts = new WeakMap<Node, BoundaryMark>();
const boundaryEnds = new WeakMap<Node, Node>(); // end comment → its start comment

/**
 * The handler of the nearest boundary that encloses `node`, or null. At each level it walks the
 * previous siblings: a start comment means `node` is inside that range; an end comment is a range
 * that closed before `node`, skipped whole by jumping to its start.
 */
function findEnclosingBoundary(node: Node): ((err: unknown) => void) | null {
    for (let level: Node | null = node; level; level = level.parentNode) {
        let sib: Node | null = level.previousSibling;
        while (sib) {
            const mark = boundaryStarts.get(sib);
            if (mark?.accepts()) return mark.handler;
            // A closed range before us: skip it whole, from its end to its start.
            sib = (boundaryEnds.get(sib) ?? sib).previousSibling;
        }
    }
    return null;
}

// Installed by the first boundary rather than at load: with no boundary there is nothing to find,
// and the module stays free of load-time effects (sideEffects guard).
let resolverInstalled = false;

export interface ErrorBoundaryOptions {
    /** Maximum number of retries before showing permanent fallback. Default: Infinity (manual only). */
    maxRetries?: number;
    /** Delay in ms between auto-retries. Default: 1000. */
    retryDelay?: number;
    /** Auto-retry on error (no user action needed). Default: false. */
    autoRetry?: boolean;
    /** Callback for error telemetry/logging. Called on every error. */
    onError?: (error: Error, retryCount: number) => void;
    /**
     * Leave the fallback when this value changes (`Object.is`), and render the content again. What
     * `@await (p)` passes as `() => p`: a new promise in the signal is the retry.
     */
    resetOn?: () => unknown;
}

/**
 * Wrap content in an error boundary. If the content function or any of its
 * reactive effects throw, the fallback is rendered instead.
 *
 * @param contentFn — function that renders the content
 * @param fallbackFn — function that renders the fallback (receives error + retry fn)
 * @param options — optional: maxRetries, autoRetry, retryDelay, onError callback
 */
export function errorBoundary(
    contentFn: () => Node | DocumentFragment,
    fallbackFn: (error: Error, retry: () => void) => Node | DocumentFragment,
    options?: ErrorBoundaryOptions,
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('error-boundary');
    const end = document.createComment('/error-boundary');
    frag.appendChild(start);
    frag.appendChild(end);

    // Disposer for the effects created inside the currently-rendered content — disposed on
    // every re-render and on teardown so retries don't leak effects and unmount is clean.
    let childDispose: Dispose | null = null;
    let retryCount = 0;
    const maxRetries = options?.maxRetries ?? Infinity;
    const retryDelay = options?.retryDelay ?? 1000;
    const autoRetry = options?.autoRetry ?? false;
    const onError = options?.onError;
    const resetOn = options?.resetOn;
    let showingFallback = false;
    // While the fallback shows: the effect watching `resetOn`, disposed when the content comes back.
    let resetWatch: Dispose | null = null;

    if (!resolverInstalled) {
        setErrorOwnerResolver((owner) => (owner instanceof Node ? findEnclosingBoundary(owner) : null));
        resolverInstalled = true;
    }
    boundaryStarts.set(start, {
        handler: (err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            // The range is still being inserted. A child that fails while it mounts calls
            // this from its connectedCallback, and an environment that connects each node of a
            // fragment as it lands — happy-dom does; browsers run the reactions once the insertion is
            // over — calls it before the end marker has arrived. Handle it when the insertion that is
            // running now has finished: one microtask, not a timer and not a retry.
            if (start.parentNode !== end.parentNode) { queueMicrotask(() => handleError(error)); return; }
            handleError(error);
        },
        accepts: () => !showingFallback,
    });
    boundaryEnds.set(end, start);

    function clearContent(): void {
        const parent = end.parentNode;
        if (!parent) return;
        // Everything between the markers, not the nodes inserted: a `<slot>` in the content is
        // replaced by the projected children, which a snapshot would leave behind.
        for (const n of nodesBetween(start, end)) parent.removeChild(n);
    }

    function insertNodes(content: Node | DocumentFragment): void {
        const parent = end.parentNode;
        if (!parent) return;
        const nodes = content instanceof DocumentFragment
            ? Array.from(content.childNodes)
            : [content];
        for (const n of nodes) placePartNode(parent, n, end);
    }

    function renderContent(): void {
        resetWatch?.();
        resetWatch = null;
        childDispose?.();  // dispose the previous render's effects
        childDispose = null;
        clearContent();
        showingFallback = false;

        let caught: Error | null = null;

        // Effects created while this handler is on the stack capture it (per-effect, at
        // creation time) and route their async errors here — even after we pop it below.
        const errorHandler = (err: unknown) => {
            handleError(err instanceof Error ? err : new Error(String(err)));
        };

        pushErrorHandler(errorHandler);
        try {
            const [content, dispose] = collectDisposers(() => contentFn());
            childDispose = dispose;
            insertNodes(content);
            retryCount = 0; // Reset on success
        } catch (err) {
            caught = err instanceof Error ? err : new Error(String(err));
        } finally {
            popErrorHandler();
        }

        // No persistent global push: async routing is per-effect, so a sibling
        // boundary cannot swallow this subtree's errors.
        if (caught) handleError(caught);
    }

    function handleError(error: Error): void {
        retryCount++;
        onError?.(error, retryCount);

        if (autoRetry && retryCount < maxRetries) {
            // Auto-retry after delay
            setTimeout(() => renderContent(), retryDelay);
            return;
        }

        renderFallback(error);
    }

    function renderFallback(error: Error): void {
        // The content's DOM is gone, so are its effects: left alive, the `when` of a failed @await
        // stayed subscribed to its promise and re-ran on nodes nobody could see.
        childDispose?.();
        childDispose = null;
        clearContent();
        showingFallback = true;
        const canRetry = retryCount < maxRetries;
        try {
            const fallback = fallbackFn(error, canRetry ? retry : () => {});
            insertNodes(fallback);
        } catch {
            const msg = document.createTextNode(`Error: ${error.message}`);
            const parent = end.parentNode;
            if (parent) placePartNode(parent, msg, end);
        }
        watchForReset();
    }

    /** In the fallback: when `resetOn` changes, a new attempt — the content, rendered again. */
    function watchForReset(): void {
        resetWatch?.();
        resetWatch = null;
        if (!resetOn) return;
        let first = true;
        let seen: unknown;
        resetWatch = effect(() => {
            const value = resetOn();
            if (first) { first = false; seen = value; return; }
            if (Object.is(value, seen) || !showingFallback) return;
            retryCount = 0;
            // Untracked: what the content reads while it renders belongs to its own effects, not
            // to this watcher.
            untracked(() => renderContent());
        });
    }

    function retry(): void {
        if (retryCount >= maxRetries) return;
        renderContent();
    }

    renderContent();
    // Teardown: dispose the current content's effects when the enclosing scope is removed.
    onDispose(() => { childDispose?.(); childDispose = null; resetWatch?.(); resetWatch = null; });
    return frag;
}
