// Hierarchical provide/inject — DOM-tree scoped via W3C Context Protocol.
// Providers register on their host element, consumers dispatch context-request
// that bubbles up the DOM. Nearest ancestor provider wins (scoped override).
// Falls back to global registry for app-wide singletons (theme, auth, router).
//
// A value is keyed by a token, `context<T>(name)` (#495): the token IS the key, compared by identity
// here and by the context protocol, and it carries the value's type. Two calls with one name are two
// tokens. The runtime API is `provide(token, value, host)` and `inject(token, host, fallback?)`.
//
// Reference: https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md

import type { Signal } from '../utils/types';
import { effect, untracked } from '../reactivity/signal';

/**
 * A context token: the key a value of type `T` is provided and injected by. `T` is in the type only;
 * at runtime it is a frozen `{ name }`, compared by identity.
 */
export interface Context<T> {
    readonly name: string;
    /** The value's type, for TypeScript only: never set. */
    readonly __value?: T;
}

/** The value type of a token: `ContextValue<typeof CurrentUser>` is `User`. */
export type ContextValue<C> = C extends Context<infer T> ? T : never;

/**
 * A context token named `name`, for a value of type `T`. Declare it once, in a module, and import it
 * where the value is provided and where it is injected: `export const CurrentUser = context<User>('current-user');`.
 */
export function context<T>(name: string): Context<T> {
    return Object.freeze({ name }) as Context<T>;
}

/**
 * What a value is keyed by at runtime. A token everywhere the API is typed; the string a `.pdx`'s
 * `@provide key` / `@inject key` still compiles to, until those runes take a token too (#496).
 */
type ContextKey = Context<unknown> | string | symbol;

/** A key as a message names it: a token's name, or the string. */
const keyName = (key: ContextKey): string => (typeof key === 'object' ? key.name : String(key));

// ─── Global Registry (fallback for app-wide providers) ──────────

const globalRegistry = new Map<ContextKey, unknown>();

// ─── Element-Scoped Providers ───────────────────────────────────

/** Map of element → map of key → value. Providers register here. */
const elementProviders = new WeakMap<HTMLElement, Map<ContextKey, unknown>>();

/**
 * Provide a value under `token` on an element (DOM-scoped): descendants inject it. Without an
 * element it is provided globally (app-wide).
 *
 * It answers the Web Components context protocol's `context-request`, from any library: the
 * request's `context` is compared with the token by identity. A request with `subscribe: true` is
 * answered with the current value of a provided signal, and again on each change until it calls
 * the `unsubscribe` it was given, or the host component is destroyed; a plain value is answered
 * once, which the protocol allows. A request without `subscribe` gets the value as provided. A
 * provided signal is writable by whoever injects it.
 */
export function provide<T>(token: Context<T>, value: T, host?: HTMLElement): void {
    // The key may also be a `.pdx`'s string key at runtime (see ContextKey).
    const key: ContextKey = token;
    if (host) {
        let map = elementProviders.get(host);
        if (!map) { map = new Map(); elementProviders.set(host, map); }
        map.set(key, value);
        // Listen for context-request from descendants
        _ensureContextListener(host);
    } else {
        globalRegistry.set(key, value);
    }
}

/**
 * The value the nearest provider above `host` provides under `token`: a PDX provider, then any
 * provider that speaks the context protocol (a Lit one answers a request carrying the same token),
 * then the global one. With no provider it throws, naming the token and the component — unless a
 * `fallback` is passed, `undefined` included, which is returned instead.
 */
export function inject<T, F = never>(token: Context<T>, host?: HTMLElement, ...fallback: [F] | []): T | F {
    // The key may also be a `.pdx`'s string key at runtime (see ContextKey).
    const key: ContextKey = token;
    const value = _resolve(key, host);
    if (value !== undefined) return value as T;
    if (fallback.length > 0) return fallback[0] as F;
    const above = host ? ` above <${host.localName}>` : '';
    throw new Error(`No provider for context "${keyName(key)}"${above}.`);
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

/**
 * Walk up the DOM tree looking for a provider, ask the context protocol from `from`, then fall back
 * to global.
 */
function _resolve(key: ContextKey, from?: HTMLElement): unknown {
    if (from) {
        // 1. PDX providers on the ancestors (DOM-scoped, nearest wins) — shadow-crossing
        let el: HTMLElement | null = _parentOrHost(from);
        while (el) {
            const map = elementProviders.get(el);
            if (map?.has(key)) return map.get(key);
            el = _parentOrHost(el);
        }
        // 2. A provider of another library, through the protocol: a one-time request (no `subscribe`)
        // carrying the key itself. The global listener answers it too, from the registry below.
        let answer: unknown;
        const request = new Event('context-request', { bubbles: true, composed: true }) as ContextRequestEvent;
        request.context = key;
        request.contextTarget = from;
        request.callback = (value: unknown) => { answer = value; };
        request.subscribe = false;
        from.dispatchEvent(request);
        if (answer !== undefined) return answer;
    }
    // 3. Global fallback
    if (globalRegistry.has(key)) return globalRegistry.get(key);
    return undefined;
}

// ─── Internal: Context Protocol Listener ────────────────────────

const _listenersInstalled = new WeakSet<HTMLElement>();

function _ensureContextListener(element: HTMLElement): void {
    if (_listenersInstalled.has(element)) return;
    _listenersInstalled.add(element);

    element.addEventListener('context-request', ((e: Event) => {
        // A provider answers the elements below it, never a request its own host sent: a component
        // that provides a value and reads its parent's under the same token (a nested field group's
        // path) would otherwise read its own. PDX's walk starts at the parent, and Lit's provider
        // ignores its host's requests the same way.
        if (e.composedPath()[0] === element) return;
        const req = e as ContextRequestEvent;
        // The protocol allows any value as a key; PDX's are tokens (and the strings a `.pdx` still
        // compiles to). A lookup by identity simply does not find a key of another kind.
        const key = req.context as ContextKey;
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

/**
 * Install global Context Protocol listener (for global providers).
 * Responds to context-request events with values from the global registry.
 */
export function installContextProtocol(): void {
    if (_globalListenerInstalled || typeof document === 'undefined') return;
    _globalListenerInstalled = true;

    document.addEventListener('context-request', ((e: Event) => {
        const req = e as ContextRequestEvent;
        if (!globalRegistry.has(req.context as ContextKey)) return;
        e.stopPropagation();
        _answer(req, globalRegistry.get(req.context as ContextKey));
    }) as EventListener);
}

let _globalListenerInstalled = false;

// Auto-install global listener in browser
if (typeof document !== 'undefined') {
    queueMicrotask(installContextProtocol);
}
