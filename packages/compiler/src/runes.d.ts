// Ambient declarations for .pdx rune syntax.
// These tell TypeScript that $signal(0) returns number (unwrapped type),
// so count++ type-checks as a number operation.
// The compiler strips these at build time.

declare function $signal<T>(initial: T): T;
declare function $derived<T>(expr: T): T;
declare function $effect(fn: () => void | (() => void)): void;
declare function $emit<T>(event: string, payload?: T): void;
declare function onMount(fn: () => void | (() => void) | Promise<unknown>): void;
declare function onDestroy(fn: () => void): void;
