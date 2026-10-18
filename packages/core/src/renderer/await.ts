// @await — the async boundary of a template (#145).
//
// `@await (x as name) { … } @loading { … } @error (err, retry) { … }` compiles to
// `awaitBlock(() => x, (name) => body, loading, error, { minMs, maxMs })`. What it awaits:
//   - a source that speaks the async vocabulary — `state()`, `data()`, `error()`, and `refetch()`
//     when it has one: a resource, `@fetch`, `useQuery`, loader data, an action;
//   - a promise;
//   - a plain value (data.md, E5): `undefined` is pending, `false` is a condition not yet met, and
//     anything else — `null`, `0`, `''` included — is the result.
// The branch is decided by the state, never by the value's truthiness. A refresh, and a refresh that
// failed over kept data, keep the body (E4): the body reads `x.error()` to show the failure.

import { signal, computed, effect, collectDisposers, onDispose, untracked } from '../reactivity/signal';
import type { Dispose } from '../utils/types';
import { nodesBetween } from './helpers';
import { errorBoundary } from './error-boundary';
import { placePartNode } from './part-nodes';

/** `@await`'s `maxMs` ran out with no result. The source is not cancelled; a later result replaces it. */
export class AwaitTimeoutError extends Error {
    constructor(readonly ms: number) {
        super(`no result after ${ms}ms`);
        this.name = 'AwaitTimeoutError';
    }
}

type Outcome =
    | { kind: 'wait' }
    | { kind: 'result'; value: unknown }
    | { kind: 'error'; error: unknown; refetch?: () => unknown };

const WAIT: Outcome = { kind: 'wait' };

type PromiseState = { status: 'pending' | 'fulfilled' | 'rejected'; value?: unknown; reason?: unknown };

/** One state signal per promise, so every evaluation of the same `@await` reads the same state. */
const promiseStates = new WeakMap<object, ReturnType<typeof signal<PromiseState>>>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof (value as { then?: unknown }).then === 'function';
}

interface AsyncSource {
    state(): string;
    data(): unknown;
    error?(): unknown;
    refetch?(): unknown;
}

function isSource(value: unknown): value is AsyncSource {
    return value !== null && typeof value === 'object'
        && typeof (value as AsyncSource).state === 'function'
        && typeof (value as AsyncSource).data === 'function';
}

/** What `@await` makes of `value`: still waiting, a result, or a failure with no result. */
function outcomeOf(value: unknown): Outcome {
    if (isThenable(value)) {
        let state = promiseStates.get(value);
        if (!state) {
            const s = signal<PromiseState>({ status: 'pending' });
            promiseStates.set(value, s);
            value.then(
                (v) => s.set({ status: 'fulfilled', value: v }),
                (reason) => s.set({ status: 'rejected', reason }),
            );
            state = s;
        }
        const { status, value: resolved, reason } = state();
        if (status === 'rejected') return { kind: 'error', error: reason };
        return status === 'fulfilled' ? { kind: 'result', value: resolved } : WAIT;
    }
    if (isSource(value)) {
        const state = value.state();
        const data = value.data();
        // Kept data is a result in any state: a refresh in flight, or one that failed (E4).
        if (data !== undefined || state === 'success') return { kind: 'result', value: data };
        if (state === 'error') {
            return { kind: 'error', error: value.error?.(), refetch: value.refetch ? () => value.refetch!() : undefined };
        }
        return WAIT;
    }
    // A plain value (E5): `undefined` is not there yet, `false` a condition not yet met.
    if (value === undefined || value === false) return WAIT;
    return { kind: 'result', value };
}

const asError = (reason: unknown): Error => reason instanceof Error ? reason : new Error(String(reason));

/**
 * Whether `@await (value)` has a result: `true` for a result, `false` while waiting, and for a
 * failure it throws the reason as an Error. The same rules as {@link awaitBlock}, as a condition.
 *
 * ⚠️ The expression must yield the SAME promise each time it is evaluated: a call that makes a new
 * promise per evaluation (`@await (fetchUser())`) starts over on every re-run and never settles —
 * store the promise, or use a resource.
 */
export function awaitReady(value: unknown): boolean {
    const o = outcomeOf(value);
    if (o.kind === 'error') throw asError(o.error);
    return o.kind === 'result';
}

/** `@await`'s timing: `minMs` delays `@loading`, `maxMs` is a timeout to `@error`. */
export interface AwaitTiming {
    minMs?: number;
    maxMs?: number;
}

type Branch = 'body' | 'loading' | 'pending' | 'timeout' | { error: unknown };

