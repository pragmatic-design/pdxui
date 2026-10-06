// Composable Lifecycle — enables shared logic functions to register
// lifecycle hooks on the current component automatically.
//
// During setup(), a ComponentScope is active. Composable functions
// call onMount/onDestroy/etc. which register on that scope.
// After setup(), the scope is cleared — calling hooks outside setup throws.

import type { Dispose } from '../utils/types';

// ─── Scope Interface ──────────────────────────────────────────────

/** Prop change info passed to onPropsChange callbacks. */
export interface PropChange {
    name: string;
    oldValue: unknown;
    newValue: unknown;
}

/** Registration interface for lifecycle hooks. Created per-component. */
export interface ComponentScope {
    track(fn: () => void | (() => void)): Dispose;
    registerMount(fn: () => void): void;
    registerDestroy(fn: () => void): void;
    registerUpdated(fn: () => void): void;
    registerError(fn: (err: unknown) => void): void;
    registerShow(fn: () => void): void;
    registerHide(fn: () => void): void;
    registerPropsChange(fn: (changes: PropChange[]) => void): void;
    registerBeforeLeave(fn: () => boolean | 'destroy' | Promise<boolean>): void;
    registerRouteChange(fn: (params: Record<string, string>) => void): void;
    element: HTMLElement;
}

// ─── Current Scope Stack ──────────────────────────────────────────

const scopeStack: ComponentScope[] = [];

/** Set the current component scope (called by component() before setup). */
export function pushScope(scope: ComponentScope): void {
    scopeStack.push(scope);
}

/** Clear the current component scope (called by component() after setup). */
export function popScope(): void {
    scopeStack.pop();
}

/** Get current scope (for internal use). Returns null if outside setup. */
export function getCurrentScope(): ComponentScope | null {
    return scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null;
}

// ─── Lifecycle Hooks ──────────────────────────────────────────────

/**
 * Register a callback to run after the component mounts (first render complete).
 * Can be called from setup() or any composable function during setup.
 *
 * Inside the mount callback, onDestroy() is available — the component scope
 * is temporarily restored so lifecycle hooks can be registered from mount callbacks.
 *
 * The callback may be async — `onMount(async () => { data = await load(); })`. Its promise is not
 * awaited and is not a cleanup: return a function from a synchronous callback for that, and register
 * an `onDestroy()` before the first `await`, since the scope is restored only while the callback runs
 * synchronously.
 */
export function onMount(fn: () => void | (() => void) | Promise<unknown>): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onMount() called outside component setup()');
    // Wrap callback to restore scope during execution, enabling onDestroy() inside onMount
    scope.registerMount(() => {
        pushScope(scope);
        try {
            const cleanup = fn();
            if (typeof cleanup === 'function') {
                scope.registerDestroy(cleanup);
            }
        } finally {
            popScope();
        }
    });
}

/**
 * Register a callback to run before the component is destroyed.
 * Can be called from setup() or any composable function during setup.
 */
export function onDestroy(fn: () => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onDestroy() called outside component setup()');
    scope.registerDestroy(fn);
}

/**
 * Register a callback to run after reactive effects flush.
 * Useful for measuring DOM after updates.
 */
export function onUpdated(fn: () => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onUpdated() called outside component setup()');
    scope.registerUpdated(fn);
}

/**
 * Register a component-level error handler.
 * Catches errors from effects and child components.
 */
export function onError(fn: (err: unknown) => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onError() called outside component setup()');
    scope.registerError(fn);
}

/**
 * Register a callback to run when a keep-alive page becomes visible again.
 * Triggered by the router outlet's 'pdx-page-show' event.
 * Useful for refreshing document.title or fetching fresh data on back-nav.
 */
export function onShow(fn: () => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onShow() called outside component setup()');
    scope.registerShow(fn);
}

/**
 * Register a callback to run when a keep-alive page is hidden (navigated away but kept alive).
 * Symmetric with onShow. Use for pausing timers, animations, or subscriptions.
 */
export function onHide(fn: () => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onHide() called outside component setup()');
    scope.registerHide(fn);
}

/**
 * Register a callback to run when component props change from parent.
 * Receives an array of PropChange objects with name, oldValue, newValue.
 * Similar to Angular's ngOnChanges or Blazor's OnParametersSet.
 */
export function onPropsChange(fn: (changes: PropChange[]) => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onPropsChange() called outside component setup()');
    scope.registerPropsChange(fn);
}

/**
 * Register a navigation guard. Called before the router navigates away from the page this
 * component is on — the routed page itself or any component inside it.
 * Return false to block navigation, 'destroy' to force destroy even if keepAlive,
 * or a Promise<boolean> for async confirmation (e.g. "unsaved changes" dialog).
 */
export function onBeforeLeave(fn: () => boolean | 'destroy' | Promise<boolean>): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onBeforeLeave() called outside component setup()');
    scope.registerBeforeLeave(fn);
}

/**
 * Register a callback when route params change but the component stays mounted.
 * E.g. navigating from /users/1 to /users/2 — same page component, different params.
 */
export function onRouteChange(fn: (params: Record<string, string>) => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onRouteChange() called outside component setup()');
    scope.registerRouteChange(fn);
}

/**
 * Track a reactive effect with auto-disposal on component disconnect.
 * Like ctx.track() but works in composables without ctx reference.
 */
export function useEffect(fn: () => void | (() => void)): Dispose {
    const scope = getCurrentScope();
    if (!scope) throw new Error('useEffect() called outside component setup()');
    return scope.track(fn);
}

/**
 * Register a callback when the component enters the viewport.
 * Uses IntersectionObserver (one per component, cleaned up on destroy).
 *
 * @param fn - Called with IntersectionObserverEntry when visibility changes
 * @param options - IntersectionObserver options (threshold, rootMargin)
 */
export function onVisible(
    fn: (entry: IntersectionObserverEntry) => void,
    options?: IntersectionObserverInit
): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onVisible() called outside component setup()');
    if (typeof IntersectionObserver === 'undefined') return;

    const el = scope.element;
    let observer: IntersectionObserver | null = null;

    scope.registerMount(() => {
        observer = new IntersectionObserver((entries) => {
            for (const entry of entries) fn(entry);
        }, options);
        observer.observe(el);
    });

    scope.registerDestroy(() => {
        observer?.disconnect();
        observer = null;
    });
}

/**
 * Register a callback when the component element resizes.
 * Uses ResizeObserver (cleaned up on destroy).
 *
 * @param fn - Called with ResizeObserverEntry on size change
 */
export function onResize(fn: (entry: ResizeObserverEntry) => void): void {
    const scope = getCurrentScope();
    if (!scope) throw new Error('onResize() called outside component setup()');
    if (typeof ResizeObserver === 'undefined') return;

    const el = scope.element;
    let observer: ResizeObserver | null = null;

    scope.registerMount(() => {
        observer = new ResizeObserver((entries) => {
            for (const entry of entries) fn(entry);
        });
        observer.observe(el);
    });

    scope.registerDestroy(() => {
        observer?.disconnect();
        observer = null;
    });
}
