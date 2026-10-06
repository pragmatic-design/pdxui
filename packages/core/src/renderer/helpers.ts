// Declarative helpers for html`` inline templates.
// Zero compilation — pure JS functions that return reactive DOM.

import { DEV } from '../utils/env';
import { effect, signal, collectDisposers, onDispose } from '../reactivity/signal';
import { repeat, repeatRows } from './list';
import { insertWithTransition, removeWithTransition, enter, exit } from './transitions';
import { placePartNode } from './part-nodes';
import type { Dispose } from '../utils/types';

/**
 * Collect every node currently between two markers (exclusive). Used for teardown so that
 * nodes appended AFTER the initial render — e.g. rows added by a nested each() — are also
 * removed. A captured snapshot taken at render time would miss them.
 */
export function nodesBetween(start: Node, end: Node): Node[] {
    const out: Node[] = [];
    let n = start.nextSibling;
    while (n && n !== end) { out.push(n); n = n.nextSibling; }
    return out;
}

/** Options for transition choreography. */
export interface TransitionOptions {
    enter?: string;
    exit?: string;
    move?: string;
    /** Delay increment per item (ms) for staggered list animations. */
    stagger?: number;
    /** Transition sequencing: 'simultaneous' (default), 'out-in' (exit before enter), 'in-out'. */
    mode?: 'simultaneous' | 'out-in' | 'in-out';
}

/**
 * Conditional rendering. Reactively shows thenFn or elseFn based on condition.
 * Supports enter/exit transitions when TransitionOptions are provided.
 *
 * Usage:
 *   ${when(() => isOpen(), () => html`<span>Open!</span>`)}
 *   ${when(() => isOpen(), () => html`<span>Yes</span>`, () => html`<span>No</span>`,
 *          { enter: 'fade-in', exit: 'fade-out' })}
 */
export function when(
    condition: () => boolean,
    thenFn: () => Node | DocumentFragment,
    elseFn?: (() => Node | DocumentFragment | null) | null,
    options?: TransitionOptions
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('when');
    const end = document.createComment('/when');
    frag.appendChild(start);
    frag.appendChild(end);

    // Disposer for the effects created inside the currently-rendered branch.
    // Disposed when the branch actually swaps and on teardown — prevents leaked
    // bindings re-running on detached nodes.
    let childDispose: Dispose | null = null;
    // Memoized last-rendered condition. `undefined` = nothing rendered yet.
    let prevShow: boolean | undefined;
    // A generation token: a .then() of an out-in exit overtaken by a more recent run
    // must neither render stale content nor overwrite the disposer.
    let renderGen = 0;

    const render = (parent: Node, show: boolean): void => {
        childDispose?.(); // dispose the branch we're replacing
        childDispose = null;
        const [content, dispose] = collectDisposers(
            () => (show ? thenFn() : (elseFn?.() ?? null)),
        );
        childDispose = dispose;
        if (content) {
            const nodes = content instanceof DocumentFragment
                ? Array.from(content.childNodes)
                : [content];
            insertWithTransition(parent, nodes, end, options);
        }
    };

    effect(() => {
        // Coerce: `prevShow` uses `undefined` as the "nothing rendered yet" sentinel, so a
        // condition that RETURNS undefined would compare equal to it on the first run and
        // return early — rendering NEITHER branch, silently. Templates yield truthy/falsy
        // values, not strict booleans (`@if (obj.maybeMissing)` is ordinary PDX), so this
        // is reachable from plain authoring, not just from a type violation.
        const show = !!condition();
        // Memoize: an unchanged condition must NOT tear down and rebuild the branch.
        // Rebuilding loses input focus/scroll and, with a nested each(), the effect's
        // returned-cleanup would fire on every notification, thrashing the whole subtree.
        if (show === prevShow) return;
        prevShow = show;

        const gen = ++renderGen;
        const parent = end.parentNode;
        if (!parent) return;

        const mode = options?.mode ?? 'simultaneous';
        // Remove EVERYTHING currently between the markers — not a captured snapshot — so
        // nodes appended later by a nested each()/when() are removed too.
        const oldNodes = nodesBetween(start, end);

        if (oldNodes.length > 0 && mode === 'out-in') {
            // Sequenced: exit old, THEN enter new (only if this run is still the latest).
            childDispose?.(); childDispose = null;
            removeWithTransition(oldNodes, options).then(() => {
                if (gen !== renderGen) return; // superseded
                const newParent = end.parentNode;
                if (newParent) render(newParent, show);
            });
            return;
        }

        // Default: simultaneous exit + enter.
        if (oldNodes.length > 0) removeWithTransition(oldNodes, options);
        render(parent, show);
    });

    // Final teardown: dispose the current branch when the enclosing scope is removed.
    // No per-re-run cleanup — that would fight the memoization above.
    onDispose(() => { renderGen++; childDispose?.(); childDispose = null; });

    return frag;
}

