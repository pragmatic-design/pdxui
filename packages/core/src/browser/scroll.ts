// Scroll composable — reactive scroll state + utilities.

import { DEV } from '../utils/env';
import { signal, computed, effect } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

/** What a route's `@scroll` declaration asks for when it is entered. */
export type ScrollRestoration = 'preserve' | 'top';

export interface ScrollState {
    x: ReadonlySignal<number>;
    y: ReadonlySignal<number>;
    direction: ReadonlySignal<'up' | 'down' | 'idle'>;
    isScrolling: ReadonlySignal<boolean>;
    /**
     * Stop watching.
     *
     * Only the **getter** form has anything to undo: it owns its listener and its effect. The window
     * state and the per-element state are shared between every caller that asked for them, so a
     * dispose there would stop the others, and it does nothing instead.
     */
    dispose(): void;
}

const isBrowser = typeof window !== 'undefined';

/** How long after the last scroll event the state reports the scroll as over. */
const IDLE_MS = 150;

// Shared module-level state (singleton per page)
let _instance: ScrollState | null = null;

// One state per container, so two callers watching the same element share one listener. The stored
// state must never reference the element: the listener closure does, and the element owns the
// listener, so the two die together — but a value that referenced its own key would pin the entry
// here for the module's lifetime, which is the one way a WeakMap does not help.
const _containers = new WeakMap<HTMLElement, ScrollState>();

/** What a scroller is, to this module: a thing with two offsets that tells you when they change. */
interface Scroller {
    listen(onScroll: () => void): () => void;
    readX(): number;
    readY(): number;
}

/** The reactive state, plus the way to point it at a scroller (and at a different one later). */
interface Tracker {
    state: Omit<ScrollState, 'dispose'>;
    /** Start following `source`. Returns the detach. */
    attach(source: Scroller): () => void;
}

/** An element, as a scroller. */
function elementScroller(el: HTMLElement): Scroller {
    return {
        listen(onScroll) {
            el.addEventListener('scroll', onScroll, { passive: true });
            return () => el.removeEventListener('scroll', onScroll);
        },
        readX: () => el.scrollLeft,
        readY: () => el.scrollTop,
    };
}

/** The window, as a scroller. */
const windowScroller: Scroller = {
    listen(onScroll) {
        if (!isBrowser) return () => { /* nothing was attached */ };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    },
    readX: () => (isBrowser ? window.scrollX : 0),
    readY: () => (isBrowser ? window.scrollY : 0),
};

/**
 * Build the reactive state for a scroller that may be replaced.
 *
 * The window and a fixed element attach once and never let go. A getter form re-resolves inside an
 * effect and swaps the source, which is why `attach` exists separately from the signals and returns
 * its own detach.
 */
function createTracker(): Tracker {
    const _x = signal(0);
    const _y = signal(0);
    const _direction = signal<'up' | 'down' | 'idle'>('idle');
    const _isScrolling = signal(false);

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastY = 0;

    const state = {
        x: computed(() => _x()),
        y: computed(() => _y()),
        direction: computed(() => _direction()),
        isScrolling: computed(() => _isScrolling()),
    };

    function attach(source: Scroller): () => void {
        // The new scroller's position is where the state starts, and `lastY` with it: carrying the
        // old element's offset over would report a direction from a comparison that means nothing.
        const readX = source.readX;
        const readY = source.readY;
        _x.set(readX());
        _y.set(readY());
        lastY = readY();

        const detach = source.listen(() => {
            const currentY = readY();
            _x.set(readX());
            _y.set(currentY);

            if (currentY > lastY) {
                _direction.set('down');
            } else if (currentY < lastY) {
                _direction.set('up');
            }
            lastY = currentY;

            _isScrolling.set(true);
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                _isScrolling.set(false);
                _direction.set('idle');
            }, IDLE_MS);
        });

        return () => {
            detach();
            if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
        };
    }

    return { state, attach };
}

