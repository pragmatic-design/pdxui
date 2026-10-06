// Function-based component definition.
// Convenience API over PdxElement for simpler components.

import { signal, getTopErrorHandler } from '../reactivity/signal';
import type { Signal } from '../utils/types';
import type { EffectOptions } from '../reactivity/signal';
import { PdxElement } from './element';
import type { EmitOptions } from './element';
import { define } from './define';
import { pushScope, popScope } from './lifecycle';
import { exposeOnElement } from './channel';
import { componentLabel, componentFile } from './global-error';
import { devSetupBegin, devSetupEnd, devRecordError } from '../debug/devtools-api';
import { DEV } from '../utils/env';
import { renderSlot } from '../renderer/slot';
import { html } from '../renderer/template';
import type { ComponentScope } from './lifecycle';
import type { Dispose } from '../utils/types';

// ─── HMR State Map ──────────────────────────────────────────────────
// Keyed by tag name → array of saved signal states (one per DOM instance)
const hmrStateMap = new Map<string, Map<string, unknown>[]>();

/** Save HMR state for all instances of a given tag. */
export function __pdx_hmr_save(tag: string): void {
    const instances = document.querySelectorAll(tag);
    const states: Map<string, unknown>[] = [];
    for (const el of instances) {
        const state = (el as { __pdx_saveState?: () => Map<string, unknown> }).__pdx_saveState?.();
        if (state) states.push(state);
    }
    if (states.length > 0) hmrStateMap.set(tag, states);
}

/** Restore HMR state for newly created instances of a given tag. */
export function __pdx_hmr_restore(tag: string): void {
    const states = hmrStateMap.get(tag);
    if (!states || states.length === 0) return;
    // Defer to next microtask so instances have time to mount
    queueMicrotask(() => {
        const instances = document.querySelectorAll(tag);
        for (let i = 0; i < Math.min(instances.length, states.length); i++) {
            (instances[i] as { __pdx_restoreState?: (s: Map<string, unknown>) => void }).__pdx_restoreState?.(states[i]);
        }
        hmrStateMap.delete(tag);
    });
}

// ─── Types ─────────────────────────────────────────────────────────

type PropType = typeof String | typeof Number | typeof Boolean | typeof Object | typeof Array | typeof Function;

export interface PropDefinition {
    type: PropType;
    default?: unknown;
}

/**
 * Typed prop definition for non-primitive types (Object, Array, Function).
 * Use when you need precise TS inference instead of the default collapsed types.
 *
 * @example
 *   props: {
 *     items: { type: Array, default: null } as TypedProp<CarouselItem[] | null>,
 *     onRender: { type: Function, default: null } as TypedProp<((item: any) => string) | null>,
 *   }
 */
export interface TypedProp<T> extends PropDefinition {
    readonly __brand?: T;
}

/** Map PropType constructor to its JS type. */
type PropTypeToJS<T extends PropType> =
    T extends typeof String ? string :
    T extends typeof Number ? number :
    T extends typeof Boolean ? boolean :
    T extends typeof Array ? unknown[] :
    T extends typeof Object ? Record<string, unknown> :
    T extends typeof Function ? (...args: unknown[]) => unknown :
    unknown;

/** Infer the TS type from a prop definition — uses TypedProp brand if present, else PropTypeToJS. */
type InferPropType<D extends PropDefinition> =
    D extends TypedProp<infer T> ? T : PropTypeToJS<D['type']>;

/** Infer Signal accessors from a props definition record. */
type PropSignals<P extends Record<string, PropDefinition>> = {
    [K in keyof P]: Signal<InferPropType<P[K]>>;
};

/**
 * Base context — framework methods only, fully typed. No index signature.
 * Use this when writing typed handwritten components with known props.
 */
export interface ComponentContextBase {
    /** The host element. */
    el: HTMLElement;
    /** Dispatch a custom event. It bubbles unless `{ bubbles: false }`. */
    /** False when the event was `cancelable` and a listener prevented it. */
    emit(event: string, detail?: unknown, options?: EmitOptions): boolean;
    /** Set form value (form-associated components only). */
    setFormValue?(value: FormData | string | File | null): void;
    /** Set form validity (form-associated components only). */
    setValidity?(flags: ValidityStateFlags, message?: string): void;
    /** Track an effect for auto-disposal on disconnect. `options.name` names it for the inspector. */
    track(fn: () => void | (() => void), options?: EffectOptions): Dispose;
    /**
     * Run `fn` in the next animation frame, only if this mount is still alive then. Use it instead of
     * `requestAnimationFrame` to build DOM after the first render: a frame scheduled by a setup that
     * a move destroyed does not build into the element again.
     */
    frame(fn: () => void): void;
    /** Expose methods/signals on the host element for parent access via ref.
     *  Read-only from the outside (no direct reassignment); configurable for the re-expose on reconnect. */
    expose(api: Record<string, unknown>): void;
    /** Render a named slot with optional scope data. Falls back to defaultFn if no parent slot. */
    slot(name: string, scope?: Record<string, unknown>, defaultFn?: () => Node | DocumentFragment): DocumentFragment;
}

