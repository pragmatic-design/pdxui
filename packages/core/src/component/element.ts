// PdxElement — base class for Pragmatic Web Components.
// Light DOM rendering (no Shadow DOM) so CSS tokens pass through.

import { signal, effect, collectDisposers, pushErrorOwner, popErrorOwner, getTopErrorHandler } from '../reactivity/signal';
import type { Signal, Dispose } from '../utils/types';
import type { EffectOptions } from '../reactivity/signal';
import { registerComponent, unregisterComponent, emitDevTools } from '../debug/inspector';
import { trackInstance, untrackInstance } from './define';
import { isPartNode } from '../renderer/part-nodes';
import { componentLabel, componentFile } from './global-error';
import { devInstanceId, devRecordError } from '../debug/devtools-api';
import { DEV } from '../utils/env';

/** Options of `emit()`. */
export interface EmitOptions {
    /** Default true. False keeps the event on the component: its ancestors do not see it. */
    bubbles?: boolean;
    /**
     * Default false. True lets a listener `preventDefault()` it, and `emit` then answers false: the
     * component leaves the default to the listener — a nav menu's link, which an app under the
     * router navigates itself.
     */
    cancelable?: boolean;
}

// Importable without a DOM, which is not the same as rendering without one. In Node (a build tool,
// a test, static generation) `HTMLElement` is undefined and `class extends HTMLElement` would throw
// AT IMPORT TIME, making the whole bundle unimportable. Fall back to an empty stub: it is never
// instantiated there, because `define()` registers nothing without a custom element registry, so
// the class definition just needs *a* constructor to extend. tests/node-import.test.ts imports core,
// a compiled component and a library component in plain Node.
const HTMLElementBase: typeof HTMLElement = (typeof HTMLElement !== 'undefined'
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement));

/** Every <slot> in a rendered template, the root included. */
function slotsIn(content: Node | null): Element[] {
    if (!content) return [];
    const out: Element[] = [];
    if (content instanceof Element && content.localName === 'slot') out.push(content);
    if (content instanceof Element || content instanceof DocumentFragment) {
        out.push(...Array.from(content.querySelectorAll('slot')));
    }
    return out;
}

/** Base class for PDX UI Web Components. */
export abstract class PdxElement extends HTMLElementBase {
    /** Override to declare observed attributes that auto-map to signals. */
    static attrs: string[] = [];
    /** Maps an observed attribute (lowercase or kebab) → the signal's canonical key. See component(). */
    static attrCanonical?: Map<string, string>;
    /** The `.pdx` this component was compiled from — development builds only. See component(). */
    static file?: string;

    // --- Form-Associated Custom Elements (ElementInternals) ---

    /** ElementInternals instance (only for form-associated components). */
    protected _internals: ElementInternals | null = null;

    /** Set the form value for this component (if form-associated). */
    setFormValue(value: FormData | string | File | null, state?: string | File | FormData | null): void {
        this._internals?.setFormValue(value, state ?? undefined);
    }

    /** Set the form validity for this component (if form-associated). */
    setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void {
        if (!this._internals) return;
        if (!flags || Object.keys(flags).length === 0) {
            this._internals.setValidity({});
        } else {
            this._internals.setValidity(flags, message, anchor);
        }
    }

    /** Get the form this component belongs to. */
    get form(): HTMLFormElement | null { return this._internals?.form ?? null; }

    /**
     * A component may declare a `form` PROP — pdx-form's whole API is one. Its accessor is installed
     * when it connects; before that, this getter alone would make `el.form = x` throw ("only a
     * getter"), which is what `<pdx-form :form>` does wherever the element is upgraded before it is
     * bound. The value is kept as an own property, which the prop accessor picks up when installed.
     */
    set form(value: unknown) {
        Object.defineProperty(this, 'form', { value, writable: true, configurable: true, enumerable: true });
    }

    /** Get the validation message. */
    get validationMessage(): string { return this._internals?.validationMessage ?? ''; }

    /** Get the validity state. */
    get validity(): ValidityState { return this._internals?.validity ?? ({} as ValidityState); }

    /** Check validity (triggers browser UI). */
    checkValidity(): boolean { return this._internals?.checkValidity() ?? true; }

    /** Report validity (shows browser validation bubble). */
    reportValidity(): boolean { return this._internals?.reportValidity() ?? true; }

