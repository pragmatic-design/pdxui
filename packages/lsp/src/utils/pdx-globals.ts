// What a .pdx script can use without declaring it, as TypeScript is told it: the $… runes, the core
// helpers the compiler auto-imports, and the types of what the @… runes introduce. The language
// service serves it as one virtual .d.ts beside every projected script (./ts-service).

export const GLOBALS_FILE = '__pdx_globals__.d.ts';
export const GLOBALS_DTS = `
export {};
declare global {
  // In .pdx source, signals are USED as values (the compiler rewrites reads and writes):
  // so, for IntelliSense and diagnostics, the type is the VALUE, not a callable.
  function $signal<T>(v: T): T;
  // The VALUE form, the one the compiler takes: \`$derived(a > b)\` is a boolean.
  function $derived<T>(value: T): T;
  // What the projection writes for \`$derived(x)\`, \`$drv(()=>x)\`: the same length, and x read
  // later, as the compiler's \`computed(() => x)\` reads it (./ts-service).
  function $drv<T>(read: () => T): T;
  function $store<T extends object>(v: T): T;
  function $effect(fn: () => unknown): void;
  // Core's WatchOptions, whole (#206).
  type PdxWatchOptions = { immediate?: boolean; once?: boolean; name?: string };
  function $watch<T>(src: T | (() => T), cb: (v: T, prev: T) => void, opts?: PdxWatchOptions): void;
  // The untyped emit the compiler declares when a script calls it (#206).
  function $emit(event: string, detail?: unknown): void;
  function $t(key: string, params?: Record<string, unknown>): string;
  function $n(v: number, opts?: Intl.NumberFormatOptions): string;
  function $d(v: Date | number | string, opts?: Intl.DateTimeFormatOptions): string;
  function $r(v: number, unit: Intl.RelativeTimeFormatUnit): string;
  // A handler's event is typed by the template projection, each handler its own (#122): the event a
  // component declares, \`PdxEvent\` otherwise. Outside a handler there is none.
  const $event: unknown;
  // The element a tag makes: \`HTMLInputElement\` for \`input\`, \`HTMLElement\` for a custom element.
  type PdxElementOf<T extends string> = T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : HTMLElement;
  // The \`$event\` of a handler no component types: a DOM event by its name — whose target is the
  // element the handler is written on, so \`$event.target.value\` reads as it runs (a cast cannot be
  // written in a template). Any other name is an event of a library component or an unknown tag,
  // whose detail nothing describes: a CustomEvent whose detail is not checked.
  type PdxEvent<N extends string, T extends string> = N extends keyof HTMLElementEventMap
    ? Omit<HTMLElementEventMap[N], 'target' | 'currentTarget'> & { readonly target: PdxElementOf<T>; readonly currentTarget: PdxElementOf<T> }
    : CustomEvent<any>;
  // A handler on a component: its event, whose currentTarget is the component's element, typed with the
  // fields and methods its manifest lists (#479) — the model a text field's commit reads.
  type PdxOn<E, H> = Omit<E, 'currentTarget'> & { readonly currentTarget: H };
  const $el: HTMLElement;
  const $refs: Record<string, HTMLElement>;
  // The @pdxui/core helpers the compiler auto-imports (used with no import in the .pdx).
  const html: (strings: TemplateStringsArray, ...values: any[]) => unknown;
  function signal<T>(v: T): { (): T; set(v: T | ((p: T) => T)): void };
  function computed<T>(fn: () => T): () => T;
  // effect() and watch() hand back the function that stops them, as core's do.
  function effect(fn: () => unknown): () => void;
  function batch(fn: () => void): void;
  function untrack<T>(fn: () => T): T;
  function watch(src: unknown, cb: (v: any, p: any) => void, opts?: PdxWatchOptions): () => void;
  // An async callback too, as core's own signature allows.
  function onMount(fn: () => void | (() => void) | Promise<unknown>): void;
  function onDestroy(fn: () => void): void;
  function onUpdated(fn: () => void): void;
  function onError(fn: (e: unknown) => void): void;
  function onShow(fn: () => void): void;
  function onHide(fn: () => void): void;
  function onPropsChange(fn: (...a: any[]) => void): void;
  function onBeforeLeave(fn: (...a: any[]) => unknown): void;
  function onRouteChange(fn: (...a: any[]) => void): void;
  function onVisible(fn: (...a: any[]) => void): void;
  function onResize(fn: (...a: any[]) => void): void;
  // The router's navigation state, which the compiler imports from @pdxui/router where it is read (#149).
  const navigation: { readonly pending: PdxReadonly<boolean>; readonly to: PdxReadonly<string | null> };
  // \`attach:name="value"\` (#143): the projection checks the name as an attachment of the value.
  type PdxAttachment<V> = (el: Element, value: () => V) => void | (() => void);
  // V comes from the attachment alone: inferred from the value too, any value would widen it. The
  // value is the argument itself, so an error on it lands on the text the author wrote.
  function __pdxAttach<V>(fn: PdxAttachment<V>, value?: NoInfer<V>): void;
  // Core's built-in attachments, which the compiler imports where the template names them.
  const autofocus: PdxAttachment<unknown>;
  const trapFocus: PdxAttachment<unknown>;
  const clickOutside: PdxAttachment<((event: Event) => void) | undefined>;
  // \`@await (x as name)\` (#145): the result the body is given — a promise's value, a source's
  // \`data()\` (the body renders only with a result, so not \`undefined\`), or the value itself.
  type PdxAwaited<T> = T extends PromiseLike<infer V> ? V
    : T extends { data(): infer D; state(): unknown } ? Exclude<D, undefined>
    : T;
  function __pdxAwaited<T>(source: T): PdxAwaited<T>;
  // What \`@fetch name: 'GET /url' as T\` gives the script and the template: core's Resource<T>, whose
  // reads are signals — \`name.data()\`, not \`name.data\`. tests/fetch-types.test.ts fails when a
  // member of Resource is missing here.
  // Core's ReadonlySignal: a read and a peek of the SAME type. Written once, so the two cannot
  // drift — a peek typed apart made a form unassignable to core's Form in four showcase pages (#58).
  type PdxReadonly<T> = { (): T; peek(): T };
  // Core's Signal, as a store module's hook hands one out (./rune-module).
  type PdxSignal<T> = PdxReadonly<T> & { set(v: T | ((prev: T) => T)): void; setRaw(v: T): void };
  interface PdxResource<T> {
    readonly data: PdxReadonly<T | undefined>;
    readonly error: PdxReadonly<Error | null>;
    readonly state: PdxReadonly<'idle' | 'pending' | 'success' | 'error'>;
    readonly pending: PdxReadonly<boolean>;
    readonly stale: PdxReadonly<boolean>;
    readonly key: string;
    refetch(): Promise<void>;
    mutate(value: T): void;
    abort(): void;
    dispose(): void;
  }
  // What \`@loader user: loadUser;\` gives (#506): the router's LoaderSource<T>, T what the function
  // resolves to. tests/loader-types.test.ts fails when a member of LoaderSource is missing here.
  interface PdxLoaderSource<T> {
    readonly data: PdxReadonly<T | undefined>;
    readonly state: PdxReadonly<'idle' | 'pending' | 'success' | 'error'>;
    readonly error: PdxReadonly<Error | null>;
    readonly pending: PdxReadonly<boolean>;
    readonly stale: PdxReadonly<boolean>;
  }
  // What a named loader receives (#505, #564): the router's LoaderContext<P>, P the page pattern's
  // params as the router coerces them. tests/loader-types.test.ts fails when a member is missing here.
  interface PdxLoaderContext<P> {
    params: P;
    query: Record<string, string | string[]>;
    signal: AbortSignal;
  }
  // What \`@form\` gives: core's FormField, FieldArray and Form. A form is typed by two parameters
  // the projection writes out (./form-types): V, the values as getValues() returns them, nested; and
  // F, the fields, keyed as createForm flattens them — \`address.street\`, \`lines.0.product\` — each a
  // member of the form beside its own (#128). tests/form-store-types.test.ts fails when a member of
  // the three is missing here.
  interface PdxFormField<T> {
    readonly value: PdxReadonly<T> & { set(v: T | ((prev: T) => T)): void; setRaw(v: T): void };
    readonly error: PdxReadonly<string | undefined>;
    readonly warning: PdxReadonly<string | undefined>;
    readonly touched: PdxReadonly<boolean>;
    readonly dirty: PdxReadonly<boolean>;
    readonly required: boolean;
    onChange(value: T): void;
    onBlur(): void;
    reset(): void;
  }
  interface PdxFieldArray<T> {
    readonly items: PdxReadonly<{ readonly __id: number; readonly value: T }[]>;
    readonly length: PdxReadonly<number>;
    append(value: T): void;
    prepend(value: T): void;
    insert(index: number, value: T): void;
    remove(index: number): void;
    move(from: number, to: number): void;
    swap(a: number, b: number): void;
    update(index: number, value: T): void;
    replace(values: T[]): void;
    reset(): void;
    getValues(): T[];
    dispose(): void;
  }
  type PdxForm<V, F> = PdxFormMembers<V> & F;
  interface PdxFormMembers<V> {
    readonly valid: PdxReadonly<boolean>;
    readonly dirty: PdxReadonly<boolean>;
    readonly touched: PdxReadonly<boolean>;
    readonly submitting: PdxReadonly<boolean>;
    readonly submitted: PdxReadonly<boolean>;
    readonly errors: PdxReadonly<Partial<Record<string, string>>>;
    readonly warnings: PdxReadonly<Partial<Record<string, string>>>;
    readonly saveMode: 'onSubmit' | 'onChange' | 'onBlur' | 'immediate';
    readonly validateOn: 'onChange' | 'onBlur' | 'onSubmit';
    readonly state: PdxReadonly<'idle' | 'validating' | 'submitting' | 'success' | 'error'>;
    readonly submitError: PdxReadonly<unknown>;
    readonly formError: PdxReadonly<string | undefined>;
    handleSubmit(fn: (values: V) => Promise<void> | void): (e: Event) => Promise<void>;
    reset(newValues?: Partial<V>): void;
    setValues(values: Partial<V>): void;
    validate(): Promise<boolean>;
    // One generic signature, not core's two overloads: a page that hands the form to a helper typed
    // \`Form<Values>\` (four in the showcase) needs this to be assignable to core's Form, and
    // TypeScript cannot relate core's conditional return across two different value types.
    array<U = unknown>(name: string): PdxFieldArray<U>;
    getValues(): V;
    onFieldSave(callback: (fieldName: string, value: unknown) => void | Promise<unknown>): void;
    dispose(): void;
  }
}
`;