type PromiseState = { status: 'pending' | 'fulfilled' | 'rejected'; reason?: unknown };

/** One state signal per promise, so every evaluation of the same `@await` reads the same state. */
const _promiseStates = new WeakMap<object, ReturnType<typeof signal<PromiseState>>>();

/**
 * The condition `@await` switches on — for a promise, whether it has settled.
 *
 * A plain truthiness switch (`when(() => x, …)`) cannot serve `@await (x)`: a Promise object is
 * always truthy, and the body would render at once and forever, pending or rejected. So:
 *   - a thenable → `false` while pending, `true` once fulfilled, and when it REJECTS this throws the
 *     reason (as an Error) — which the error boundary the compiler emits for `@error` catches;
 *   - anything else → its truthiness, so `@await (appReady)` is a plain condition.
 *
 * ⚠️ The expression must yield the SAME promise each time it is evaluated. A call that makes a new
 * promise per evaluation (`@await (fetchUser())`) starts over on every re-run and never settles —
 * store the promise, or use a resource.
 */
export function awaitReady(value: unknown): boolean {
    const thenable = value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof (value as { then?: unknown }).then === 'function';
    if (!thenable) return !!value;

    let state = _promiseStates.get(value as object);
    if (!state) {
        const s = signal<PromiseState>({ status: 'pending' });
        _promiseStates.set(value as object, s);
        (value as PromiseLike<unknown>).then(
            () => s.set({ status: 'fulfilled' }),
            (reason) => s.set({ status: 'rejected', reason }),
        );
        state = s;
    }
    const { status, reason } = state();
    if (status === 'rejected') throw reason instanceof Error ? reason : new Error(String(reason));
    return status === 'fulfilled';
}

/**
 * Timed conditional rendering for @await { minMs, maxMs }.
 * - minMs: don't show loading until this delay (avoid flash for fast loads)
 * - maxMs: force timeout error after this duration
 *
 * Usage:
 *   ${awaitTimed(() => ready(), () => html`<main/>`, () => html`<loading/>`, { minMs: 200 })}
 */
export function awaitTimed(
    condition: () => boolean,
    thenFn: () => Node | DocumentFragment,
    loadingFn: (() => Node | DocumentFragment | null) | null,
    options: { minMs?: number; maxMs?: number },
): DocumentFragment {
    const minMs = options.minMs ?? 0;
    const _showLoading = signal(minMs === 0); // delay loading display if minMs > 0
    const _timedOut = signal(false);

    // Delayed loading: only show after minMs. The timers are cancelled when the scope
    // tears down: they must not write signals after the unmount.
    if (minMs > 0) {
        const t = setTimeout(() => { _showLoading.set(true); }, minMs);
        onDispose(() => clearTimeout(t));
    }

    // Timeout: force timed-out state
    if (options.maxMs) {
        const t = setTimeout(() => { _timedOut.set(true); }, options.maxMs);
        onDispose(() => clearTimeout(t));
    }

    return when(
        () => condition() || _timedOut(),
        thenFn,
        // A SECOND when(), not an if() inside this branch: the outer when memoises on its own
        // condition and does not re-run the else branch when `_showLoading` flips, so the
        // delayed spinner would never appear at all — `minMs` would show a blank screen for the
        // whole slow load it exists to cover. The inner when has its own condition, and its own
        // re-render.
        () => when(
            () => _showLoading(),
            // `?? `, not a ternary: loadingFn may be absent AND may itself return null.
            () => loadingFn?.() ?? document.createComment('await-loading'),
            // Within the minMs window — show nothing, so a fast load never flashes a spinner.
            () => document.createComment('await-pending'),
        ),
    );
}