    /** Called when the parent form resets. Override to handle reset. */
    formResetCallback(): void {
        // Subclass can override to reset internal state
    }

    /** Called when form state is restored (back/forward navigation). */
    formStateRestoreCallback(_state: string | File | FormData | null, _mode: 'restore' | 'autocomplete'): void {
        // Subclass can override to restore state
    }

    /** Attribute-backed signals, keyed by attribute name. */
    private _attrSignals = new Map<string, Signal<string | null>>();

    /** Effect disposers for cleanup on disconnect. */
    private _disposers: Dispose[] = [];

    /** Whether the component has been connected and rendered. */
    private _mounted = false;

    /** Keep-alive flag — when true, disconnectedCallback skips cleanup (freeze, not destroy). */
    _keepAlive = false;

    /** Set by {@link moveMounted} while a DOM move takes this element out and puts it back. */
    _moving = false;

    /** True once the pdx-route-change listener is attached (bound once per element). */
    private _routeListenerBound = false;

    /** Lifecycle callback queues — populated by composable hooks during setup. */
    _mountCallbacks: (() => void)[] = [];
    _destroyCallbacks: (() => void)[] = [];
    _updatedCallbacks: (() => void)[] = [];
    _errorCallbacks: ((err: unknown) => void)[] = [];
    _showCallbacks: (() => void)[] = [];
    _hideCallbacks: (() => void)[] = [];
    _propsChangeCallbacks: ((changes: { name: string; oldValue: unknown; newValue: unknown }[]) => void)[] = [];
    _beforeLeaveCallbacks: (() => boolean | 'destroy' | Promise<boolean>)[] = [];
    _routeChangeCallbacks: ((params: Record<string, string>) => void)[] = [];

    /** Scoped slot functions provided by parent via <template #name="scope">. */
    _slotFunctions: Record<string, (scope: Record<string, unknown>) => Node | DocumentFragment> = {};

    /** The <slot> elements this component's own template rendered — the only ones it projects into. */
    private _ownSlots: Element[] = [];

    constructor() {
        super();
        // Create signals for declared attributes. Alias attributes (aria-label, say)
        // share the CANONICAL signal (arialabel, say) that the prop reads: a single
        // source of truth, initialized from whichever form is present in the markup.
        const ctor = this.constructor as typeof PdxElement;
        const canonicalMap = ctor.attrCanonical;
        for (const attr of ctor.attrs) {
            const canonical = canonicalMap?.get(attr) ?? attr;
            if (!this._attrSignals.has(canonical)) {
                this._attrSignals.set(canonical, signal<string | null>(null));
            }
            const v = this.getAttribute(attr);
            if (v != null) this._attrSignals.get(canonical)!.set(v);
        }
    }

    /** Returns the attribute signal for reactive attribute reading. */
    attr(name: string): Signal<string | null> {
        let sig = this._attrSignals.get(name);
        if (!sig) {
            sig = signal<string | null>(this.getAttribute(name));
            this._attrSignals.set(name, sig);
        }
        return sig;
    }

    // --- Lifecycle ---

    /** Override in subclass for Shadow DOM support. Default: this (Light DOM). */
    get _renderTarget(): Node { return this; }

