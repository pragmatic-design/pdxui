// Hierarchical provide/inject — DOM-tree scoped via W3C Context Protocol.
// Providers register on their host element, consumers dispatch context-request
// that bubbles up the DOM. Nearest ancestor provider wins (scoped override).
// Falls back to global registry for app-wide singletons (theme, auth, router).
//
// Reference: https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md

import type { Signal } from '../utils/types';
import { getCurrentScope } from './lifecycle';
import { effect, untracked } from '../reactivity/signal';

// ─── Global Registry (fallback for app-wide providers) ──────────

const globalRegistry = new Map<string | symbol, unknown>();

// ─── Element-Scoped Providers ───────────────────────────────────

/** Map of element → map of key → value. Providers register here. */
const elementProviders = new WeakMap<HTMLElement, Map<string | symbol, unknown>>();

/**
 * Provide a value on a specific element (DOM-scoped).
 * Descendants can inject it via context-request event.
 * If no element is specified, provides globally (app-wide).
 *
 * It answers the Web Components context protocol's `context-request`, from any library: the
 * request's `context` is compared with `key` by identity. A request with `subscribe: true` is
 * answered with the current value of a provided signal, and again on each change until it calls
 * the `unsubscribe` it was given, or the host component is destroyed; a plain value is answered
 * once, which the protocol allows. A request without `subscribe` gets the value as provided.
 */
export function provide<T>(key: string | symbol, value: T, element?: HTMLElement): void {
    if (element) {
        let map = elementProviders.get(element);
        if (!map) { map = new Map(); elementProviders.set(element, map); }
        map.set(key, value);
        // Listen for context-request from descendants
        _ensureContextListener(element);
    } else {
        globalRegistry.set(key, value);
    }
}

/**
 * Inject a value by walking up the DOM tree (nearest provider wins).
 * Falls back to global registry. Throws if not found.
 */
export function inject<T>(key: string | symbol, from?: HTMLElement): T {
    const value = _resolve(key, from);
    if (value === undefined) {
        throw new Error(`No provider found for "${String(key)}"`);
    }
    return value as T;
}

/**
 * Try to inject a value. Returns undefined if not found.
 */
export function tryInject<T>(key: string | symbol, from?: HTMLElement): T | undefined {
    return _resolve(key, from) as T | undefined;
}

/**
 * Composable: inject a provided value using the current component's element.
 * Must be called during setup(). Throws if not found.
 *
 * Usage in setup():
 *   const theme = useProvided<ThemeSignal>('theme');
 */
export function useProvided<T>(key: string | symbol): T {
    const scope = getCurrentScope();
    if (!scope) throw new Error('useProvided() must be called during component setup()');
    return inject<T>(key, scope.element);
}

/**
 * Composable: try to inject a provided value. Returns undefined if not found.
 * Must be called during setup().
 */
export function tryUseProvided<T>(key: string | symbol): T | undefined {
    const scope = getCurrentScope();
    if (!scope) return undefined;
    return tryInject<T>(key, scope.element);
}

/**
 * Provide a writable signal for bidirectional context.
 * Children can read AND write the value via useWritable().
 * Semantic sugar over provide() — clarifies bidirectional intent.
 */
export function provideWritable<T>(key: string | symbol, value: Signal<T>, element?: HTMLElement): void {
    provide(key, value, element);
}

/**
 * Composable: inject a writable signal from an ancestor.
 * Returns the full signal object (read + write), not just the value.
 * Must be called during setup().
 *
 * Usage: const theme = useWritable<string>('theme');
 *        theme()      // read
 *        theme.set()  // write — propagates to provider
 */
export function useWritable<T>(key: string | symbol): Signal<T> {
    const scope = getCurrentScope();
    if (!scope) throw new Error('useWritable() must be called during component setup()');
    const value = _resolve(key, scope.element);
    if (value === undefined) throw new Error(`No writable provider found for "${String(key)}"`);
    // Verify it's a signal (has .set method)
    if (typeof (value as { set?: unknown }).set !== 'function') {
        throw new Error(`Provider for "${String(key)}" is not a writable signal. Use provideWritable() on the parent.`);
    }
    return value as Signal<T>;
}

/**
 * Composable: try to inject a writable signal. Returns undefined if not found.
 * Must be called during setup().
 */
export function tryUseWritable<T>(key: string | symbol): Signal<T> | undefined {
    const scope = getCurrentScope();
    if (!scope) return undefined;
    const value = _resolve(key, scope.element);
    if (value === undefined) return undefined;
    if (typeof (value as { set?: unknown }).set !== 'function') return undefined;
    return value as Signal<T>;
}

/** Clear all global providers (for testing). */
export function clearProviders(): void {
    globalRegistry.clear();
}

