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
  function $store<T extends object>(v: T): T;
  function $effect(fn: () => unknown): void;
  function $watch<T>(src: T | (() => T), cb: (v: T, prev: T) => void, opts?: { immediate?: boolean }): void;
  function $t(key: string, params?: Record<string, unknown>): string;
  function $n(v: number, opts?: Intl.NumberFormatOptions): string;
  function $d(v: Date | number | string, opts?: Intl.DateTimeFormatOptions): string;
  function $r(v: number, unit: Intl.RelativeTimeFormatUnit): string;
  // A handler's event: \`any\`, so \`$event.target.value\` reads as it runs. The template projection
  // narrows it where the event's payload type is known.
  const $event: any;
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
  function watch(src: unknown, cb: (v: any, p: any) => void, opts?: { immediate?: boolean }): () => void;
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
  // What \`@fetch name: 'GET /url' as T\` gives the script and the template: core's Resource<T>, whose
  // reads are signals — \`name.data()\`, not \`name.data\`. tests/fetch-types.test.ts fails when a
  // member of Resource is missing here.
  // Core's ReadonlySignal: a read and a peek of the SAME type. Written once, so the two cannot
  // drift — a peek typed apart made a form unassignable to core's Form in four showcase pages (#58).
  type PdxReadonly<T> = { (): T; peek(): T };
  interface PdxResource<T> {
    readonly data: PdxReadonly<T | undefined>;
    readonly error: PdxReadonly<unknown>;
    readonly loading: PdxReadonly<boolean>;
    readonly isPending: PdxReadonly<boolean>;
    readonly state: PdxReadonly<'idle' | 'loading' | 'reloading' | 'success' | 'stale' | 'error' | 'local'>;
    readonly status: PdxReadonly<{
      readonly isLoading: boolean; readonly isError: boolean; readonly isSuccess: boolean;
      readonly isStale: boolean; readonly hasData: boolean; readonly isIdle: boolean;
    }>;
    readonly key: string;
    refetch(): Promise<void>;
    mutate(value: T): void;
    abort(): void;
    dispose(): void;
  }
  // What \`@form\` gives: core's FormField, FieldArray and Form. A form is typed by two parameters
  // the projection writes out (./form-types): V, the values as getValues() returns them, nested; and
  // F, the fields, keyed as createForm flattens them — \`address.street\`, \`lines.0.product\`.
  // tests/form-store-types.test.ts fails when a member of the three is missing here.
  interface PdxFormField<T> {
    readonly value: PdxReadonly<T> & { set(v: T | ((prev: T) => T)): void; setRaw(v: T): void };
    readonly error: PdxReadonly<string | undefined>;
    readonly warning: PdxReadonly<string | undefined>;
    readonly touched: PdxReadonly<boolean>;
    readonly dirty: PdxReadonly<boolean>;
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
  interface PdxForm<V, F> {
    readonly fields: F;
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
    handleSubmit(fn: (values: V) => Promise<void> | void): (e: Event) => void;
    reset(newValues?: Partial<V>): void;
    setValues(values: Partial<V>): void;
    validate(): Promise<boolean>;
    // One generic signature, not core's two overloads: a page that hands the form to a helper typed
    // \`Form<Values>\` (four in the showcase) needs this to be assignable to core's Form, and
    // TypeScript cannot relate core's conditional return across two different value types.
    array<U = unknown>(name: string): PdxFieldArray<U>;
    getValues(): V;
    onFieldSave(callback: (fieldName: string, value: unknown) => void): void;
    dispose(): void;
  }
}
`;