    connectedCallback(): void {
        // A connectedCallback can arrive after the element has left the document. The case that
        // happens here: a parent removes its light-DOM children to project them, the removal is a
        // CEReactions operation, and it flushes the child's reaction still queued from the insertion —
        // so the child would mount DETACHED, before its parent's setup, outside the template (and any
        // error boundary) it is about to be projected into. Mounting waits for the real connection,
        // which the projection delivers. happy-dom connects children before parents and
        // never shows this; Chromium does.
        if (!this.isConnected) return;
        if (!this._mounted) {
            // First mount: render component
            this._mounted = true;
            // The id `__PDX_DEVTOOLS__.tree()` and `inspect()` know this instance by.
            if (DEV) devInstanceId(this);
            this._projectedChildren = Array.from(this.childNodes);
            this._lightChildren = this._projectedChildren.slice();
            const target = this._renderTarget;
            // Light DOM: remove children for slot projection.
            // Mark ALL descendant PdxElements as keepAlive to prevent their
            // disconnectedCallback from destroying them during the move.
            if (target === this) {
                const descendants = this.querySelectorAll('*');
                for (let i = 0; i < descendants.length; i++) {
                    if (descendants[i] instanceof PdxElement) {
                        (descendants[i] as PdxElement)._keepAlive = true;
                    }
                }
                while (this.firstChild) this.removeChild(this.firstChild);
                for (let i = 0; i < descendants.length; i++) {
                    if (descendants[i] instanceof PdxElement) {
                        (descendants[i] as PdxElement)._keepAlive = false;
                    }
                }
            }
            // Effects created while mounting report their errors to the boundary that encloses
            // this element in the DOM — the one whose content this is, which popped its own
            // handler before we connected.
            pushErrorOwner(this);
            // A setup or render that throws inside an error boundary goes to that boundary.
            // An exception leaving connectedCallback is REPORTED by the browser, not
            // rethrown to the code that inserted the element, so the boundary's own try would never
            // see it and its fallback would never render. Resolved while we are still the error owner and
            // still in the DOM; called after, below.
            let failed: { error: unknown; boundary: (err: unknown) => void } | null = null;
            try {
                // Collect the template's binding effects (html``, when/each/match)
                // so they are disposed on disconnect — they are NOT created via
                // this.track(), so without this they would leak on unmount.
                const [rendered, disposeBody] = collectDisposers(() => {
                    try {
                        return { content: this.body() };
                    } catch (error) {
                        return { content: null, error, threw: true };
                    }
                });
                if ('threw' in rendered) {
                    // Effects the template created before it threw belong to a render that is not going
                    // on screen.
                    disposeBody();
                    if (DEV) devRecordError(rendered.error, 'render', this.localName, componentFile(this.localName));
                    const boundary = getTopErrorHandler();
                    if (!boundary) {
                        // The browser reports it as a bare `Uncaught Error`, which says nothing about
                        // where: name the component and its file first, then let it go.
                        if (DEV) console.error(`[pdx] Unhandled error in setup/render of ${componentLabel(this.localName)}:`, rendered.error);
                        throw rendered.error;
                    }
                    failed = { error: rendered.error, boundary };
                    return;
                }
                const content = rendered.content;
                this._disposers.push(disposeBody);
                // The slots this template rendered — taken NOW, while the content is detached and
                // no child component has rendered its own <slot> into it.
                this._ownSlots = slotsIn(content);
                if (content) {
                    target.appendChild(content);
                }
                this._projectSlots();
                this._watchLateSlots();

                trackInstance(this.tagName.toLowerCase(), this);
                registerComponent(this);
                emitDevTools('component:mount', { tag: this.tagName.toLowerCase(), id: DEV ? devInstanceId(this) : undefined });
                this.connected();
                for (const fn of this._mountCallbacks) fn();
            } finally {
                popErrorOwner();
                // After the pop: the boundary renders its fallback now, and effects created there must
                // not take this failed element — about to be removed — as their error owner.
                if (failed) failed.boundary(failed.error);
            }

            // Listen for route param changes (same page, different params).
            // Bound ONCE per element: without the guard, every destroy→remount cycle
            // would pile up one more listener and the callbacks would run N times.
            if (!this._routeListenerBound) {
                this._routeListenerBound = true;
                this.addEventListener('pdx-route-change', ((e: CustomEvent) => {
                    for (const fn of this._routeChangeCallbacks) fn(e.detail);
                }) as EventListener);
            }
        } else if (this._keepAlive) {
            // Resume from freeze: DOM is intact, effects will re-track on signal read.
            // Signal reads in effects/computeds auto-reconcile with current store state.
            emitDevTools('component:show', { tag: this.tagName.toLowerCase(), id: DEV ? devInstanceId(this) : undefined });
            for (const fn of this._showCallbacks) fn();
        }
    }

