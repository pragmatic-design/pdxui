// Helper to register Custom Elements with a pdx- prefix convention.
// Supports HMR via prototype swapping — existing instances update in-place.

import type { PdxElement } from './element';

type PdxElementConstructor = new () => PdxElement;

/** Map of tag → latest constructor, for HMR prototype swapping. */
const latestCtorMap = new Map<string, PdxElementConstructor>();

/** Map of tag → set of live instances, for HMR re-render. */
const instanceRegistry = new Map<string, Set<PdxElement>>();

/** Register a Custom Element. If already defined, swaps prototype for HMR. */
export function define(tag: string, ctor: PdxElementConstructor): void {
    latestCtorMap.set(tag, ctor);

    if (!customElements.get(tag)) {
        // First registration — create a thin wrapper that delegates to latest ctor
        customElements.define(tag, ctor as unknown as CustomElementConstructor);
    }
    // If already registered, latestCtorMap is updated — HMR will use it
}

/** Track a live instance for HMR. Called from PdxElement.connectedCallback. */
export function trackInstance(tag: string, el: PdxElement): void {
    let set = instanceRegistry.get(tag);
    if (!set) { set = new Set(); instanceRegistry.set(tag, set); }
    set.add(el);
}

/** Untrack a destroyed instance. Called from PdxElement.disconnectedCallback. */
export function untrackInstance(tag: string, el: PdxElement): void {
    instanceRegistry.get(tag)?.delete(el);
}

/**
 * HMR: swap prototypes of all live instances to the latest class version.
 * Then re-render each instance by clearing DOM and calling body() again.
 */
export function __pdx_hmr_swap(tag: string): void {
    const NewCtor = latestCtorMap.get(tag);
    const instances = instanceRegistry.get(tag);
    if (!NewCtor || !instances || instances.size === 0) return;

    // Swap the prototype on the *registered* class so new instances use updated code.
    // Existing instances also get the new prototype.
    const registered = customElements.get(tag);
    if (registered) {
        Object.setPrototypeOf(registered.prototype, Object.getPrototypeOf(NewCtor.prototype));
        // Copy new methods/properties onto the registered prototype
        const newProto = NewCtor.prototype;
        for (const key of Object.getOwnPropertyNames(newProto)) {
            if (key === 'constructor') continue;
            const desc = Object.getOwnPropertyDescriptor(newProto, key);
            if (desc) Object.defineProperty(registered.prototype, key, desc);
        }
        // Copy static properties (attrs, formAssociated)
        for (const key of Object.getOwnPropertyNames(NewCtor)) {
            if (['prototype', 'length', 'name'].includes(key)) continue;
            const desc = Object.getOwnPropertyDescriptor(NewCtor, key);
            if (desc) Object.defineProperty(registered, key, desc);
        }
    }
}

/**
 * HMR: re-render all live instances of a tag.
 * Clears the DOM, runs body() again, restores state.
 */
/** Structural view of the PdxElement internals HMR needs to reset (they are
 *  private on the class, so accessed via this interface rather than `any`). */
interface HmrInternals {
    _renderTarget?: Node;
    _mounted: boolean;
    _mountCallbacks: unknown[];
    _destroyCallbacks: unknown[];
    _updatedCallbacks: unknown[];
    _errorCallbacks: unknown[];
    _showCallbacks: unknown[];
    _hideCallbacks: unknown[];
    _propsChangeCallbacks: unknown[];
    _beforeLeaveCallbacks: unknown[];
    _routeChangeCallbacks: unknown[];
    _disposers?: Array<() => void>;
}

/**
 * INTERNAL. Re-render every live instance of a tag after a hot update.
 *
 * The Vite plugin emits a call to this; a custom element cannot be redefined, so HMR re-runs the
 * body of the instances already in the page instead. The `__pdx_` prefix marks it as machinery — it
 * is exported because generated code has to reach it, not because an application should call it.
 */
export function __pdx_hmr_rerender(tag: string): void {
    const instances = instanceRegistry.get(tag);
    if (!instances || instances.size === 0) return;

    for (const el of instances) {
        const inst = el as unknown as HmrInternals;
        // Clear rendered content
        const target = inst._renderTarget ?? el;
        while (target.firstChild) target.removeChild(target.firstChild);

        // Reset mounted flag to force re-render path
        inst._mounted = false;
        // Clear lifecycle callback queues (will be re-populated by setup)
        inst._mountCallbacks = [];
        inst._destroyCallbacks = [];
        inst._updatedCallbacks = [];
        inst._errorCallbacks = [];
        inst._showCallbacks = [];
        inst._hideCallbacks = [];
        inst._propsChangeCallbacks = [];
        inst._beforeLeaveCallbacks = [];
        inst._routeChangeCallbacks = [];

        // Dispose old effects
        const disposers = inst._disposers;
        if (disposers) {
            for (const d of disposers) d();
            inst._disposers = [];
        }

        // Trigger connectedCallback which will call body() again
        el.connectedCallback();
    }
}