/** The state of a scroller that never changes: attached once, and `dispose` has nothing to undo. */
function fixedScroller(source: Scroller): ScrollState {
    const tracker = createTracker();
    tracker.attach(source);
    // A no-op on purpose, and the one case where it has to be: this state is SHARED — the window's
    // singleton, or the one cached per element — so a dispose from one caller would silently stop
    // the others. The getter form, which owns its listener, has a real one.
    return { ...tracker.state, dispose: () => { /* shared state: nothing this caller may undo */ } };
}

/**
 * Reactive scroll state: signals for x, y, direction and isScrolling.
 *
 * With no argument it watches the **window**, as a page-level singleton — every caller gets the same
 * state. Pass an element to watch that element instead, and the state is one per element.
 *
 * Which you need is decided by the layout, not by preference: in an app built on `pdx-app-layout` the
 * window never scrolls (the shell is `overflow: hidden` and `main.pdx-app-main` is `overflow-y: auto`),
 * so `useScroll()` there returns a `y` that never moves.
 *
 * Pass a **getter** — `useScroll(() => box())` — and it attaches itself when the element arrives,
 * which is what a `:ref` signal does at mount, and follows the getter if it later yields a different
 * element. That is the shape the rest of the element-watching composables take (`useDrag`,
 * `useSortable`, `useContainerSize`…), and the reason to prefer it: nothing has to be called from a
 * place where the element already exists. The getter form owns its listener, so it is
 * the one whose `dispose()` does something.
 *
 * `direction` returns to `'idle'` 150 ms after the last event, not when the direction changes.
 */
export function useScroll(
    target?: HTMLElement | (() => HTMLElement | null) | null,
): ScrollState {
    if (typeof target === 'function') {
        const tracker = createTracker();
        let detach: (() => void) | null = null;
        // The getter is READ INSIDE the effect, so a getter that reads a signal — the `:ref` case —
        // re-runs the moment the element is assigned. Reading it once would watch the `null` it
        // found at setup, for ever.
        const stop = effect(() => {
            const el = target();
            detach?.();
            detach = el ? tracker.attach(elementScroller(el)) : null;
        });
        return {
            ...tracker.state,
            dispose: () => { stop(); detach?.(); detach = null; },
        };
    }

    if (DEV && target === null) {
        // `useScroll(document.querySelector('main.pdx-app-main'))` before the shell has mounted. The
        // window state is the wrong answer in exactly the layout that made the caller pass a target,
        // so it is not given silently. A GETTER that answers null is a different thing — the normal
        // state before mount — and says nothing.
        console.warn(
            '[pdx] useScroll(null): no element to watch, falling back to the window. '
            + 'In a pdx-app-layout the window never scrolls — pass a getter, useScroll(() => el), '
            + 'and it attaches when the element arrives.',
        );
    }

    if (target) {
        const existing = _containers.get(target);
        if (existing) return existing;
        const state = fixedScroller(elementScroller(target));
        _containers.set(target, state);
        return state;
    }

    if (_instance) return _instance;
    _instance = fixedScroller(windowScroller);
    return _instance;
}

/**
 * Scroll to a target: CSS selector, element, or Y position.
 */
export function scrollTo(
    target: string | number | Element,
    options?: { behavior?: ScrollBehavior },
): void {
    if (!isBrowser) return;

    const behavior = options?.behavior ?? 'smooth';

    if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior });
    } else if (typeof target === 'string') {
        // CSS selector or #anchor
        const el = document.querySelector(target);
        if (el) {
            el.scrollIntoView({ behavior });
        }
    } else {
        target.scrollIntoView({ behavior });
    }
}

// --- Router scroll restoration helpers ---

/** A saved position: the window's, and the scroll container's when the content had one. */
const scrollPositions = new Map<string, SavedScroll>();

/**
 * The element that scrolls `el`: its nearest ancestor whose computed `overflow-y` is `auto` or
 * `scroll`, or null when that is the window. Resolved on every call, not cached: the layout can
 * change between two navigations. pdx-app-layout scrolls its page inside `.pdx-app-main`, so a
 * restoration that knew only the window would miss it.
 */