    disconnectedCallback(): void {
        // Taken out to be put straight back (moveMounted): nothing ends, and the connect that follows
        // finds the element still mounted, so it does nothing either.
        if (this._moving) return;
        if (this._keepAlive) {
            // Freeze mode: skip cleanup, just notify onHide
            for (const fn of this._hideCallbacks) fn();
            emitDevTools('component:hide', { tag: this.tagName.toLowerCase(), id: DEV ? devInstanceId(this) : undefined });
            return;
        }

        // Destroy mode: full cleanup
        this._mountGeneration++;
        for (const fn of this._destroyCallbacks) fn();
        this.disconnected();
        untrackInstance(this.tagName.toLowerCase(), this);
        unregisterComponent(this);
        emitDevTools('component:unmount', { tag: this.tagName.toLowerCase(), id: DEV ? devInstanceId(this) : undefined });
        for (const d of this._disposers) d();
        this._disposers = [];

        // Reset so a re-append re-mounts (re-renders) instead of staying dead.
        // Lifecycle callback queues are repopulated by the next body()/setup run,
        // so clear them here to avoid stale/duplicate callbacks.
        this._mounted = false;
        this._mountCallbacks = [];
        this._destroyCallbacks = [];
        this._updatedCallbacks = [];
        this._errorCallbacks = [];
        this._showCallbacks = [];
        this._hideCallbacks = [];
        this._propsChangeCallbacks = [];
        this._beforeLeaveCallbacks = [];
        this._routeChangeCallbacks = [];
        this._restoreLightChildren();
    }

    /**
     * Take the author's children back out of the render, and empty the element: it holds what it was
     * written with again, so the next connect mounts from that.
     *
     * A move by application code — a sortable list, a portal, a wrapper — is a disconnect and a
     * connect. The disconnect destroys the component; were its render left in the element, the
     * connect would take that render for light-DOM children and project it into the new <slot>:
     * pdx-toggle would hold a button inside a button. Children the application removed in the
     * meantime are not brought back.
     */
    private _restoreLightChildren(): void {
        if (this._renderTarget !== this) return;
        const kept = this._lightChildren.filter(n => n !== this && this.contains(n));
        this._lightChildren = [];
        for (const n of kept) n.parentNode?.removeChild(n);
        while (this.firstChild) this.removeChild(this.firstChild);
        for (const n of kept) this.appendChild(n);
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        const ctor = this.constructor as typeof PdxElement;
        const canonical = ctor.attrCanonical?.get(name) ?? name;
        const sig = this._attrSignals.get(canonical);
        if (sig) sig.set(value);
    }

    static get observedAttributes(): string[] {
        return (this as unknown as typeof PdxElement).attrs;
    }

    // --- Protected API ---

    /** Override to return the component's DOM template. Called once on first connect. */
    body(): DocumentFragment | Node | null {
        return null;
    }

    /** Called after first render. Override for post-mount logic. */
    connected(): void {}

    /** Called on disconnect. Override for cleanup. Effects are auto-disposed. */
    disconnected(): void {}

    /**
     * Dispatch a custom event with optional detail payload. It bubbles unless `bubbles: false`: an
     * event that describes the component's own popup state (pdx-open, pdx-close, pdx-toggle) stays
     * on it, like the native close of <dialog> — bubbling, a select's close would close the dialog
     * around it. `composed` follows `bubbles`.
     *
     * Answers what `dispatchEvent` answers: false when the event was `cancelable` and a listener
     * prevented it.
     */
    emit(event: string, detail?: unknown, options?: EmitOptions): boolean {
        const bubbles = options?.bubbles ?? true;
        return this.dispatchEvent(new CustomEvent(event, {
            detail,
            bubbles,
            composed: bubbles,
            cancelable: options?.cancelable ?? false,
        }));
    }

    /** Bumped by every destroying disconnect: a frame scheduled by an earlier mount checks it. */
    private _mountGeneration = 0;

    /**
     * Run `fn` in the next animation frame, only if the mount that scheduled it is still alive.
     *
     * Many components build their DOM in a frame after the first render. A setup destroyed before
     * its frame — a component moved by app code in the task that mounted it — would otherwise still
     * run that frame, and build into the element next to the new mount's build: pdx-list with its
     * rows twice.
     */
    frame(fn: () => void): void {
        const generation = this._mountGeneration;
        requestAnimationFrame(() => {
            if (generation === this._mountGeneration) fn();
        });
    }

    /** Track an effect for auto-disposal on disconnect. */
    protected track(fn: () => void | (() => void), options?: EffectOptions): Dispose {
        // Also after mount (from onMount, a timer, a rAF): the effect is this component's.
        pushErrorOwner(this);
        let dispose: Dispose;
        try { dispose = effect(fn, options); } finally { popErrorOwner(); }
        this._disposers.push(dispose);
        return dispose;
    }