/**
 * Keyed list rendering with string key support.
 * Thin wrapper over repeat() with friendlier API.
 *
 * Usage:
 *   ${each(() => items(), 'id', (item) => html`<div>${item.name}</div>`)}
 *   ${each(() => items(), (item) => item.id, (item) => html`<div>${item.name}</div>`)}
 */
export function each<T>(
    items: () => T[],
    key: string | ((item: T, index: number) => unknown),
    renderFn: (item: T, index: number) => Node,
    options?: TransitionOptions
): DocumentFragment {
    const keyFn = typeof key === 'string'
        ? (item: T) => (item as Record<string, unknown>)[key]
        : key;
    return repeat(items, keyFn, renderFn, options ? { transitions: options } : undefined);
}

/**
 * Keyed list whose rows see their CURRENT item — what `@for` compiles to.
 *
 * Like {@link each}, but `renderFn` receives getters: `item()` and `index()`. A row reused for the
 * same key keeps its DOM node, and its getters move to the new object and position, so an immutable
 * update (`rows.map(r => r.id === id ? { ...r, done: true } : r)`) reaches the row's bindings. With
 * `each()` the row's closures keep the object it was created with. Read the getters
 * inside a binding (`${() => item().name}`) — a read while the row is built is a snapshot.
 */
export function eachRow<T>(
    items: () => T[],
    key: string | ((item: T, index: number) => unknown),
    renderFn: (item: () => T, index: () => number) => Node,
    options?: TransitionOptions
): DocumentFragment {
    const keyFn = typeof key === 'string'
        ? (item: T) => (item as Record<string, unknown>)[key]
        : key;
    return repeatRows(items, keyFn, renderFn, options ? { transitions: options } : undefined);
}

/**
 * Switch/case rendering. Reactively renders the matching case.
 * Use `_` key as default/fallback case.
 *
 * Usage:
 *   ${match(() => status(), {
 *       active: () => html`<span class="green">Active</span>`,
 *       inactive: () => html`<span class="red">Inactive</span>`,
 *       _: () => html`<span>Unknown</span>`,
 *   })}
 */
export function match<T extends string | number>(
    value: () => T,
    cases: Record<string, () => Node | DocumentFragment> & { _?: () => Node | DocumentFragment }
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('match');
    const end = document.createComment('/match');
    frag.appendChild(start);
    frag.appendChild(end);

    let childDispose: Dispose | null = null;
    // Memoized last-rendered case key. `undefined` = nothing rendered yet.
    let prevKey: string | undefined;

    effect(() => {
        const key = String(value());
        // Memoize: same case → keep the branch alive. Its internal bindings update
        // on their own; rebuilding would lose focus/scroll and thrash nested lists.
        if (key === prevKey) return;
        prevKey = key;

        const parent = end.parentNode;
        if (!parent) return;

        // Dispose the previous case, then remove EVERYTHING between the markers (live, not a
        // snapshot) so nested-list nodes go too, and removeChild never hits an already-detached
        // node → no NotFoundError.
        childDispose?.(); childDispose = null;
        for (const n of nodesBetween(start, end)) parent.removeChild(n);

        // Render matching case (or default)
        const caseFn = (cases as Record<string, (() => Node | DocumentFragment) | undefined>)[key] ?? cases._;
        if (caseFn) {
            const [content, dispose] = collectDisposers(() => caseFn());
            childDispose = dispose;
            const nodes = content instanceof DocumentFragment
                ? Array.from(content.childNodes)
                : [content];
            for (const n of nodes) placePartNode(parent, n, end);
        }
    });

    // Final teardown: dispose the current case when the enclosing scope is removed.
    onDispose(() => { childDispose?.(); childDispose = null; });

    return frag;
}

