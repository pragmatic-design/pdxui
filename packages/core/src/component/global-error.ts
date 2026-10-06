// Global Error Interceptor — catches all unhandled errors across the framework.
//
// Three-level error handling:
//   1. @try/@catch — local block, dev writes custom fallback
//   2. <pdx-error-boundary> — subtree, built-in fallback with retry
//   3. onGlobalError() — app-wide, catches everything that escapes levels 1-2
//
// Sources captured: render errors, effect errors, event handler errors,
// unhandled promise rejections, uncaught exceptions.

import { getTopErrorHandler } from '../reactivity/signal';
import { DEV } from '../utils/env';
import { devRecordError } from '../debug/devtools-api';
import type { DevtoolsErrorSource } from '../debug/devtools-api';

/** Classification of where the error originated. */
export type ErrorSource =
    | 'render'      // throw during contentFn() or template evaluation
    | 'effect'      // throw inside a tracked effect
    | 'event'       // throw inside a @click/@input/etc. handler
    | 'async'       // unhandled promise rejection
    | 'unhandled';  // uncaught exception (window.onerror)

/** Context passed to the global error handler. */
export interface ErrorContext {
    /** Where the error originated. */
    source: ErrorSource;
    /** Component tag name (if known, e.g. 'pdx-counter'). */
    component?: string;
    /** Event name that triggered the error (for 'event' source, e.g. 'click'). */
    event?: string;
    /**
     * The component's `.pdx`, relative to the app root (`src/pages/login.pdx`). Development builds
     * only: the compiler registers each component with it there, and nowhere else.
     */
    file?: string;
}

/**
 * The `.pdx` a component tag was compiled from, when its registration carries one — a development
 * build. Read from the registered class, so it needs nothing but the tag.
 */
export function componentFile(tag: string): string | undefined {
    if (!DEV || typeof customElements === 'undefined') return undefined;
    const file = (customElements.get(tag) as { file?: unknown } | undefined)?.file;
    return typeof file === 'string' ? file : undefined;
}

/** `<tag>`, or `<tag> (src/x.pdx)` when its file is known: how an error names its component. */
export function componentLabel(tag: string, file = componentFile(tag)): string {
    return file ? `<${tag}> (${file})` : `<${tag}>`;
}

/**
 * The component an error owner is — the element `pushErrorOwner` was given — for an error that no
 * boundary took. Duck-typed: the reactivity layer that holds the owner knows nothing of elements.
 */
export function ownerContext(owner: unknown): { component?: string; file?: string } {
    const tag = (owner as { localName?: unknown } | null)?.localName;
    if (typeof tag !== 'string' || !tag.includes('-')) return {};
    const file = componentFile(tag);
    return file ? { component: tag, file } : { component: tag };
}

/** An error source as `__PDX_DEVTOOLS__.errors()` names it. */
const DEVTOOLS_SOURCE: Record<ErrorSource, DevtoolsErrorSource> = {
    render: 'render', effect: 'effect', event: 'handler', async: 'global', unhandled: 'global',
};

/** Callback signature for the global error handler. */
export type GlobalErrorHandler = (error: Error, context: ErrorContext) => boolean | void;

// --- Registry ---

let _handlers: GlobalErrorHandler[] = [];
let _browserListenersInstalled = false;

/**
 * Register a global error handler. Called for any error not caught by
 * a local @try/@catch or <pdx-error-boundary>.
 *
 * Return `true` from the handler to suppress the default console.error.
 * Multiple handlers are called in registration order; if any returns true,
 * the error is considered handled.
 *
 * @returns Dispose function to unregister the handler.
 */
export function onGlobalError(handler: GlobalErrorHandler): () => void {
    _handlers.push(handler);
    installBrowserListeners();
    return () => {
        _handlers = _handlers.filter(h => h !== handler);
    };
}

/**
 * Dispatch an error to all registered global handlers.
 * If no handler suppresses it, logs to console.error.
 *
 * Called internally by the framework — not typically used by app code.
 */
export function dispatchGlobalError(error: unknown, context: ErrorContext): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (context.component && !context.file) {
        const file = componentFile(context.component);
        if (file) context = { ...context, file };
    }
    if (DEV) devRecordError(error, DEVTOOLS_SOURCE[context.source], context.component, context.file);
    let handled = false;

    for (const handler of _handlers) {
        try {
            if (handler(err, context) === true) handled = true;
        } catch {
            // Handler itself threw — don't recurse, just log
            console.error('[pdx] Global error handler threw:', err);
        }
    }

    if (!handled) {
        console.error(`[pdx] Unhandled ${context.source} error${context.component ? ` in ${componentLabel(context.component, context.file)}` : ''}:`, err);
    }
}

/**
 * Route an error through the error handling chain:
 * 1. Local error boundary (errorHandlerStack) — if active
 * 2. Global error handlers (onGlobalError) — fallback
 */
function routeError(err: unknown, context: ErrorContext): void {
    const localHandler = getTopErrorHandler();
    if (localHandler) {
        // A boundary takes it, and the devtools still list it.
        if (DEV) devRecordError(err, DEVTOOLS_SOURCE[context.source], context.component, context.component ? componentFile(context.component) : undefined);
        localHandler(err);
    } else {
        dispatchGlobalError(err, context);
    }
}

/**
 * Wrap an event handler function so errors are caught and routed.
 * Tries the local error boundary first, then falls back to global handler.
 * Used by the compiler to wrap @click, @input, etc.
 */
// `any` is required: this wraps arbitrary user event handlers of any signature
// (the compiler passes (e: Event) => void, () => Promise<void>, etc.) — a precise
// type would reject valid callers under strictFunctionTypes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeHandler(fn: (...args: any[]) => any, component?: string, event?: string): (...args: any[]) => any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(this: any, ...args: any[]) {
        try {
            const result = fn.apply(this, args);
            // Handle async handlers (async function or returned Promise)
            if (result && typeof result.catch === 'function') {
                result.catch((err: unknown) => {
                    routeError(err, { source: 'event', component, event });
                });
            }
            return result;
        } catch (err) {
            routeError(err, { source: 'event', component, event });
        }
    };
}

/**
 * Install browser-level listeners for unhandled rejections and uncaught errors.
 * Only installs once, even if called multiple times.
 */
function installBrowserListeners(): void {
    if (_browserListenersInstalled || typeof window === 'undefined') return;
    _browserListenersInstalled = true;

    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        if (_handlers.length === 0) return; // let browser handle it
        const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
        let handled = false;
        for (const handler of _handlers) {
            try {
                if (handler(err, { source: 'async' }) === true) handled = true;
            } catch { /* ignore */ }
        }
        if (handled) e.preventDefault();
    });

    window.addEventListener('error', (e: ErrorEvent) => {
        if (_handlers.length === 0) return;
        const err = e.error instanceof Error ? e.error : new Error(e.message);
        let handled = false;
        for (const handler of _handlers) {
            try {
                if (handler(err, { source: 'unhandled' }) === true) handled = true;
            } catch { /* ignore */ }
        }
        if (handled) e.preventDefault();
    });
}

/** Clear all handlers (for testing). */
export function clearGlobalErrorHandlers(): void {
    _handlers = [];
}
