// Function-based component definition.
// Convenience API over PdxElement for simpler components.

import { signal, getTopErrorHandler } from '../reactivity/signal';
import type { Signal } from '../utils/types';
import type { EffectOptions } from '../reactivity/signal';
import { PdxElement, attrValue, watchAttr } from './element';
import { FormPdxElement } from './form-element';
import type { EmitOptions } from './element';
import { define } from './define';
import { pushScope, popScope } from './lifecycle';
import { exposeOnElement } from './channel';
import { componentLabel, componentFile } from './global-error';
import { devSetupBegin, devSetupEnd, devRecordError } from '../debug/devtools-api';
import { DEV } from '../utils/env';
import { replacesDomMember } from './reserved-dom-members';
import { bindHost } from './host';
import type { HostBindings } from './host';
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
import { PROP_SPEC } from './prop-spec';
import type { PropType, PropSpec, EventSpec, ModelSpec, SlotSpec, EmitOf } from './component-descriptor';
import { modelEvent } from '../utils/model-event';
import type { HydrateOnOptions } from '../renderer/hydrate-on';
import { isServerRender } from '../server/mode';
export type { PropType } from './component-descriptor';

/** The props a component declares, each with the descriptor: `prop<T>()`, `prop.required<T>()`, `prop.optional<T>()`. */
export type PropMap = Record<string, PropSpec<unknown>>;

/** A prop as `component()` reads it at runtime: its type, which an attribute is coerced to, and its default. */
interface PropRuntime {
    type: PropType;
    default?: unknown;
}

/** Signal accessors typed from the props' declarations. */
type PropSignals<P extends PropMap> = {
    [K in keyof P]: Signal<P[K] extends PropSpec<infer T> ? T : never>;
};

/**
 * Base context — framework methods only, fully typed. No index signature.
 * Use this when writing typed handwritten components with known props.
 */
export interface ComponentContextBase {
    /**
     * The host element. A form-associated component's is a FormPdxElement, with its labels and its form
     * association (#987); a typed context says which (`TypedComponentContext`, #1246).
     */
    el: PdxElement;
    /** Dispatch a custom event. It stays on the host unless `{ bubbles: true }` (#138). */
    /** False when the event was `cancelable` and a listener prevented it. */
    emit(event: string, detail?: unknown, options?: EmitOptions): boolean;
    /** Set form value (form-associated components only). */
    setFormValue?(value: FormData | string | File | null): void;
    /** Set form validity (form-associated components only). */
    setValidity?(flags: ValidityStateFlags, message?: string): void;
    /**
     * What the form submits, when it is not the model declared `{ form }` as it is (#135): a value
     * serialized as the model's would be (`null` for no entry). Reset, restore and `required` stay on
     * the model. Present only on a component with a form model, in a DOM with form association.
     */
    formValue?(get: () => unknown): void;
    /**
     * When the value counts as missing for `required`, said by the component (#1039): `get` answers it,
     * in place of core's own rule (`null`, `''`, `false`, an empty array), which never calls an object
     * missing. Present only on a component with a form model, in a DOM with form association.
     */
    formMissing?(get: () => boolean): void;
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
    /**
     * Turn one of the states the descriptor declares in `states` on or off (#132): a custom state of
     * the host, which CSS matches with `:state(name)`.
     */
    state(name: string, on: boolean): void;
    /**
     * Keep each declared state in `map` on while its function returns a truthy value (#1207): one
     * tracked effect per state, as `ctx.track(() => ctx.state(name, …))` would be. What a compiled
     * `@state` emits.
     */
    states(map: Record<string, () => unknown>): void;
}

/** The events a descriptor declares, by name. */
export type EventMap = Record<string, EventSpec<unknown>>;

/** The models a descriptor declares, by name (#124). */
export type ModelMap = Record<string, ModelSpec<unknown>>;

/**
 * Typed component context — its declared props and models as signals, and `emit` typed from its
 * declared events (any name when it declares none).
 */