/** Typed component context — provides autocomplete for declared props. */
export type TypedComponentContext<P extends Record<string, PropDefinition>> =
    ComponentContextBase & PropSignals<P>;

/**
 * Untyped component context — legacy compat for components without explicit prop typing.
 * Allows `ctx.anyProp` without TS error. Prefer TypedComponentContext<P> for new code.
 */
export type ComponentContext = ComponentContextBase & Record<string, unknown>;

export interface ComponentOptions<P extends Record<string, PropDefinition> = Record<string, PropDefinition>> {
    props?: P;
    /** Use Shadow DOM instead of Light DOM. Default: false (Light DOM). */
    shadow?: boolean;
    /** Mark component as fully static (no reactive bindings). Production optimization. */
    static?: boolean;
    /** Make this a form-associated custom element. Enables ElementInternals. */
    formAssociated?: boolean;
    /**
     * The `.pdx` this component was compiled from, relative to the app root. The compiler passes it
     * in development builds only, and an unhandled runtime error names it.
     */
    file?: string;
    setup?: (ctx: TypedComponentContext<P>) => Record<string, unknown> | void;
    render: (ctx: TypedComponentContext<P>) => DocumentFragment | Node;
}

/** Options with typed setup return — render ctx includes both props and setup exports. */
export interface ComponentOptionsWithSetup<
    P extends Record<string, PropDefinition>,
    S extends Record<string, unknown>
> {
    props?: P;
    shadow?: boolean;
    static?: boolean;
    formAssociated?: boolean;
    /** See {@link ComponentOptions.file}. */
    file?: string;
    setup: (ctx: TypedComponentContext<P>) => S;
    render: (ctx: TypedComponentContext<P> & S) => DocumentFragment | Node;
}

// ─── component() ───────────────────────────────────────────────────

/**
 * Define a function-based Web Component.
 *
 * Usage:
 *   component('pdx-counter', {
 *     props: {
 *       initial: { type: Number, default: 0 },
 *     },
 *     setup(ctx) {
 *       const count = signal((ctx.initial as Signal<number>)());
 *       return { count, increment: () => count.set(v => v + 1) };
 *     },
 *     render: (ctx) => html`
 *       <span>${ctx.count}</span>
 *       <button @click=${ctx.increment}>+</button>
 *     `,
 *   });
 */
/** Overload: setup returns a typed record → render ctx merges props + setup exports. */
export function component<P extends Record<string, PropDefinition>, S extends Record<string, unknown>>(
    tag: string, options: ComponentOptionsWithSetup<P, S>): void;
/** Overload: no setup or setup returns void → render ctx has only props. */
export function component<P extends Record<string, PropDefinition>>(
    tag: string, options: ComponentOptions<P>): void;
