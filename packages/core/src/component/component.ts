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
import { replacesDomMember } from './reserved-dom-members';
import { renderSlot } from '../renderer/slot';
import { bindHost } from './host';
import type { HostBindings } from './host';
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

// The prop and event shapes live with the descriptor's builders (#123); re-exported from here, where
// they have always been imported from.
import type { PropType, PropDefinition, TypedProp, PropSpec, EventSpec, ModelSpec, SlotSpec, EmitOf } from './component-descriptor';
import { modelEvent } from '../utils/model-event';
export type { PropType, PropDefinition, TypedProp } from './component-descriptor';

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
    /** Dispatch a custom event. It stays on the host unless `{ bubbles: true }` (#138). */
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
    /**
     * Turn one of the states the descriptor declares in `states` on or off (#132): a custom state of
     * the host, which CSS matches with `:state(name)`.
     */
    state(name: string, on: boolean): void;
}

/** The events a descriptor declares, by name. */
export type EventMap = Record<string, EventSpec<unknown>>;

/** The models a descriptor declares, by name (#124). */
export type ModelMap = Record<string, ModelSpec<unknown>>;

/**
 * Typed component context — its declared props and models as signals, and `emit` typed from its
 * declared events (any name when it declares none).
 */
export type TypedComponentContext<P extends Record<string, PropDefinition>, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>> =
    Omit<ComponentContextBase, 'emit'> & { emit: EmitOf<E> } & PropSignals<P> & PropSignals<M>;

/**
 * Untyped component context — legacy compat for components without explicit prop typing.
 * Allows `ctx.anyProp` without TS error. Prefer TypedComponentContext<P> for new code.
 */
export type ComponentContext = ComponentContextBase & Record<string, unknown>;

/**
 * What a descriptor declares besides its props (#123), the TypeScript form of the `.pdx` runes. `events`
 * type `ctx.emit`, and an undeclared name is reported in development. `states` are the host's custom
 * states, set with `ctx.state` (#132). `host` (#133) is declared beside `setup` in each options type,
 * where its functions are typed with the component's context. `parts` (#134) name the component's
 * public elements, `[data-part="name"]`, for the manifest; a `.pdx` checks and binds them at compile
 * time. `models` (#124) are props the component may write: writing one dispatches its
 * `<name>-change`, and `::name` binds it both ways. `slots` (#489) are typed snippets: functions the
 * element holds as properties, which a `.pdx`'s `@render` calls. The others are part of the
 * descriptor's type now and get their behaviour in their own issues: expose #140, variants #153.
 */
export interface ComponentDeclarations<E extends EventMap = EventMap, M extends ModelMap = ModelMap> {
    events?: E;
    models?: M;
    slots?: Record<string, SlotSpec<unknown>>;
    states?: readonly string[];
    parts?: readonly string[];
    expose?: readonly string[];
    variants?: Record<string, readonly string[]>;
}

/**
 * The host's attributes, bindings and listeners (#133), by name: `role` is a static value, set
 * unless the page set it; `:aria-expanded` a function of the context, written whenever what it reads
 * changes; `@keydown.enter` a listener, with the template's modifiers.
 */
export type HostOf<C> = Record<string, string | ((ctx: C, event: Event) => unknown)>;

export interface ComponentOptions<P extends Record<string, PropDefinition> = Record<string, PropDefinition>, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>>
    extends ComponentDeclarations<E, M> {
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
    setup?: (ctx: TypedComponentContext<P, E, M>) => Record<string, unknown> | void;
    render: (ctx: TypedComponentContext<P, E, M>) => DocumentFragment | Node;
    /** See {@link HostOf}. */
    host?: HostOf<TypedComponentContext<P, E, M>>;
}

/** Options with typed setup return — render ctx includes both props and setup exports. */
export interface ComponentOptionsWithSetup<
    P extends Record<string, PropDefinition>,
    S extends Record<string, unknown>,
    E extends EventMap = Record<never, never>,
    M extends ModelMap = Record<never, never>
> extends ComponentDeclarations<E, M> {
    props?: P;
    shadow?: boolean;
    static?: boolean;
    formAssociated?: boolean;
    /** See {@link ComponentOptions.file}. */
    file?: string;
    setup: (ctx: TypedComponentContext<P, E, M>) => S;
    render: (ctx: TypedComponentContext<P, E, M> & S) => DocumentFragment | Node;
    /** See {@link HostOf}: its functions see what `setup` returns, as `render` does. */
    host?: HostOf<TypedComponentContext<P, E, M> & S>;
}