function scrollContainerOf(el: Element | null | undefined): HTMLElement | null {
    if (!el) return null;
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const y = getComputedStyle(p).overflowY;
        if (y === 'auto' || y === 'scroll') return p;
    }
    return null;
}

/** New page: the window and the container, if any, both start at the top. */
function scrollToTop(container: HTMLElement | null): void {
    window.scrollTo(0, 0);
    if (container) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
    }
}

type SavedScroll = { x: number; y: number; inner?: { x: number; y: number } };

/** How long a restore keeps waiting for the content to be tall enough. */
const RESTORE_CAP_MS = 2000;

/** The restore still converging on its saved offset, if any: calling it stops it. */
let stopPendingRestore: (() => void) | null = null;
/**
 * Bumped by every save and restore. A restore scheduled for the next frame checks it, so a navigation
 * that lands between the call and that frame is not followed by the old page's offset.
 */
let restoreGeneration = 0;

function cancelPendingRestore(): void {
    restoreGeneration++;
    stopPendingRestore?.();
    stopPendingRestore = null;
}

/**
 * Put an offset back, and keep putting it back as the content changes.
 *
 * Back restores one frame after the route resolves, and the outlet mounts the page after that — a
 * lazy import, then its components — so the container is often still short and the browser clamps
 * the offset: a page left at 600 came back at 495. The content, not a timer, drives the retries: a
 * MutationObserver on the scrolled subtree and a ResizeObserver on its children. It stops when the
 * offset is reached, on the user's own scroll input (wheel, touch, key), when another navigation
 * saves or restores, or after {@link RESTORE_CAP_MS}.
 *
 * `stopWhenReached` is what tells the two callers apart. A SAVED offset is a destination: once the
 * page is tall enough to hold it the work is done. The TOP is not — the first write always reaches
 * it and the browser takes it away a frame later — so `@scroll 'top'` on a traversal passes false
 * and the watch runs until the content settles.
 */
function keepScroll(pos: SavedScroll, container: HTMLElement | null, stopWhenReached: boolean): void {
    const apply = (): void => {
        window.scrollTo(pos.x, pos.y);
        if (container && pos.inner) {
            container.scrollLeft = pos.inner.x;
            container.scrollTop = pos.inner.y;
        }
    };
    const reached = (): boolean => {
        const windowOk = Math.abs(window.scrollY - pos.y) < 1 && Math.abs(window.scrollX - pos.x) < 1;
        const innerOk = !container || !pos.inner
            || (Math.abs(container.scrollTop - pos.inner.y) < 1 && Math.abs(container.scrollLeft - pos.inner.x) < 1);
        return windowOk && innerOk;
    };

    apply();
    // An offset stops the moment it is reached. The TOP is reached by the first write and taken
    // away afterwards, so it has nothing to converge on: it watches until the content settles.
    if (stopWhenReached && reached()) return;

    const root: HTMLElement = container ?? document.body;
    const started = Date.now();
    const userInput = ['wheel', 'touchstart', 'keydown'] as const;
    let mutations: MutationObserver | null = null;
    let resizes: ResizeObserver | null = null;
    let cap: ReturnType<typeof setTimeout> | null = null;

    const stop = (): void => {
        mutations?.disconnect();
        resizes?.disconnect();
        if (cap) clearTimeout(cap);
        for (const type of userInput) window.removeEventListener(type, stop, true);
        if (stopPendingRestore === stop) stopPendingRestore = null;
    };
    const retry = (): void => {
        if (Date.now() - started > RESTORE_CAP_MS) { stop(); return; }
        apply();
        if (stopWhenReached && reached()) stop();
    };
    const observeChildren = (): void => {
        if (!resizes) return;
        for (const child of Array.from(root.children)) resizes.observe(child);
    };

    mutations = new MutationObserver(() => { observeChildren(); retry(); });
    mutations.observe(root, { childList: true, subtree: true, characterData: true });
    if (typeof ResizeObserver !== 'undefined') {
        resizes = new ResizeObserver(retry);
        observeChildren();
    }
    for (const type of userInput) window.addEventListener(type, stop, { capture: true, passive: true });
    cap = setTimeout(stop, RESTORE_CAP_MS);
    stopPendingRestore = stop;
}