    // --- Slot Projection (Light DOM) ---

    /** Children captured before render, for slot projection. */
    private _projectedChildren: Node[] = [];

    /**
     * The author's light-DOM children, kept past the projection (which clears `_projectedChildren`):
     * the ones captured at mount and the ones placed into a slot later. A destroying disconnect puts
     * them back as the element's children.
     */
    private _lightChildren: Node[] = [];

    /** Replace <slot> placeholders with projected children.
     *  Also extracts scoped slot functions from children with __pdxSlot property. */
    private _projectSlots(): void {
        if (this._projectedChildren.length === 0) return;

        // Extract scoped slot functions (set by compiled parent code)
        for (const child of this._projectedChildren) {
            const carrier = child as { __pdxSlot?: (scope: Record<string, unknown>) => Node | DocumentFragment; __pdxSlotName?: string };
            if (child instanceof Element && carrier.__pdxSlot) {
                const name = carrier.__pdxSlotName as string;
                this._slotFunctions[name] = carrier.__pdxSlot;
                // Don't project this element — it's a slot function carrier
            }
        }

        // Only the slots OUR template rendered (captured from body() before it was inserted — see
        // connectedCallback). `querySelectorAll` does not stop at component boundaries: an empty
        // <pdx-alert-dialog> in this template keeps its own <slot>, and this component's children
        // would be projected into it — the dialog would hold a copy of the screen hosting it.
        // "No component between the slot and the host" is not the test either: a slot this template
        // passes into a child (`<inner><slot></slot></inner>`) is ours and sits inside `inner`.
        const slots = this._ownSlots.filter(s => this.contains(s));
        if (slots.length === 0) { this._disposeUnprojected(); return; }

        // Group projected children by slot name (exclude slot function carriers)
        const named = new Map<string, Node[]>();
        const defaultNodes: Node[] = [];

        for (const child of this._projectedChildren) {
            if (child instanceof Element && (child as { __pdxSlot?: unknown }).__pdxSlot) continue;
            const slotName = child instanceof Element ? child.getAttribute('slot') : null;
            if (slotName) {
                if (!named.has(slotName)) named.set(slotName, []);
                named.get(slotName)!.push(child);
            } else {
                defaultNodes.push(child);
            }
        }

        // Replace each <slot> with matching projected content
        for (const slot of Array.from(slots)) {
            const name = slot.getAttribute('name');
            const content = name ? named.get(name) : defaultNodes;

            if (content && content.length > 0) {
                const parent = slot.parentNode!;
                for (const n of content) parent.insertBefore(n, slot);
                parent.removeChild(slot);
            }
            // If no projected content, leave <slot> default content
        }

        this._disposeUnprojected();
    }

    /** The captured children that were NOT projected (a template with no <slot>, or a slot
     *  with no match) were frozen with _keepAlive during the capture: without a dispose
     *  they stay detached subtrees with live effects forever. It destroys the mounted
     *  PdxElements left orphaned and frees the capture list (retention). The slot function
     *  carriers stay alive: their closures are what renderSlot needs. */
    private _disposeUnprojected(): void {
        for (const child of this._projectedChildren) {
            if (!(child instanceof Element)) continue;
            if (child.isConnected) continue; // projected into the DOM → alive
            if ((child as { __pdxSlot?: unknown }).__pdxSlot) continue; // slot carrier
            const nodes: Element[] = [child, ...Array.from(child.querySelectorAll('*'))];
            for (const n of nodes) {
                if (n instanceof PdxElement && (n as unknown as { _mounted?: boolean })._mounted) {
                    n.disconnectedCallback();
                }
            }
        }
        this._projectedChildren = [];
    }

    /** Some frameworks (e.g. Angular, which bootstraps async via zone.js) append
     *  light-DOM children AFTER connectedCallback — i.e. after _projectSlots already
     *  ran with no children, leaving empty <slot>s. Observe the host and relocate any
     *  late-added direct child into its matching EMPTY slot. No-op when every slot is
     *  already filled (the common case: children present at connect → slots removed). */
    /** True when `node` is rendered by THIS component — no other custom element sits between it
     *  and the host. Slot lookups must not cross a component boundary: a nested component's
     *  <slot> belongs to that component, and filling it from out here steals its children. */
    private _ownsNode(node: Node): boolean {
        let p = node.parentNode;
        while (p && p !== this) {
            if (p instanceof Element && p.tagName.includes('-')) return false;
            p = p.parentNode;
        }
        return p === this;
    }

