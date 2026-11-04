// One `@defer`'s code, loaded once for every block of it (#685).
//
// The compiler gives each `@defer` of a module one `deferCode`, at module level, where it gave each
// block its own `loadFn`. Its blocks share the load, and once the code has arrived a block renders its
// body in the task its trigger fires in: defer() reads `arrived` and skips the `.then`. Measured on the
// pilot's filter popover, 100 condition editors mounted at 1.23× their TypeScript build, from 2.18×.
// A load that fails is forgotten, so the next block or a retry loads it again.

/** A load function that remembers its code: what a compiled `@defer` passes to defer(). */
export interface DeferCode {
    (): Promise<unknown>;
    /** True once the code has arrived; `module` is then what the load resolved with. */
    readonly arrived: boolean;
    readonly module: unknown;
}

/** `load`, run at most once until it fails, and known to have arrived once it has. */
export function deferCode(load: () => Promise<unknown>): DeferCode {
    let pending: Promise<unknown> | null = null;
    const code = (() => {
        if (pending) return pending;
        const p = load();
        pending = p;
        p.then(
            (mod) => { if (pending === p) { state.arrived = true; state.module = mod; } },
            () => { if (pending === p) pending = null; },
        );
        return p;
    }) as DeferCode;
    const state = code as { arrived: boolean; module: unknown };
    state.arrived = false;
    state.module = undefined;
    return code;
}
