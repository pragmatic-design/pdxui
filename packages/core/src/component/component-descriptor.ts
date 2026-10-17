// The typed component descriptor (#123): what a TypeScript component declares, with the same meaning
// as the runes of a `.pdx`, which compiles into the same descriptor.
//
//   component('pdx-select', {
//     props:    { size: prop<'sm' | 'md' | 'lg'>('md'), options: prop.required<Option[]>() },
//     events:   { open: event<void>() },
//     …
//   });
//
// A builder returns what `component()` already reads at runtime — a prop is a PropDefinition, with the
// runtime type an attribute is coerced to — and carries the TypeScript type the context is typed from.
// `states` are the host's custom states, set with `ctx.state` (#132); `host` its attributes and
// listeners (#133); `parts` its public elements, for the manifest (#134); `models` the props it may
// write, which `::name` binds both ways (#124). `slots`, `expose` and `variants` are part of the
// descriptor's type now; each gets its behaviour in its own issue (docs/language/beta/components.md).

/** The runtime type an attribute value is coerced to. Object, Array and Function are property-only. */
export type PropType = typeof String | typeof Number | typeof Boolean | typeof Object | typeof Array | typeof Function;

/** A prop as `component()` reads it: its runtime type and its default. */
export interface PropDefinition {
    type: PropType;
    /** The default, or for an Array or Object prop a factory called once per instance. */
    default?: unknown;
}

/**
 * A prop whose TypeScript type is `T`. Written by hand on a constructor-form prop
 * (`{ type: Array, default: null } as TypedProp<Item[] | null>`), or returned by {@link prop}.
 */
export interface TypedProp<T> extends PropDefinition {
    readonly __brand?: T;
}

/** A prop declared with {@link prop}: typed, and possibly required. */
export interface PropSpec<T> extends TypedProp<T> {
    /** No default: a host that does not set it is reported in development. */
    readonly required?: boolean;
}

/** Options of {@link prop}. */
export interface PropOptions {
    /**
     * The runtime type an attribute is coerced to. Inferred from the default when omitted — a string,
     * number or boolean default is that type, an array (or a factory returning one) is Array, anything
     * else is Object, which is property-only. Give it when the default does not say it: a prop with
     * no default that an attribute may set.
     */
    type?: PropType;
}

/** The runtime type a default implies (see {@link PropOptions.type}). */
function inferType(value: unknown): PropType {
    switch (typeof value) {
        case 'string': return String;
        case 'number': return Number;
        case 'boolean': return Boolean;
        case 'function': return Array.isArray((value as () => unknown)()) ? Array : Object;
        default: return Array.isArray(value) ? Array : Object;
    }
}

/**
 * A prop of type `T` with a default. `prop<'sm' | 'md' | 'lg'>('md')` is a String prop typed as the
 * union; `prop<Item[]>(() => [])` an Array prop whose default each instance gets fresh.
 */
function propBuilder<T>(defaultValue?: T | (() => T), options?: PropOptions): PropSpec<T> {
    const type = options?.type ?? inferType(defaultValue);
    return defaultValue === undefined ? { type } : { type, default: defaultValue };
}

/** A prop of type `T` with no default, that the host must set: reported in development when it does not. */
function requiredProp<T>(options?: PropOptions): PropSpec<T> {
    return { type: options?.type ?? Object, required: true };
}

/** Declare a prop: `prop<T>(default, { type? })`, or `prop.required<T>({ type? })`. */
export const prop: typeof propBuilder & { required: typeof requiredProp } = Object.assign(propBuilder, { required: requiredProp });

/** An event whose `detail` is of type `D`; `void` for an event that carries none. */
export interface EventSpec<D> {
    readonly __detail?: D;
    /** Whether it bubbles: true unless declared otherwise, as `ctx.emit` does. */
    readonly bubbles?: boolean;
}

/** Declare an event: `event<number>()`, `event<void>({ bubbles: false })`. */
export function event<D = void>(options?: { bubbles?: boolean }): EventSpec<D> {
    return options?.bubbles === false ? { bubbles: false } : {};
}

/**
 * A prop of type `T` the component may write, and the parent bind both ways with `::name` (#124).
 * It is a prop — an attribute and a property, coerced the same way — and writing it inside the
 * component dispatches `<kebab-name>-change` with `{ value }`, which does not bubble.
 */
export interface ModelSpec<T> extends PropSpec<T> {
    readonly model: true;
}

/** Declare a model: `model<string>('')`, `model<Item[]>(() => [])`; the options are {@link prop}'s. */
export function model<T>(defaultValue?: T | (() => T), options?: PropOptions): ModelSpec<T> {
    return { ...propBuilder(defaultValue, options), model: true };
}

export { modelEvent } from '../utils/model-event';

/** A slot whose content the parent passes as `F`: typed now, wired by its own issue (#131). */
export interface SlotSpec<F> {
    readonly __slot?: F;
}

/** Declare a slot: `slot<(o: Option) => Node>()`. */
export function slot<F = () => Node>(): SlotSpec<F> {
    return {};
}

/** The detail type of an event declaration. */
export type EventDetail<S> = S extends EventSpec<infer D> ? D : unknown;

/**
 * `ctx.emit` typed from the declared events: the name is one of them, and the detail is its type —
 * absent for a `void` event. With no events declared it takes any name, as it always has.
 */
export type EmitOf<E> = keyof E extends never
    ? (event: string, detail?: unknown, options?: import('./element').EmitOptions) => boolean
    : <K extends keyof E & string>(
        event: K,
        ...rest: [EventDetail<E[K]>] extends [void]
            ? [detail?: undefined, options?: import('./element').EmitOptions]
            : [detail: EventDetail<E[K]>, options?: import('./element').EmitOptions]
    ) => boolean;