    private _watchLateSlots(): void {
        // Only OUR slots. `querySelectorAll` does not stop at component boundaries, so a nested
        // component's own empty <slot> would arm this observer on the outer host and then attract
        // its children — the outer component filling a slot it does not own.
        const ownSlots = (): Element[] => Array.from(this.querySelectorAll('slot'))
            .filter(s => this._ownsNode(s));
        const hasEmpty = ownSlots().some(s => s.childNodes.length === 0);
        if (!hasEmpty) return;
        const relocate = (node: Node): void => {
            const slotName = node instanceof Element ? node.getAttribute('slot') : null;
            const mine = ownSlots();
            const slot = (slotName
                ? mine.find(s => s.getAttribute('name') === slotName)
                : mine.find(s => !s.hasAttribute('name')) ?? mine[0]) ?? null;
            if (!slot || !slot.parentNode || slot.childNodes.length !== 0) return;
            // A node can never be inserted before a slot it CONTAINS — `insertBefore(ancestor,
            // descendant)` throws HierarchyRequestError, uncaught, from inside the observer. The
            // own-slot filter above already rules this out for nested components, but the
            // invariant is worth stating where the insertion happens: it holds for any shape.
            if (node.contains(slot)) return;
            // Already where it belongs → do NOTHING. Moving a node that is already before
            // its slot is a no-op for the DOM but still emits a childList record, which
            // brings us straight back here: infinite relocation, starved microtask queue,
            // frozen page. It only bites when the slot is a DIRECT child of the host (then
            // the relocated node keeps `parentNode === this` and stays in scope) — which is
            // the shape of any component whose render is just `<slot></slot>` and that
            // appends its own UI onto the host, e.g. pdx-rich-text's toolbar + editor.
            // The same-parent test is not redundant: `compareDocumentPosition` on a node in a
            // different tree returns DISCONNECTED plus an ARBITRARY (but self-consistent)
            // PRECEDING/FOLLOWING, so position alone could skip a relocation that must happen.
            // Same parent ⇒ same tree ⇒ the ordering bit is meaningful.
            if (node.parentNode === slot.parentNode
                && (slot.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING)) return;
            // Insert BEFORE the slot (not inside) — keeps default content out, allows multiple.
            slot.parentNode.insertBefore(node, slot);
            if (!this._lightChildren.includes(node)) this._lightChildren.push(node);
        };
        const obs = new MutationObserver((records) => {
            for (const r of records) {
                for (const node of Array.from(r.addedNodes)) {
                    // A node a template part placed — this component's own redraw, most often — is
                    // where its template wants it: only foreign late children go to the slot. Moving
                    // a redraw into a hidden slot, with a redraw following it, freezes the page.
                    if (node.parentNode === this && !isPartNode(node)) relocate(node);
                }
            }
        });
        obs.observe(this, { childList: true });
        this._disposers.push(() => obs.disconnect());
    }
}

/**
 * Run `move` — DOM operations that take `root` (or its subtree) out of the document and put it back,
 * such as wrapping a container or moving children into a viewport — without unmounting the
 * components in it.
 *
 * A move is a disconnect and a connect, and a PdxElement treats a disconnect as its end: it disposes
 * its effects and its state, and the connect sets it up again from its light-DOM children. A plain
 * move renders once; this is the cheap path that skips the teardown and the second
 * setup, so what the user typed, scrolled or opened stays. The components under `root` ignore the
 * disconnect for the length of `move`, and stay as they were. `move` must put the
 * subtree back in the document before it returns.
 */
export function moveMounted(root: Node, move: () => void): void {
    const moving: PdxElement[] = [];
    if (root instanceof PdxElement) moving.push(root);
    if (root instanceof Element || root instanceof DocumentFragment) {
        const all = root.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) {
            if (all[i] instanceof PdxElement) moving.push(all[i] as PdxElement);
        }
    }
    for (const el of moving) el._moving = true;
    try {
        move();
    } finally {
        for (const el of moving) el._moving = false;
    }
}