/** Percent-decode, or hand back the raw text: an arbitrary URL fragment is not always valid. */
function safeDecode(v: string): string {
    try { return decodeURIComponent(v); } catch { return v; }
}

/**
 * Save current scroll position for a route path.
 * Called by router before navigation. `content` is the element the page renders in (the router
 * outlet): when an ancestor of it scrolls, that container's offset is saved with the window's.
 */
export function saveScrollPosition(path: string, content?: Element | null): void {
    if (!isBrowser) return;
    // The page being left is not the one a pending restore was for.
    cancelPendingRestore();
    const container = scrollContainerOf(content);
    scrollPositions.set(path, {
        x: window.scrollX,
        y: window.scrollY,
        inner: container ? { x: container.scrollLeft, y: container.scrollTop } : undefined,
    });
}

/**
 * Restore scroll position for a route path, or scroll to top.
 * Called by router after navigation, with the same `content` element as {@link saveScrollPosition}.
 */
export function restoreScrollPosition(
    path: string,
    isBack: boolean,
    content?: Element | null,
    behavior?: ScrollRestoration,
): void {
    if (!isBrowser) return;
    cancelPendingRestore();
    const container = scrollContainerOf(content);

    // `@scroll` on the route:
    //
    //   'top'       this page always enters at the top, even on Back. The URL's own `#anchor` still
    //               wins below — an explicit fragment is more specific than a page default.
    //   'preserve'  restore the saved offset even on a FORWARD navigation: you leave a long list,
    //               come back through a link rather than the Back button, and you are where you
    //               were. On Back that is already the behaviour, so read any other way the word
    //               describes the default and the declaration is a no-op by definition.
    const restoring = behavior === 'top' ? false : isBack || behavior === 'preserve';

    const pos = restoring ? scrollPositions.get(path) : undefined;
    if (pos) {
        const generation = restoreGeneration;
        requestAnimationFrame(() => {
            if (generation === restoreGeneration) keepScroll(pos, container, true);
        });
        return;
    }
    // Back with nothing saved for this path leaves the page where it is — the browser has already
    // put it somewhere and there is no better answer. A FORWARD navigation with nothing to restore
    // is a first visit, and goes to the anchor or the top like any other.
    if (isBack && behavior !== 'top') return;

    {
        // Check for hash anchor
        const hash = window.location.hash;
        if (hash) {
            requestAnimationFrame(() => {
                // A malformed fragment (#a..b, #:::) is not a valid CSS selector and throws.
                // Resolve by id first (cheap, safe), then fall back to querySelector guarded.
                //
                // The decode is guarded for the same reason: `decodeURIComponent('%')` throws a
                // URIError, the hash comes from the URL — so it is user input — and this runs
                // inside a requestAnimationFrame callback, where nothing catches it. A URL ending
                // in `#%` would take the navigation down.
                let el: Element | null = null;
                const id = safeDecode(hash.slice(1));
                if (id) el = document.getElementById(id);
                if (!el) {
                    try {
                        el = document.querySelector(hash);
                    } catch {
                        el = null;
                    }
                }
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
                scrollToTop(container);
            });
        } else if (isBack) {
            // Only reachable as `behavior === 'top'`: every other traversal returned above.
            // A traversal is the one case where something else has an opinion about where this page
            // opens: the browser re-anchors the offset it remembers as the content arrives, and a
            // single write loses to it — after `scrollTo(0, 0)` the next scroll event can read 300.
            // Same machine as the restoring branch, same stopping rules (the reader's own scroll,
            // the next navigation, RESTORE_CAP_MS), only aiming at the top.
            keepScroll({ x: 0, y: 0, inner: container ? { x: 0, y: 0 } : undefined }, container, false);
        } else {
            // Forward: nothing contends, so one write is the whole answer. Watching here would
            // override a page that scrolls itself the moment it arrives.
            scrollToTop(container);
        }
    }
}