// ─── Internal: Resolution ───────────────────────────────────────

/** The next ancestor, crossing shadow boundaries through the host. */
function _parentOrHost(el: Element): HTMLElement | null {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
}

/** Walk up the DOM tree looking for a provider, then fall back to global. */
function _resolve(key: string | symbol, from?: HTMLElement): unknown {
    // 1. Walk ancestors (DOM-scoped, nearest wins) — shadow-crossing
    if (from) {
        let el: HTMLElement | null = _parentOrHost(from);
        while (el) {
            const map = elementProviders.get(el);
            if (map?.has(key)) return map.get(key);
            el = _parentOrHost(el);
        }
    }
    // 2. Global fallback
    if (globalRegistry.has(key)) return globalRegistry.get(key);
    return undefined;
}

// ─── Internal: Context Protocol Listener ────────────────────────

const _listenersInstalled = new WeakSet<HTMLElement>();

function _ensureContextListener(element: HTMLElement): void {
    if (_listenersInstalled.has(element)) return;
    _listenersInstalled.add(element);

    element.addEventListener('context-request', ((e: Event) => {
        const req = e as ContextRequestEvent;
        // The protocol allows any value as a key; PDX's are strings and symbols. A lookup by
        // identity simply does not find a key of another kind.
        const key = req.context as string | symbol;
        const map = elementProviders.get(element);
        if (!map?.has(key)) return;
        e.stopPropagation();
        _answer(req, map.get(key), element);
    }) as EventListener);
}

/** A provided value that changes: a signal (a callable with `.set`). */
function _isSignal(value: unknown): value is Signal<unknown> {
    return typeof value === 'function' && typeof (value as { set?: unknown }).set === 'function';
}

/**
 * Answer a request the provider holds a value for. A subscription to a signal is an effect that
 * passes each new value to the callback, read untracked so the callback's own reads do not
 * subscribe it; it ends on `unsubscribe`, or when the host component is destroyed.
 */
function _answer(req: ContextRequestEvent, value: unknown, host?: HTMLElement): void {
    if (!req.subscribe || !_isSignal(value)) {
        req.callback(value);
        return;
    }
    let active = true;
    // A consumer may unsubscribe inside the first answer, which runs before `effect` returns: the
    // disposer is not there yet, so the flag stops the answers and the line after the effect ends it.
    const subscription: { dispose?: () => void } = {};
    const unsubscribe = () => { active = false; subscription.dispose?.(); };
    subscription.dispose = effect(() => {
        const current = value();
        if (active) untracked(() => req.callback(current, unsubscribe));
    });
    if (!active) subscription.dispose();
    const destroyCallbacks = (host as { _destroyCallbacks?: (() => void)[] } | undefined)?._destroyCallbacks;
    if (Array.isArray(destroyCallbacks)) destroyCallbacks.push(unsubscribe);
}

// ─── W3C Context Protocol Types ─────────────────────────────────

/** The protocol's request: `context` IS the key, compared by identity. */
interface ContextRequestEvent extends Event {
    context: unknown;
    contextTarget?: Element | null;
    callback: (value: unknown, unsubscribe?: () => void) => void;
    subscribe?: boolean;
}

// ─── W3C Context Protocol: Request ──────────────────────────────

/**
 * Request a context value via W3C Context Protocol.
 * Dispatches a context-request event and returns the value from the nearest provider.
 * Works with any Web Component (including non-Pragmatic ones like Lit).
 */
export function requestContext<T>(element: HTMLElement, key: string | symbol): T | undefined {
    let value: T | undefined;
    // The protocol's request: the key itself as `context`, a one-time answer (no `subscribe`).
    const event = new Event('context-request', { bubbles: true, composed: true }) as ContextRequestEvent;
    event.context = key;
    event.contextTarget = element;
    event.callback = (v: unknown) => { value = v as T; };
    event.subscribe = false;
    element.dispatchEvent(event);
    // If no W3C provider answered, fall back to our resolution
    if (value === undefined) {
        value = _resolve(key, element) as T | undefined;
    }
    return value;
}

/**
 * Install global Context Protocol listener (for global providers).
 * Responds to context-request events with values from the global registry.
 */
export function installContextProtocol(): void {
    if (_globalListenerInstalled || typeof document === 'undefined') return;
    _globalListenerInstalled = true;

    document.addEventListener('context-request', ((e: Event) => {
        const req = e as ContextRequestEvent;
        if (!globalRegistry.has(req.context as string | symbol)) return;
        e.stopPropagation();
        _answer(req, globalRegistry.get(req.context as string | symbol));
    }) as EventListener);
}

let _globalListenerInstalled = false;

// Auto-install global listener in browser
if (typeof document !== 'undefined') {
    queueMicrotask(installContextProtocol);
}