export type TypedComponentContext<P extends PropMap, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>, V extends VariantMap = Record<never, never>> =
    Omit<ComponentContextBase, 'emit' | 'el'> & { emit: EmitOf<E>; el: HostElementOf<M> } & PropSignals<P> & PropSignals<M> & VariantSignals<V>;

/**
 * The host as a typed context has it (#1246): a FormPdxElement, with the platform's form API, for a
 * component that declares a model `{ form: true }`; a PdxElement, which has none, for any other.
 */
type HostElementOf<M extends ModelMap> =
    { [K in keyof M]: M[K] extends { readonly form: unknown } ? K : never }[keyof M] extends never ? PdxElement : FormPdxElement;

/**
 * One variant axis (#512): its values in order, or a record from each value to the native selector
 * that draws the same look on plain HTML (`{ primary: '.pdx-primary' }`, #626). The first is the default.
 */
export type VariantAxisSpec = readonly string[] | Readonly<Record<string, string>>;

/** The variant axes a descriptor declares, by name. */
export type VariantMap = Record<string, VariantAxisSpec>;

/** The values of an axis: the list's members, or the record's keys. */
type VariantValue<A> = A extends readonly (infer T)[] ? T : keyof A & string;

/** Each axis as a signal of its values. */
type VariantSignals<V extends VariantMap> = { [K in keyof V]: Signal<VariantValue<V[K]>> };

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
 * element holds as properties, which a `.pdx`'s `@render` calls. `variants` (#512) are the axes the
 * design CSS keys its `@variant` rules on: a prop per axis, typed with its values and reflected on the
 * host as an attribute. `expose` is part of the descriptor's type now and gets its behaviour in #140.
 * `generics` (#651) are the component's type parameters, the TypeScript form of a `.pdx`'s `@generic`:
 * metadata for the editor only, never read at run time. Each names its constraint and the array prop
 * it is inferred from; the manifest types that prop `T[]`, and a slot's signature may use `T`. `source`
 * (#853) names the DataSource prop it is inferred from as well, which the manifest types `DataSource<T>`.
 */
export interface ComponentDeclarations<E extends EventMap = EventMap, M extends ModelMap = ModelMap, V extends VariantMap = VariantMap> {
    generics?: Record<string, { extends?: string; from?: string; source?: string }>;
    events?: E;
    models?: M;
    slots?: Record<string, SlotSpec<unknown>>;
    states?: readonly string[];
    parts?: readonly string[];
    expose?: readonly string[];
    variants?: V;
}

/**
 * The host's attributes, bindings and listeners (#133), by name: `role` is a static value, set
 * unless the page set it; `:aria-expanded` a function of the context, written whenever what it reads
 * changes; `@keydown.enter` a listener, with the template's modifiers.
 */
export type HostOf<C> = Record<string, string | ((ctx: C, event: Event) => unknown)>;

export interface ComponentOptions<P extends PropMap = PropMap, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>, V extends VariantMap = Record<never, never>>
    extends ComponentDeclarations<E, M, V> {
    props?: P;
    /** Use Shadow DOM instead of Light DOM. Default: false (Light DOM). */
    shadow?: boolean;
    /** Mark component as fully static (no reactive bindings). Production optimization. */
    static?: boolean;
    /** Make this a form-associated custom element. Enables ElementInternals. */
    formAssociated?: boolean;
    /**
     * On a generated page, take the host over when one of these triggers fires instead of at boot
     * (#160, part 4d): `@hydrate viewport;` in a `.pdx`. The triggers are `@defer`'s, without
     * `when`, which would read a setup that has not run. Elsewhere the component mounts as always.
     */
    hydrate?: HydrateOnOptions;
    /**
     * The `.pdx` this component was compiled from, relative to the app root. The compiler passes it
     * in development builds only, and an unhandled runtime error names it.
     */
    file?: string;
    setup?: (ctx: TypedComponentContext<P, E, M, V>) => Record<string, unknown> | void;
    render: (ctx: TypedComponentContext<P, E, M, V>) => DocumentFragment | Node;
    /** See {@link HostOf}. */
    host?: HostOf<TypedComponentContext<P, E, M, V>>;
}

/** Options with typed setup return — render ctx includes both props and setup exports. */
export interface ComponentOptionsWithSetup<
    P extends PropMap,
    S extends Record<string, unknown>,
    E extends EventMap = Record<never, never>,
    M extends ModelMap = Record<never, never>,
    V extends VariantMap = Record<never, never>
> extends ComponentDeclarations<E, M, V> {
    props?: P;
    shadow?: boolean;
    static?: boolean;
    formAssociated?: boolean;
    /** See {@link ComponentOptions.file}. */
    file?: string;
    setup: (ctx: TypedComponentContext<P, E, M, V>) => S;
    render: (ctx: TypedComponentContext<P, E, M, V> & S) => DocumentFragment | Node;
    /** See {@link HostOf}: its functions see what `setup` returns, as `render` does. */
    host?: HostOf<TypedComponentContext<P, E, M, V> & S>;
}

// ─── component() ───────────────────────────────────────────────────

/**
 * Define a function-based Web Component.
 *
 * Usage:
 *   component('app-counter', {
 *     props: {
 *       initial: prop(0),
 *     },
 *     setup(ctx) {
 *       const count = signal(ctx.initial());
 *       return { count, increment: () => count.set(v => v + 1) };
 *     },
 *     render: (ctx) => html`
 *       <span>${ctx.count}</span>
 *       <button @click=${ctx.increment}>+</button>
 *     `,
 *   });
 */
/** Overload: setup returns a typed record → render ctx merges props + setup exports. */
export function component<P extends PropMap, S extends Record<string, unknown>, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>, const V extends VariantMap = Record<never, never>>(
    tag: string, options: ComponentOptionsWithSetup<P, S, E, M, V>): void;
/** Overload: no setup or setup returns void → render ctx has only props. */
export function component<P extends PropMap, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>, const V extends VariantMap = Record<never, never>>(
    tag: string, options: ComponentOptions<P, E, M, V>): void;
export function component<P extends PropMap, E extends EventMap, M extends ModelMap, V extends VariantMap>(tag: string, options: ComponentOptions<P, E, M, V>): void {
    defineComponent(tag, options, EVERY_FEATURE);
}

/**
 * The features of a definition a component may not use, each the function that implements it (#1246):
 * {@link defineComponent} carries the ones it is given, so a bundle carries the modules of the features
 * its components use, and no other.
 */
export interface ComponentFeatures {
    /** `ctx.expose`: the methods and getters a parent reaches through a ref (`@expose`). */
    expose?: typeof exposeOnElement;
    /** The descriptor's `host` (`@host`), and the attributes that reflect its variant axes. */
    host?: typeof bindHost;
    /**
     * The base of a form-associated component (a model declared `{ form }`, or `formAssociated`): its
     * ElementInternals and the platform's form API. A component that is not one extends PdxElement.
     */
    form?: typeof FormPdxElement;
}

/** What `component()` defines with: every feature, for a descriptor written by hand. */
const EVERY_FEATURE: ComponentFeatures = { expose: exposeOnElement, host: bindHost, form: FormPdxElement };

/**
 * Define a component with the features given and no other (#1246): the definition a compiled `.pdx`
 * emits, naming the features its declarations use. A descriptor written by hand is defined with
 * {@link component}, which carries every feature; given a declaration whose feature it was not given,
 * this throws in development.
 */
export function defineComponent<P extends PropMap, S extends Record<string, unknown>, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>, const V extends VariantMap = Record<never, never>>(
    tag: string, options: ComponentOptionsWithSetup<P, S, E, M, V>, features?: ComponentFeatures): void;
export function defineComponent<P extends PropMap, E extends EventMap = Record<never, never>, M extends ModelMap = Record<never, never>, const V extends VariantMap = Record<never, never>>(
    tag: string, options: ComponentOptions<P, E, M, V>, features?: ComponentFeatures): void;
export function defineComponent<P extends PropMap, E extends EventMap, M extends ModelMap, V extends VariantMap>(tag: string, options: ComponentOptions<P, E, M, V>, features: ComponentFeatures = {}): void {
    const { expose, host: hostFeature, form: formBase } = features;
    // A descriptor whose `host` or variant axes nothing would bind: the definition was not given the
    // host feature. The compiler gives it to every component that declares either.
    if (DEV && !hostFeature && (Object.keys(options.host ?? {}).length > 0 || Object.keys(options.variants ?? {}).length > 0)) {
        throw new Error(`[pdx] <${tag}>'s descriptor declares \`host\` or \`variants\`, and defineComponent was not given the host feature. Pass it ({ host: bindHost }), or define the component with component(), which carries every feature.`);
    }
    // A model is a prop (#124): the same attribute, property and coercion, plus the event its own
    // writes dispatch. A prop and a model of one name would be two accessors on one property.
    const modelDefs = (options.models ?? {}) as Record<string, ModelSpec<unknown>>;
    const modelNames = new Set(Object.keys(modelDefs));
    if (DEV) {
        for (const name of modelNames) {
            if (options.props && name in options.props) console.warn(`[pdx] <${tag}> declares '${name}' as both a prop and a model; the model wins.`);
        }
        // The constructor form is gone (#300): a prop or a model is what a builder returns. TypeScript
        // refuses the object literal; this is JavaScript passing one anyway.
        for (const [name, def] of Object.entries(options.props ?? {})) {
            if (!(def && typeof def === 'object' && PROP_SPEC in def)) throw new Error(`[pdx] <${tag}>'s prop '${name}' is not a prop declaration: the constructor form ({ type: String, default: … }) is removed. Declare it with prop<T>(default, { type? }), prop.required<T>() or prop.optional<T>().`);
        }
        for (const [name, def] of Object.entries(modelDefs)) {
            if (!(def && typeof def === 'object' && PROP_SPEC in def)) throw new Error(`[pdx] <${tag}>'s model '${name}' is not a model declaration: the constructor form ({ type: String, default: … }) is removed. Declare it with model<T>(default, { type?, form? }).`);
        }
    }
    // A typed snippet (#489) is a property of the element too: a function, which `@render` calls. As a
    // Function prop it has the accessor, the value set before the upgrade, and a signal on the context
    // (`ctx.row`), so a function assigned after the render renders as well.
    const slotDefs: Record<string, PropRuntime> = {};
    for (const name of Object.keys(options.slots ?? {})) slotDefs[name] = { type: Function };
    // A variant axis (#512) is a String prop defaulting to its first value — a list's first member, a
    // record's first key — reflected on the host as a bound host attribute, where the design CSS's
    // `@variant` rules read it. A value outside the axis reflects the default. The attribute is the
    // kebab-case of the axis (#834), the name an author writes and an alias the prop already observes:
    // `connectorStyle` is `connector-style`, where the camelCase name would become `connectorstyle`.
    const variantDefs: Record<string, PropRuntime> = {};
    const host: HostBindings = {};
    for (const [name, spec] of Object.entries((options.variants ?? {}) as VariantMap)) {
        if (DEV && options.props && name in options.props) console.warn(`[pdx] <${tag}> declares '${name}' as both a prop and a variant axis; the axis wins.`);
        const values = Array.isArray(spec) ? spec as readonly string[] : Object.keys(spec);
        variantDefs[name] = { type: String, default: values[0] };
        host[':' + name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)] = (c: Record<string, () => string>) => values.includes(c[name]()) ? c[name]() : values[0];
    }
    Object.assign(host, options.host);
    const propDefs: Record<string, PropRuntime> = { ...(options.props ?? {}), ...variantDefs, ...modelDefs, ...slotDefs };
    const propNames = Object.keys(propDefs);
    // Declared events (#123): with any declared, a name that is not one is reported in development.
    // A model's event counts as declared.
    const declaredEvents = options.events
        ? new Set([...Object.keys(options.events), ...[...modelNames].map(modelEvent)])
        : null;
    // Declared states (#132): the host attaches its internals for them, and ctx.state sets them.
    const declaredStates = options.states && options.states.length > 0 ? new Set(options.states) : null;

    // A model declared `{ form }` (#135) is the component's form value, and makes it form-associated.
    // Its spec carries the wiring (`model(d, { form: true })`, or the compiler's `form: wireFormModel`),
    // so this module does not import it and an app with no form model does not carry it.
    const formModels = [...modelNames].filter(n => typeof (modelDefs[n] as ModelSpec<unknown>).form === 'function');
    if (DEV && formModels.length > 1) console.warn(`[pdx] <${tag}> declares more than one model { form } (${formModels.join(', ')}); a form takes one value from a control, and '${formModels[0]}' is it.`);
    if (DEV) {
        for (const n of modelNames) {
            if ((modelDefs[n] as { form?: unknown }).form === true) console.warn(`[pdx] <${tag}>'s model '${n}' says form: true by hand; declare it with model(default, { form: true }), which carries the form wiring. It is not form-associated.`);
        }
    }
    const formModel = formModels[0] ?? null;
    const wireForm = formModel ? (modelDefs[formModel] as ModelSpec<unknown>).form! : null;

    const useShadow = options.shadow ?? false;
    const useFormAssociated = (options.formAssociated ?? false) || formModel !== null;
    if (DEV && useFormAssociated && !formBase) {
        throw new Error(`[pdx] <${tag}> is form-associated (a model declared { form }, or formAssociated), and defineComponent was not given the form feature. Pass it ({ form: FormPdxElement }), or define the component with component(), which carries every feature.`);
    }
    // The class a form-associated component extends: the form feature's, with the platform's form API on
    // its ElementInternals. The others extend PdxElement and carry none of it (#1246).
    const Base: typeof PdxElement = useFormAssociated && formBase ? formBase : PdxElement;
    // This element as the form base it extends, for the form wiring below: the class's base is the
    // form feature's exactly when the component is form-associated.
    const asForm = (el: PdxElement): FormPdxElement | null => (Base === PdxElement ? null : el as FormPdxElement);
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

    const hydrateLater = options.hydrate ?? null;

    class Comp extends Base {
        static attrs = attrNames;
        static attrCanonical = attrCanonical;
        static formAssociated = useFormAssociated;
        static file = options.file;
        /** The props a parent may bind both ways (#124): `bindTwoWay` listens to their events only. */
        static models: ReadonlySet<string> = modelNames;

        /** The host's custom states, when the descriptor declares any and the browser has them. */
        _customStates: CustomStateSet | null = null;

        override get _hydrateLater(): HydrateOnOptions | null { return hydrateLater; }

        /**
         * The signals setup returned, by name, for HMR state save/restore. A field, not a WeakMap keyed
         * by the instance: V8 sizes a WeakMap's table to the instances created between two full
         * collections and never shrinks it, which a page mounted 100 times read as a leak (#243).
         */
        _setupSignals: Map<string, Signal<unknown>> | null = null;

        /**
         * The props' signals, by the prop's index, which the class's accessors read and write (#1246,
         * 3b): made by a mount, kept after it, so a later mount carries their values over.
         */
        _propSignals: Signal<unknown>[] | null = null;

        /** The values set on a prop while the element had no signals yet: the next mount takes them. */
        _propPending: Map<string, unknown> | null = null;

        constructor() {
            super();
            // Internals are attached once: by the form base for a form-associated component, here for
            // one that only declares states.
            if (declaredStates) {
                const internals = asForm(this)?._internals
                    ?? (typeof this.attachInternals === 'function' ? this.attachInternals() : null);
                this._customStates = internals?.states ?? null;
            }
        }

        connectedCallback(): void {
            if (useShadow && !this.shadowRoot) {
                this.attachShadow({ mode: 'open' });
            }
            super.connectedCallback();
        }

        get _renderTarget(): Node { return useShadow ? this.shadowRoot! : this; }

        body(): DocumentFragment | Node | null {
            const setState = (name: string, on: boolean): void => {
                if (!declaredStates?.has(name)) {
                    if (DEV) console.warn(`[pdx] <${tag}> set the state '${name}', which its descriptor does not declare in \`states\` (declared: ${declaredStates ? [...declaredStates].join(', ') : 'none'}). It is not set.`);
                    return;
                }
                if (on) this._customStates?.add(name); else this._customStates?.delete(name);
            };
            const ctx: Record<string, unknown> = {
                el: this,
                emit: (event: string, detail?: unknown, emitOptions?: EmitOptions) => {
                    if (declaredEvents && !declaredEvents.has(event)) {
                        if (DEV) console.warn(`[pdx] <${tag}> emitted '${event}', which its descriptor does not declare in \`events\` (declared: ${[...declaredEvents].join(', ') || 'none'}).`);
                        return this.emit(event, detail, emitOptions);
                    }
                    // The declaration is the default and the call's options win: an event declared
                    // `event({ bubbles: true })` bubbles, one declared `event({ cancelable: true })` can be
                    // refused, unless the call says otherwise (#138, #1035).
                    return this.emit(event, detail, { ...options.events?.[event], ...emitOptions });
                },
                track: (fn: () => void | (() => void), options?: EffectOptions) => this.track(fn, options),
                frame: (fn: () => void) => this.frame(fn),
                // `ctx.expose`, when the definition was given the feature (#1246). In the literal, so
                // every context of the class has one shape: a property added after it would change it.
                expose: expose ? (api: Record<string, unknown>) => expose(this, api) : undefined,
                state: setState,
                states: (map: Record<string, () => unknown>) => {
                    for (const name of Object.keys(map)) {
                        const read = map[name];
                        this.track(() => { setState(name, Boolean(read())); });
                    }
                },
            };
            // Form-associated: expose form methods on context
            const formEl = asForm(this);
            if (formEl?._internals) {
                ctx.setFormValue = (v: FormData | string | File | null) => formEl.setFormValue(v);
                ctx.setValidity = (flags: ValidityStateFlags, msg?: string) => formEl.setValidity(flags, msg);
            }

            // Create typed prop signals with dual sync:
            //   1. HTML attribute changes (setAttribute) → prop signal
            //   2. JS property sets (el.prop = value) → prop signal
            // This ensures both patterns work:
            //   <pdx-stats total="6">                    → attribute
            //   <pdx-stats :total="store.stats().total"> → JS property via bindProperty
            // The property's accessor is the class's, defined once (`propAccessors`, #1246 3b): this
            // mount gives it the signals it reads and writes, by the prop's index.
            const prevSignals = this._propSignals;
            const pending = this._propPending;
            this._propPending = null;
            const signals: Signal<unknown>[] = new Array(propNames.length);
            this._propSignals = signals;
            for (let i = 0; i < propNames.length; i++) {
                const name = propNames[i];
                const def = propDefs[name];
                const isPropOnly = PROP_ONLY_TYPES.has(def.type);
                // HTML lowercases attributes — read from lowercase key, or from an alias of it
                const attrRaw = isPropOnly ? this.getAttribute(name.toLowerCase()) : attrValue(this, name.toLowerCase());

                // Re-parent/reconnect: an earlier mount's signals are still the element's.
                // Attributes survive the move in the DOM, values set through a JS property
                // do not — without this carry-over `el.showActions = false` would go back to the default after
                // a drawer or dialog re-parented the content: the last signal holds the last known value.
                const existingDesc = Object.getOwnPropertyDescriptor(this, name);
                // By index: a hot update that changed the props has no previous signal for a new one.
                const prevSignal = prevSignals?.[i];
                const carriedFromPrevMount = prevSignal ? { value: prevSignal.peek() } : null;

                const kebab = jsonPropKebab.get(name);
                const initialRaw = attrRaw ?? (kebab ? this.getAttribute(kebab) : null);
                const initial = carriedFromPrevMount
                    ? carriedFromPrevMount.value
                    : initialRaw !== null
                        ? coerce(initialRaw, def)
                        : resolveDefault(def);
                const propSig = signal(initial);
                signals[i] = propSig;
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

                // Sync 1: HTML attribute CHANGES → update prop signal, called by
                // attributeChangedCallback (watchAttr), as the JS setter below is by a property set.
                // We apply only the CHANGES (not the initial value, already in `initial`): a value
                // carried over from the previous mount is not clobbered.
                // Explicitly removing a Boolean attribute that is present → false, not the default:
                // its initial absence means "use the default", its removal is an action.
                if (!isPropOnly) {
                    let prevRaw = attrRaw;
                    watchAttr(this, name.toLowerCase(), (raw) => {
                        if (raw === null && stripping) { stripping = false; prevRaw = null; return; }
                        if (raw === prevRaw) return; // no attribute change
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
                // This is how :attr bindings from parent templates work: the class's accessor.
                // A value set before this mount goes through it now — one set before the element was
                // upgraded, an own data property over the accessor, or one the accessor held while
                // the element was not mounted.
                const hasPreUpgrade = existingDesc !== undefined && 'value' in existingDesc;
                if (hasPreUpgrade) delete (this as unknown as Record<string, unknown>)[name];
                const early = hasPreUpgrade ? existingDesc.value : pending?.get(name);
                if (early !== undefined) (this as unknown as Record<string, unknown>)[name] = early;

                // A required prop (`prop.required()`) the host did not set by the time it mounts (#123).
                if (DEV && (def as PropSpec<unknown>).required && initialRaw === null && !carriedFromPrevMount
                    && early === undefined) {
                    console.warn(`[pdx] <${tag}> mounted without its required prop '${name}'.`);
                }

                ctx[name] = modelNames.has(name) ? modelSignal(propSig, (value) => {
                    this.emit(modelEvent(name), { value }, { bubbles: false });
                }) : propSig;
            }

            // The model declared `{ form }` is the form's value, and the form's lifecycle writes it (#135).
            if (wireForm && formEl?._internals) formEl._formModel = wireForm(formEl, (fn) => this.track(fn), ctx, formModel!, propNames, tag);

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
                registerFrame: (fn) => this.frame(fn),
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
            /** What setup returned: the devtools name what it registered after it (#298). */
            let setupResult: unknown;
            try {
                if (options.setup) {
                    const result = options.setup(ctx as TypedComponentContext<P, E, M, V>);
                    setupResult = result;
                    if (result) Object.assign(ctx, result);
                }
                // The host's declared attributes, bindings and listeners (#133), and its variant axes,
                // after setup: a binding reads what setup returned, as the render does.
                if (hostFeature) hostFeature(this, host, ctx, (fn) => this.track(fn));
                // Register signals for HMR save/restore: development only, as HMR is (#1246, part 3a).
                if (DEV) {
                    const signalMap = new Map<string, Signal<unknown>>();
                    for (const [key, value] of Object.entries(ctx)) {
                        if (value && typeof value === 'function' && typeof (value as { set?: unknown }).set === 'function' && typeof (value as { peek?: unknown }).peek === 'function') {
                            signalMap.set(key, value as Signal<unknown>);
                        }
                    }
                    if (signalMap.size > 0) this._setupSignals = signalMap;
                }
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
                // Rendered to a string (#160), the error is the server's to report, as it was thrown: the
                // span is the browser's, and building it there would throw again, over the real reason.
                if (getTopErrorHandler() || isServerRender()) throw err;
                console.error(`[pdx] Component ${componentLabel(tag)} setup failed:`, err);
                const msg = document.createElement('span');
                msg.textContent = `Error in <${tag}>: ${err instanceof Error ? err.message : String(err)}`;
                msg.style.color = 'red';
                msg.style.fontSize = '0.8rem';
                return msg;
            }
            popScope();
            if (DEV) devSetupEnd(setupResult);

            return options.render(ctx as TypedComponentContext<P, E, M, V>);
        }
    }

    // A prop, model or typed snippet is defined on the instance, over the member of the same name (#542):
    // one named after a member of this class or PdxElement replaces it, and one named after `style`, an
    // `on*` handler or the other HTMLElement members of `reserved-dom-members.ts` breaks the element for
    // code outside the component (#545). A `.pdx` is refused at compile time (PDX_NAME_RESERVED); a
    // TypeScript descriptor is told here. `form` replaces the form getter on purpose, for a form component,
    // and `labels` the labels getter, for a component whose data is called that (#987).
    if (DEV) {
        for (const name of propNames) {
            if (name === 'form' || name === 'labels') continue;
            const member = Object.prototype.hasOwnProperty.call(Comp.prototype, name)
                || Object.prototype.hasOwnProperty.call(PdxElement.prototype, name);
            if (member) console.warn(`[pdx] <${tag}> declares '${name}', which is a member of the element: the declaration replaces it, and the component may not render. Rename it.`);
            else if (replacesDomMember(name)) console.warn(`[pdx] <${tag}> declares '${name}', which is HTMLElement's own '${name}': the declaration replaces it, and code that uses the element's '${name}' breaks. Rename it.`);
        }
    }

    // Each prop's property, once, on the class (#1246, 3b): it was an accessor and two closures defined
    // on every instance at every mount — measured, a third of the mount's own time. After the check above,
    // which reads the class's members before these are among them.
    for (let i = 0; i < propNames.length; i++) {
        const name = propNames[i];
        const def = propDefs[name];
        // A prop named after an HTMLElement member kept on purpose (`id`, `title`, `prefix`): unmounted,
        // it is that member, as it was before the component had defined the prop on the instance.
        const native = nativeDescriptor(PdxElement.prototype, name);
        Object.defineProperty(Comp.prototype, name, {
            get(this: Comp) {
                const signals = this._propSignals;
                if (signals) return signals[i]();
                if (native?.get) return native.get.call(this);
                return this._propPending?.get(name);
            },
            set(this: Comp, value: unknown) {
                const signals = this._propSignals;
                if (!signals) {
                    if (native?.set) native.set.call(this, value);
                    else (this._propPending ??= new Map()).set(name, value);
                    return;
                }
                const propSig = signals[i];
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
    }

    // HMR's state save and restore (#1246, part 3a): on the prototype in development only, where a hot
    // update reads them (`__pdx_hmr_save`, `__pdx_hmr_restore` call them only if they are there).
    if (DEV) Object.assign(Comp.prototype, HMR_STATE);

    define(tag, Comp as unknown as new () => PdxElement);
}

/** The accessor or value `name` has on `proto`'s chain, the nearest one, or null. */
function nativeDescriptor(proto: object, name: string): PropertyDescriptor | null {
    for (let p: object | null = proto; p; p = Object.getPrototypeOf(p)) {
        const d = Object.getOwnPropertyDescriptor(p, name);
        if (d) return d;
    }
    return null;
}

/** What a hot update keeps of an instance: its setup's signals, saved and restored by name. */
const HMR_STATE = {
    /** Save all setup signal values for HMR state preservation. */
    __pdx_saveState(this: { _setupSignals: Map<string, Signal<unknown>> | null }): Map<string, unknown> | null {
        const signals = this._setupSignals;
        if (!signals) return null;
        const state = new Map<string, unknown>();
        for (const [name, sig] of signals) {
            state.set(name, sig.peek());
        }
        return state;
    },

    /** Restore signal values from HMR-saved state. */
    __pdx_restoreState(this: { _setupSignals: Map<string, Signal<unknown>> | null }, state: Map<string, unknown>): void {
        const signals = this._setupSignals;
        if (!signals || !state) return;
        for (const [name, value] of state) {
            const sig = signals.get(name);
            if (sig) sig.set(value as never);
        }
    },
};

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