/**
 * Show/hide without removing from DOM. Toggles display:none.
 * Unlike when(), preserves element state (scroll, canvas, form values).
 *
 * Usage:
 *   ${show(() => isVisible(), html`<div class="panel">...</div>`)}
 */
export function show(
    condition: () => boolean,
    content: Node | DocumentFragment
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const nodes = content instanceof DocumentFragment
        ? Array.from(content.childNodes)
        : [content];

    for (const n of nodes) frag.appendChild(n);

    // Toggle display on all root nodes
    effect(() => {
        const visible = condition();
        for (const n of nodes) {
            if (n instanceof HTMLElement) {
                n.style.display = visible ? '' : 'none';
            }
        }
    });

    return frag;
}

/**
 * Render content into a different DOM location (teleport).
 * Keeps reactivity and component context intact.
 *
 * Usage:
 *   ${portal(() => html`<div class="modal">...</div>`, 'body')}
 *   ${portal(() => html`<div class="tooltip">...</div>`, '#tooltip-root')}
 */
export interface PortalOptions {
    /** CSS animation class for enter transition (e.g. 'fade-in'). */
    enter?: string;
    /** CSS animation class for exit transition (e.g. 'fade-out'). */
    exit?: string;
}

/**
 * Render content into a different part of the document, while it stays owned by the component that
 * declared it.
 *
 * For anything that must escape an ancestor's `overflow: hidden`, `transform` or stacking context —
 * a dropdown inside a scrolling panel, a modal inside a card. The content is created here, so its
 * effects are disposed with this subtree even though the nodes live elsewhere; that ownership is the
 * reason to use this rather than `document.body.appendChild`.
 *
 * `enter`/`exit` name CSS classes for the transitions.
 */
export function portal(
    contentFn: () => Node | DocumentFragment,
    target: string | Element,
    options?: PortalOptions,
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const marker = document.createComment('portal');
    frag.appendChild(marker);

    // The target may appear AFTER the mount (an async route/layout): without a retry
    // the effect would exit without tracking anything and never try again.
    const _retry = signal(0);
    let tries = 0;

    effect(() => {
        _retry();
        const targetEl = typeof target === 'string'
            ? document.querySelector(target)
            : target;
        if (!targetEl) {
            if (typeof target === 'string' && tries < 60) {
                tries++;
                requestAnimationFrame(() => _retry.set(v => v + 1));
            } else {
                if (DEV) console.warn(`[pdx] portal: target "${String(target)}" not found`);
            }
            return;
        }
        tries = 0;

        // An ownership scope: the effects created by the content are disposed
        // on re-run and on teardown — without it, they would run forever on detached nodes.
        const [content, dispose] = collectDisposers(() => contentFn());
        const nodes = content instanceof DocumentFragment
            ? Array.from(content.childNodes)
            : [content];
        for (const n of nodes) targetEl.appendChild(n);

        // The enter/exit of transitions.ts have a timeout fallback: without a real
        // CSS transition the node is removed and cleaned up all the same.
        if (options?.enter) {
            for (const n of nodes) enter(n, options.enter);
        }

        return () => {
            dispose();
            if (options?.exit) {
                for (const n of nodes) exit(n, options.exit!);
            } else {
                for (const n of nodes) n.parentNode?.removeChild(n);
            }
        };
    });

    return frag;
}

// dynamic() is now in renderer/dynamic.ts with enhanced features.
// Re-export for backward compatibility.
export { dynamic } from './dynamic';
export type { DynamicOptions } from './dynamic';

/**
 * Value transformation chain. Applies transforms left-to-right.
 *
 * Usage:
 *   ${pipe(item.price, currency, compact)}
 *   :text=${() => pipe(name(), uppercase, truncate(20))}
 */
// Variadic transform chain: each transform's input is the prior's output, so a
// precise type would need heavy overloads — `any` is the pragmatic transform type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pipe<T>(value: T, ...transforms: ((v: any) => any)[]): unknown {
    return transforms.reduce((v, fn) => fn(v), value as unknown);
}