// ─── component() ───────────────────────────────────────────────────

/**
 * Define a function-based Web Component.
 *
 * Usage:
 *   component('app-counter', {
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
export function component<P extends Record<string, PropDefinition>, S extends Record<string, unknown>, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>>(
    tag: string, options: ComponentOptionsWithSetup<P, S, E, M>): void;
/** Overload: no setup or setup returns void → render ctx has only props. */
export function component<P extends Record<string, PropDefinition>, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>>(
    tag: string, options: ComponentOptions<P, E, M>): void;
export function component<P extends Record<string, PropDefinition>, E extends EventMap, M extends ModelMap>(tag: string, options: ComponentOptions<P, E, M>): void {
    // A model is a prop (#124): the same attribute, property and coercion, plus the event its own
    // writes dispatch. A prop and a model of one name would be two accessors on one property.
    const modelDefs = (options.models ?? {}) as Record<string, ModelSpec<unknown>>;
    const modelNames = new Set(Object.keys(modelDefs));
    if (DEV) {
        for (const name of modelNames) {
            if (options.props && name in options.props) console.warn(`[pdx] <${tag}> declares '${name}' as both a prop and a model; the model wins.`);
        }
    }
    // A typed snippet (#489) is a property of the element too: a function, which `@render` calls. As a
    // Function prop it has the accessor, the value set before the upgrade, and a signal on the context
    // (`ctx.row`), so a function assigned after the render renders as well.
    const slotDefs: Record<string, PropDefinition> = {};
    for (const name of Object.keys(options.slots ?? {})) slotDefs[name] = { type: Function };
    const propDefs = { ...(options.props ?? {}), ...modelDefs, ...slotDefs } as Record<string, PropDefinition>;
    const propNames = Object.keys(propDefs);
    // Declared events (#123): with any declared, a name that is not one is reported in development.
    // A model's event counts as declared.
    const declaredEvents = options.events
        ? new Set([...Object.keys(options.events), ...[...modelNames].map(modelEvent)])
        : null;
    // Declared states (#132): the host attaches its internals for them, and ctx.state sets them.
    const declaredStates = options.states && options.states.length > 0 ? new Set(options.states) : null;

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
        /** The props a parent may bind both ways (#124): `bindTwoWay` listens to their events only. */
        static models: ReadonlySet<string> = modelNames;

        /** The host's custom states, when the descriptor declares any and the browser has them. */
        _customStates: CustomStateSet | null = null;

        /**
         * The signals setup returned, by name, for HMR state save/restore. A field, not a WeakMap keyed
         * by the instance: V8 sizes a WeakMap's table to the instances created between two full
         * collections and never shrinks it, which a page mounted 100 times read as a leak (#243).
         */
        _setupSignals: Map<string, Signal<unknown>> | null = null;

        constructor() {
            super();
            // Internals are attached once, for a form-associated component and for declared states.
            // Only a form-associated one keeps them as `_internals`: the form getters read that, and
            // `internals.form` throws on an element that is not form-associated.
            if ((useFormAssociated || declaredStates) && typeof this.attachInternals === 'function') {
                const internals = this.attachInternals();
                if (useFormAssociated) this._internals = internals;
                if (declaredStates) this._customStates = internals.states ?? null;
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
            const signals = this._setupSignals;
            if (!signals) return null;
            const state = new Map<string, unknown>();
            for (const [name, sig] of signals) {
                state.set(name, sig.peek());
            }
            return state;
        }

        /** Restore signal values from HMR-saved state. */
        __pdx_restoreState(state: Map<string, unknown>): void {
            const signals = this._setupSignals;
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
                emit: (event: string, detail?: unknown, emitOptions?: EmitOptions) => {
                    if (declaredEvents && !declaredEvents.has(event)) {
                        if (DEV) console.warn(`[pdx] <${tag}> emitted '${event}', which its descriptor does not declare in \`events\` (declared: ${[...declaredEvents].join(', ') || 'none'}).`);
                        return this.emit(event, detail, emitOptions);
                    }
                    // An event declared `event({ bubbles: true })` bubbles unless the call says otherwise (#138).
                    const declared = options.events?.[event];
                    const resolved = declared?.bubbles === true && emitOptions?.bubbles === undefined
                        ? { ...emitOptions, bubbles: true }
                        : emitOptions;
                    return this.emit(event, detail, resolved);
                },
                track: (fn: () => void | (() => void), options?: EffectOptions) => this.track(fn, options),
                frame: (fn: () => void) => this.frame(fn),
                expose: (api: Record<string, unknown>) => exposeOnElement(this, api),
                slot: (name: string, scope?: Record<string, unknown>, defaultFn?: () => Node | DocumentFragment) =>
                    renderSlot(slotFns, name, scope ? () => scope : null, defaultFn ?? (() => html``)),
                state: (name: string, on: boolean) => {
                    if (!declaredStates?.has(name)) {
                        if (DEV) console.warn(`[pdx] <${tag}> set the state '${name}', which its descriptor does not declare in \`states\` (declared: ${declaredStates ? [...declaredStates].join(', ') : 'none'}). It is not set.`);
                        return;
                    }
                    if (on) this._customStates?.add(name); else this._customStates?.delete(name);
                },
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

                // A required prop (`prop.required()`) the host did not set by the time it mounts (#123).
                if (DEV && (def as PropSpec<unknown>).required && initialRaw === null && !carriedFromPrevMount
                    && !(hasPreUpgrade && preUpgradeDesc.value !== undefined)) {
                    console.warn(`[pdx] <${tag}> mounted without its required prop '${name}'.`);
                }

                ctx[name] = modelNames.has(name) ? modelSignal(propSig, (value) => {
                    this.emit(modelEvent(name), { value }, { bubbles: false });
                }) : propSig;
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
                    const result = options.setup(ctx as TypedComponentContext<P, E, M>);
                    if (result) Object.assign(ctx, result);
                }
                // The host's declared attributes, bindings and listeners (#133), after setup: a
                // binding reads what setup returned, as the render does.
                if (options.host) bindHost(this, options.host as HostBindings, ctx, (fn) => this.track(fn));
                // Register signals for HMR save/restore
                const signalMap = new Map<string, Signal<unknown>>();
                for (const [key, value] of Object.entries(ctx)) {
                    if (value && typeof value === 'function' && typeof (value as { set?: unknown }).set === 'function' && typeof (value as { peek?: unknown }).peek === 'function') {
                        signalMap.set(key, value as Signal<unknown>);
                    }
                }
                if (signalMap.size > 0) this._setupSignals = signalMap;
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

            return options.render(ctx as TypedComponentContext<P, E, M>);
        }
    }

    // A prop, model or typed snippet is defined on the instance, over the member of the same name (#542):
    // one named after a member of this class or PdxElement replaces it, and one named after `style`, an
    // `on*` handler or the other HTMLElement members of `reserved-dom-members.ts` breaks the element for
    // code outside the component (#545). A `.pdx` is refused at compile time (PDX_NAME_RESERVED); a
    // TypeScript descriptor is told here. `form` replaces the form getter on purpose, for a form component.
    if (DEV) {
        for (const name of propNames) {
            if (name === 'form') continue;
            const member = Object.prototype.hasOwnProperty.call(Comp.prototype, name)
                || Object.prototype.hasOwnProperty.call(PdxElement.prototype, name);
            if (member) console.warn(`[pdx] <${tag}> declares '${name}', which is a member of the element: the declaration replaces it, and the component may not render. Rename it.`);
            else if (replacesDomMember(name)) console.warn(`[pdx] <${tag}> declares '${name}', which is HTMLElement's own '${name}': the declaration replaces it, and code that uses the element's '${name}' breaks. Rename it.`);
        }
    }

    define(tag, Comp as unknown as new () => PdxElement);
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * A model as the component sees it (#124): its prop's signal, whose writes also announce the new
 * value. The property setter the parent uses writes the prop's signal directly, so a value the
 * parent set is not echoed back to it; a write that does not change the value announces nothing.
 */
function modelSignal(propSig: Signal<unknown>, announce: (value: unknown) => void): Signal<unknown> {
    const write = (next: unknown): void => {
        if (Object.is(propSig.peek(), next)) return;
        propSig.setRaw(next);
        announce(next);
    };
    const read = (() => propSig()) as Signal<unknown>;
    read.peek = () => propSig.peek();
    read.set = (value) => write(typeof value === 'function' ? (value as (prev: unknown) => unknown)(propSig.peek()) : value);
    read.setRaw = write;
    return read;
}

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