export function component<P extends Record<string, PropDefinition>>(tag: string, options: ComponentOptions<P>): void {
    const propDefs = (options.props ?? {}) as Record<string, PropDefinition>;
    const propNames = Object.keys(propDefs);

    // Track setup signals per-component for HMR state save/restore
    const _setupSignalRegistry = new WeakMap<HTMLElement, Map<string, Signal<unknown>>>();

    const useShadow = options.shadow ?? false;
    const useFormAssociated = options.formAssociated ?? false;
    // _skipAttrSync removed — attribute→prop sync must be identical in dev and prod

    // Object/Array/Function props are property-only (not attributes).
    // Attributes only support strings — complex types must use JS property setters.
    const PROP_ONLY_TYPES: Set<PropType> = new Set([Object, Array, Function]);
    // Global attributes the browser acts on. A prop with one of these names reads the attribute and
    // takes it off the host: left there, `title` would be a native tooltip over the whole component,
    // and `hidden`, `lang` and `dir` would hide it or change its language or direction.
    const HOST_STRIPPED_ATTRS = new Set(['title', 'hidden', 'lang', 'dir']);
    const attrPropNames = propNames.filter(n => !PROP_ONLY_TYPES.has(propDefs[n].type));
    // HTML lowercases all attributes — map camelCase prop names to lowercase for observedAttributes.
    // We also observe the KEBAB form (ariaLabel → aria-label, say) as an ALIAS of the same prop,
    // so the standard hyphenated attributes (aria-*, data-*, max-length, ...) keep the prop in
    // sync. Backwards compatible: the lowercase form without a hyphen keeps working.
    const attrToPropsMap = new Map<string, string>();   // chiave canonica (lowercase) → prop
    const attrCanonical = new Map<string, string>();    // every observed attr (kebab included) → the canonical one
    for (const name of attrPropNames) {
        const lower = name.toLowerCase();
        attrToPropsMap.set(lower, name);
        attrCanonical.set(lower, lower);
        const kebab = name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
        if (kebab !== lower) attrCanonical.set(kebab, lower);
    }
    const attrNames = Array.from(attrCanonical.keys());
    // An Array/Object prop is not observed, so no alias carries its kebab form: its initial value is
    // read from `foo-bar` when `foobar` is absent, so `group-by='[…]'` is not dropped in silence.
    const jsonPropKebab = new Map<string, string>();
    for (const name of propNames) {
        const type = propDefs[name].type;
        if (type !== Array && type !== Object) continue;
        const kebab = name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
        if (kebab !== name.toLowerCase()) jsonPropKebab.set(name, kebab);
    }

    class Comp extends PdxElement {
        static attrs = attrNames;
        static attrCanonical = attrCanonical;
        static formAssociated = useFormAssociated;
        static file = options.file;

        constructor() {
            super();
            // Form-associated: attach internals for native form participation
            if (useFormAssociated && typeof this.attachInternals === 'function') {
                this._internals = this.attachInternals();
            }
        }

        connectedCallback(): void {
            if (useShadow && !this.shadowRoot) {
                this.attachShadow({ mode: 'open' });
            }
            super.connectedCallback();
        }

        get _renderTarget(): Node { return useShadow ? this.shadowRoot! : this; }

        /** Save all setup signal values for HMR state preservation. */
        __pdx_saveState(): Map<string, unknown> | null {
            const signals = _setupSignalRegistry.get(this);
            if (!signals) return null;
            const state = new Map<string, unknown>();
            for (const [name, sig] of signals) {
                state.set(name, sig.peek());
            }
            return state;
        }

        /** Restore signal values from HMR-saved state. */
        __pdx_restoreState(state: Map<string, unknown>): void {
            const signals = _setupSignalRegistry.get(this);
            if (!signals || !state) return;
            for (const [name, value] of state) {
                const sig = signals.get(name);
                if (sig) sig.set(value as never);
            }
        }

        body(): DocumentFragment | Node | null {
            const slotFns = this._slotFunctions;
            const ctx: Record<string, unknown> = {
                el: this,
                emit: (event: string, detail?: unknown, options?: EmitOptions) => this.emit(event, detail, options),
                track: (fn: () => void | (() => void), options?: EffectOptions) => this.track(fn, options),
                frame: (fn: () => void) => this.frame(fn),
                expose: (api: Record<string, unknown>) => exposeOnElement(this, api),
                slot: (name: string, scope?: Record<string, unknown>, defaultFn?: () => Node | DocumentFragment) =>
                    renderSlot(slotFns, name, scope ? () => scope : null, defaultFn ?? (() => html``)),
                __slots: slotFns,
            };
            // Form-associated: expose form methods on context
            if (useFormAssociated && this._internals) {
                ctx.setFormValue = (v: FormData | string | File | null) => this.setFormValue(v);
                ctx.setValidity = (flags: ValidityStateFlags, msg?: string) => this.setValidity(flags, msg);
            }

            // Create typed prop signals with dual sync:
            //   1. HTML attribute changes (setAttribute) → prop signal
            //   2. JS property sets (el.prop = value) → prop signal
            // This ensures both patterns work:
            //   <pdx-stats total="6">                    → attribute
            //   <pdx-stats :total="store.stats().total"> → JS property via bindProperty
            for (const name of propNames) {
                const def = propDefs[name];
                // HTML lowercases attributes — read from lowercase key
                const attrSig = this.attr(name.toLowerCase());

                // Re-parent/reconnect: an earlier mount has already defined the accessor.
                // Attributes survive the move in the DOM, values set through a JS property
                // do not — without this carry-over `el.showActions = false` would go back to the default after
                // a drawer or dialog re-parented the content. The previous getter reads
                // the last propSig, so it returns the last known value.
                const existingDesc = Object.getOwnPropertyDescriptor(this, name);
                const carriedFromPrevMount = existingDesc?.get
                    ? { value: existingDesc.get.call(this) }
                    : null;

                const kebab = jsonPropKebab.get(name);
                const initialRaw = attrSig.peek() ?? (kebab ? this.getAttribute(kebab) : null);
                const initial = carriedFromPrevMount
                    ? carriedFromPrevMount.value
                    : initialRaw !== null
                        ? coerce(initialRaw, def)
                        : resolveDefault(def);
                const propSig = signal(initial);
                const isPropOnly = PROP_ONLY_TYPES.has(def.type);
                // A global attribute the browser acts on is read into the prop, then taken off the
                // host. `stripping` marks our own removal, which Sync 1 must not read as
                // the author's: removing an attribute resets a prop, or sets a Boolean to false.
                const strips = HOST_STRIPPED_ATTRS.has(name);
                let stripping = false;
                const strip = (): void => {
                    if (!this.hasAttribute(name)) return;
                    stripping = true;
                    this.removeAttribute(name);
                };

                // Sync 1: HTML attribute CHANGES → update prop signal.
                // We apply only the CHANGES (not the initial value, already in `initial`): the first
                // run must not clobber a value carried over from the previous mount.
                // Explicitly removing a Boolean attribute that is present → false, not the default:
                // its initial absence means "use the default", its removal is an action.
                if (!isPropOnly) {
                    let prevRaw = attrSig.peek();
                    this.track(() => {
                        const raw = attrSig();
                        if (raw === null && stripping) { stripping = false; prevRaw = null; return; }
                        if (raw === prevRaw) return; // no attribute change (the first run included)
                        const wasPresent = prevRaw !== null;
                        prevRaw = raw;
                        const val = raw !== null
                            ? coerce(raw, def)
                            : (wasPresent && def.type === Boolean
                                ? false
                                : resolveDefault(def));
                        const oldValue = propSig.peek();
                        propSig.set(val as never);
                        // Notify onPropsChange so setAttribute() and `el.prop=` are coherent.
                        // The peek/compare above prevents a redundant notification when the
                        // value did not actually change (and the JS setter handles its own path).
                        if (oldValue !== val && this._propsChangeCallbacks.length > 0) {
                            for (const fn of this._propsChangeCallbacks) {
                                fn([{ name, oldValue, newValue: val }]);
                            }
                        }
                        if (strips && raw !== null) strip();
                    });
                    // Read at mount — from the markup, or reflected by a property set before the
                    // accessor existed (a parent's `:title` binding) — and taken off now.
                    if (strips) strip();
                }

                // Sync 2: JS property setter → update prop signal directly
                // This is how :attr bindings from parent templates work.
                // IMPORTANT: capture any pre-upgrade property value set before CE upgraded
                const preUpgradeDesc = existingDesc;
                const hasPreUpgrade = preUpgradeDesc && 'value' in preUpgradeDesc;
                if (hasPreUpgrade) delete (this as unknown as Record<string, unknown>)[name]; // remove data property before defining accessor

                Object.defineProperty(this, name, {
                    get: () => propSig(),
                    set: (value: unknown) => {
                        const oldValue = propSig.peek();
                        const coerced = value !== null && value !== undefined
                            ? (typeof value === 'string' ? coerce(value, def) : value)
                            : resolveDefault(def);
                        // Use setRaw to avoid signal.set() treating functions as updaters
                        propSig.setRaw(coerced as never);
                        // Notify onPropsChange callbacks
                        if (oldValue !== coerced && this._propsChangeCallbacks.length > 0) {
                            for (const fn of this._propsChangeCallbacks) {
                                fn([{ name, oldValue, newValue: coerced }]);
                            }
                        }
                    },
                    configurable: true,
                });

                // Apply pre-upgrade value through the new setter
                if (hasPreUpgrade && preUpgradeDesc.value !== undefined) {
                    (this as unknown as Record<string, unknown>)[name] = preUpgradeDesc.value;
                }

                ctx[name] = propSig;
            }

            // Activate composable lifecycle scope during setup
            const scope: ComponentScope = {
                track: (fn) => this.track(fn),
                registerMount: (fn) => this._mountCallbacks.push(fn),
                registerDestroy: (fn) => this._destroyCallbacks.push(fn),
                registerUpdated: (fn) => this._updatedCallbacks.push(fn),
                registerError: (fn) => this._errorCallbacks.push(fn),
                registerShow: (fn) => this._showCallbacks.push(fn),
                registerHide: (fn) => this._hideCallbacks.push(fn),
                registerPropsChange: (fn) => this._propsChangeCallbacks.push(fn),
                registerBeforeLeave: (fn) => this._beforeLeaveCallbacks.push(fn),
                registerRouteChange: (fn) => this._routeChangeCallbacks.push(fn),
                element: this,
            };

            // The devtools' view of this instance: its props, and the named signals its setup is
            // about to create, which register against it.
            if (DEV) {
                const props: Record<string, { peek(): unknown }> = {};
                for (const name of propNames) props[name] = ctx[name] as { peek(): unknown };
                devSetupBegin(this, props);
            }
            pushScope(scope);
            try {
                if (options.setup) {
                    const result = options.setup(ctx as TypedComponentContext<P>);
                    if (result) Object.assign(ctx, result);
                }
                // Register signals for HMR save/restore
                const signalMap = new Map<string, Signal<unknown>>();
                for (const [key, value] of Object.entries(ctx)) {
                    if (value && typeof value === 'function' && typeof (value as { set?: unknown }).set === 'function' && typeof (value as { peek?: unknown }).peek === 'function') {
                        signalMap.set(key, value as Signal<unknown>);
                    }
                }
                if (signalMap.size > 0) _setupSignalRegistry.set(this, signalMap);
            } catch (err) {
                popScope();
                if (DEV) {
                    devSetupEnd();
                    devRecordError(err, 'setup', tag, componentFile(tag));
                }
                // Notify error callbacks if any
                for (const fn of this._errorCallbacks) fn(err);
                // Inside an error boundary, the boundary's fallback is what the author asked for:
                // hand the error up, and connectedCallback routes it there. The inline
                // span below is for a component with no boundary around it.
                if (getTopErrorHandler()) throw err;
                console.error(`[pdx] Component ${componentLabel(tag)} setup failed:`, err);
                const msg = document.createElement('span');
                msg.textContent = `Error in <${tag}>: ${err instanceof Error ? err.message : String(err)}`;
                msg.style.color = 'red';
                msg.style.fontSize = '0.8rem';
                return msg;
            }
            popScope();
            if (DEV) devSetupEnd();

            return options.render(ctx as TypedComponentContext<P>);
        }
    }

    define(tag, Comp as unknown as new () => PdxElement);
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Coerce a string attribute value to the target prop type. */
function coerce(value: unknown, def: { type: PropType; default?: unknown }): unknown {
    // Non-string values (set via JS property) — pass through for complex types
    if (typeof value !== 'string') return value;
    switch (def.type) {
        case Boolean: return value !== 'false' && value !== '0';
        // A blank string is not a number: it means "none given", and takes the declared default —
        // what the platform does with `maxlength=""`. Number('') is 0, which would hand a number nobody
        // entered to a field whose empty state is null (pdx-number-input).
        case Number:  return value.trim() === '' ? resolveDefault(def) : Number(value);
        case Object:
        case Array:   try { return JSON.parse(value); } catch { return value; }
        case Function: return value; // Functions can't come from attributes
        case String:
        default:      return value;
    }
}

/**
 * The default a prop falls back to when no attribute carries a value.
 *
 * DECLARED, not truthy. `def.default ?? typeDefault(def.type)` would not do: `??` cannot tell an
 * author who wrote `default: null` from one who wrote no default at all, so a declared null would
 * arrive as 0, `''`, `false` or `[]`. null is a legitimate default and often the only one that
 * means "nobody asked": `<pdx-popover>` declares `offsetPx: { type: Number, default: null }`
 * precisely so that 0 — a valid offset — is distinguishable from silence; handed 0 on every open,
 * `--pdx-float-offset` would be unreachable.
 *
 * A FACTORY for an Array or Object prop — `default: () => []` — is called, so each instance gets its
 * own value. Returned as written, the component would receive the function itself. A Function
 * prop's default is the value itself, and is never called.
 */
function resolveDefault(def: { type: PropType; default?: unknown }): unknown {
    if (def.default === undefined) return typeDefault(def.type);
    if (typeof def.default === 'function' && (def.type === Array || def.type === Object)) {
        return (def.default as () => unknown)();
    }
    return def.default;
}
/** Default value for a prop type when no attribute or default is provided. */
function typeDefault(type: PropType): unknown {
    switch (type) {
        case Boolean: return false;
        case Number:  return 0;
        case Object:  return null;
        case Array:   return [];
        case Function: return null;
        case String:
        default:      return '';
    }
}