/**
 * The `@await` block. `source` is read reactively; the block shows:
 *   - the body, given a getter for the result, once there is one — and keeps it through a refresh;
 *   - `@error`, given the error and a retry, for a failure with no result, or when `maxMs` runs out
 *     (an {@link AwaitTimeoutError}); retry calls the source's `refetch()`, or reads the expression
 *     again. Without `error`, a failure throws to the enclosing boundary and a timeout leaves
 *     `@loading` up;
 *   - `@loading` while waiting, after `minMs` when it is set — a result that arrives earlier renders
 *     the body with no spinner frame.
 * The timers start when the block renders, restart when it starts waiting again (a new promise, a
 * source back to pending with no data), and stop when it is removed. With `error`, an exception the
 * body throws while it renders reaches `@error` too.
 *
 * Usage:
 *   ${awaitBlock(() => users, (list) => html`<ul>${…list()…}</ul>`, () => html`<p>Loading…</p>`,
 *       (err, retry) => html`<button @click=${retry}>Retry</button>`, { maxMs: 5000 })}
 */
export function awaitBlock<T = unknown>(
    source: () => unknown,
    thenFn: (value: () => T) => Node | DocumentFragment,
    loadingFn: (() => Node | DocumentFragment | null) | null,
    errorFn: ((error: unknown, retry: () => void) => Node | DocumentFragment) | null,
    options: AwaitTiming = {},
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('await');
    const end = document.createComment('/await');
    frag.appendChild(start);
    frag.appendChild(end);

    const minMs = options.minMs ?? 0;
    const maxMs = options.maxMs ?? 0;

    // Bumped by a retry with no refetch(): the expression is read again.
    const reread = signal(0);
    const current = computed(() => { reread(); return source(); });
    const outcome = computed(() => outcomeOf(current()));
    let last: unknown;
    const value = (): T => {
        const o = outcome();
        if (o.kind === 'result') last = o.value;
        return last as T;
    };

    // ─── Timers ──────────────────────────────────────────────────
    const showLoading = signal(minMs === 0);
    const timedOut = signal(false);
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => { for (const t of timers) clearTimeout(t); timers = []; };
    const restartTimers = () => {
        clearTimers();
        showLoading.set(minMs === 0);
        timedOut.set(false);
        if (minMs > 0) timers.push(setTimeout(() => showLoading.set(true), minMs));
        if (maxMs > 0) timers.push(setTimeout(() => timedOut.set(true), maxMs));
    };
    // The wait being timed: a sentinel while there is none, so the first wait starts the timers.
    const NONE = {};
    let timing: unknown = NONE;
    effect(() => {
        const o = outcome();
        const src = current();
        if (o.kind !== 'wait') { clearTimers(); timing = NONE; return; }
        if (timing === src) return;
        timing = src;
        untracked(restartTimers);
    });

    const retry = (refetch?: () => unknown) => () => {
        if (refetch) refetch();
        else reread.set((n) => n + 1);
        restartTimers();
    };

    // ─── Branches ────────────────────────────────────────────────
    let childDispose: Dispose | null = null;
    let shown: Branch | undefined;

    const make = (branch: Branch): Node | DocumentFragment | null => {
        if (branch === 'body') {
            return errorFn ? errorBoundary(() => thenFn(value), errorFn) : thenFn(value);
        }
        if (branch === 'timeout') {
            return errorFn!(new AwaitTimeoutError(maxMs), retry(isSource(current()) ? () => (current() as AsyncSource).refetch?.() : undefined));
        }
        if (branch === 'loading') return loadingFn?.() ?? document.createComment('await-loading');
        if (branch === 'pending') return document.createComment('await-pending');
        const o = outcome();
        return errorFn!(branch.error, retry(o.kind === 'error' ? o.refetch : undefined));
    };

    effect(() => {
        const o = outcome();
        let branch: Branch;
        if (o.kind === 'result') branch = 'body';
        else if (o.kind === 'error') {
            if (!errorFn) throw asError(o.error);
            branch = { error: o.error };
        } else if (timedOut() && errorFn) branch = 'timeout';
        else branch = showLoading() ? 'loading' : 'pending';

        const same = typeof branch === 'object'
            ? typeof shown === 'object' && Object.is(shown.error, branch.error)
            : branch === shown;
        if (same) return;
        shown = branch;

        const parent = end.parentNode;
        if (!parent) return;
        untracked(() => {
            childDispose?.();
            childDispose = null;
            for (const n of nodesBetween(start, end)) parent.removeChild(n);
            const [content, dispose] = collectDisposers(() => make(branch));
            childDispose = dispose;
            if (!content) return;
            const nodes = content instanceof DocumentFragment ? Array.from(content.childNodes) : [content];
            for (const n of nodes) placePartNode(parent, n, end);
        });
    });

    onDispose(() => { clearTimers(); childDispose?.(); childDispose = null; });

    return frag;
}

/**
 * `@await (condition) { minMs, maxMs }` over a plain condition: {@link awaitBlock} with no value
 * bound and no `@error`, so `maxMs` running out leaves `@loading` up.
 *
 * Usage:
 *   ${awaitTimed(() => ready(), () => html`<main/>`, () => html`<loading/>`, { minMs: 200 })}
 */
export function awaitTimed(
    condition: () => boolean,
    thenFn: () => Node | DocumentFragment,
    loadingFn: (() => Node | DocumentFragment | null) | null,
    options: AwaitTiming,
): DocumentFragment {
    return awaitBlock(condition, () => thenFn(), loadingFn, null, options);
}
