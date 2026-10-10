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
  interface PdxResource<T> {
    readonly data: { (): T | undefined; peek(): T | undefined };
    readonly error: { (): unknown; peek(): unknown };
    readonly loading: { (): boolean; peek(): boolean };
    readonly isPending: { (): boolean; peek(): boolean };
    readonly state: { (): 'idle' | 'loading' | 'reloading' | 'success' | 'stale' | 'error' | 'local'; peek(): string };
    readonly status: {
      (): { readonly isLoading: boolean; readonly isError: boolean; readonly isSuccess: boolean;
            readonly isStale: boolean; readonly hasData: boolean; readonly isIdle: boolean };
      peek(): unknown;
    };
    readonly key: string;
    refetch(): Promise<void>;
    mutate(value: T): void;
    abort(): void;
    dispose(): void;
  }
}
`;
