// CSS-based transition choreography for enter/exit/move animations.
// Applies CSS classes during lifecycle, removed after transitionend.
//
// Built-in animations: fade-in, fade-out, slide-left/right/up/down,
// scale-in, scale-out, collapse.
//
// Class lifecycle:
//   Enter: .pdx-enter-from → .pdx-enter-active → (transitionend) → remove classes
//   Exit:  .pdx-exit-from → .pdx-exit-active → (transitionend) → remove node

import type { TransitionOptions } from './helpers';
import { placePartNode } from './part-nodes';

// ─── Public API ────────────────────────────────────────────────────

/**
 * Apply enter transition to a node. Adds CSS classes, waits for transition, removes classes.
 * Returns a Promise that resolves when the transition completes.
 */
export function enter(node: Node, animation?: string): Promise<void> {
    if (!animation || !(node instanceof HTMLElement)) return Promise.resolve();

    const el = node;
    const cls = animation;

    // Initial state: enter-from + animation class
    el.classList.add(`pdx-${cls}`, 'pdx-enter-from');

    // Force reflow to ensure the from-state is applied before transitioning
    void el.offsetHeight;

    // Transition to enter-active
    el.classList.remove('pdx-enter-from');
    el.classList.add('pdx-enter-active');

    return onTransitionEnd(el).then(() => {
        el.classList.remove(`pdx-${cls}`, 'pdx-enter-active');
    });
}

/**
 * Apply exit transition to a node. Adds CSS classes, waits for transition, then removes the node.
 * Returns a Promise that resolves when the node is removed.
 */
export function exit(node: Node, animation?: string): Promise<void> {
    if (!animation || !(node instanceof HTMLElement)) {
        node.parentNode?.removeChild(node);
        return Promise.resolve();
    }

    const el = node;
    const cls = animation;

    // Initial state
    el.classList.add(`pdx-${cls}`, 'pdx-exit-from');
    void el.offsetHeight;

    // Transition to exit-active
    el.classList.remove('pdx-exit-from');
    el.classList.add('pdx-exit-active');

    return onTransitionEnd(el).then(() => {
        el.parentNode?.removeChild(el);
    });
}

// ─── Transition-aware DOM helpers for when()/each() ────────────────

/**
 * Insert nodes with optional enter transition and stagger delay.
 * Stagger adds incremental transitionDelay per item for cascading animations.
 */
export function insertWithTransition(
    parent: Node,
    nodes: Node[],
    before: Node | null,
    options?: TransitionOptions
): void {
    const stagger = options?.stagger ?? 0;
    for (let i = 0; i < nodes.length; i++) {
        placePartNode(parent, nodes[i], before);
        if (options?.enter) {
            const delay = stagger * i;
            if (delay > 0 && nodes[i] instanceof HTMLElement) {
                (nodes[i] as HTMLElement).style.transitionDelay = `${delay}ms`;
            }
            enter(nodes[i], options.enter).then(() => {
                if (delay > 0 && nodes[i] instanceof HTMLElement) {
                    (nodes[i] as HTMLElement).style.transitionDelay = '';
                }
            });
        }
    }
}

/**
 * Remove nodes with optional exit transition.
 * Returns a Promise that resolves when all exits complete.
 */
export function removeWithTransition(
    nodes: Node[],
    options?: TransitionOptions
): Promise<void> {
    if (!options?.exit) {
        for (const n of nodes) n.parentNode?.removeChild(n);
        return Promise.resolve();
    }

    return Promise.all(
        nodes.map(n => exit(n, options.exit))
    ).then(() => {});
}

// ─── FLIP Animations for List Reorder ──────────────────────────────

interface Rect { left: number; top: number; width: number; height: number; }

/**
 * Record positions of elements before a DOM mutation.
 * Returns a map of element → bounding rect.
 */
export function recordPositions(nodes: Node[]): Map<Element, Rect> {
    const positions = new Map<Element, Rect>();
    for (const n of nodes) {
        if (n instanceof HTMLElement) {
            const rect = n.getBoundingClientRect();
            positions.set(n, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        }
    }
    return positions;
}

/**
 * FLIP animate elements that changed position after a DOM mutation.
 * Compares old positions to new positions and animates the delta.
 *
 * @param oldPositions - Map from recordPositions() before mutation
 * @param nodes - Current nodes after mutation
 * @param duration - Animation duration in ms (default 300)
 */
export function flipAnimate(
    oldPositions: Map<Element, Rect>,
    nodes: Node[],
    duration = 300
): void {
    if (typeof window === 'undefined') return;

    // Phase 1: Batch-read ALL new positions (single layout flush)
    const deltas: { el: HTMLElement; dx: number; dy: number }[] = [];
    for (const n of nodes) {
        if (!(n instanceof HTMLElement)) continue;
        const oldRect = oldPositions.get(n);
        if (!oldRect) continue;

        const newRect = n.getBoundingClientRect();
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;

        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        deltas.push({ el: n, dx, dy });
    }

    if (deltas.length === 0) return;

    // Phase 2: Batch-write transforms (no layout reads here — no thrashing)
    for (const { el, dx, dy } of deltas) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = 'none';
    }

    // Phase 3: Animate back to real position (next frame)
    requestAnimationFrame(() => {
        for (const { el } of deltas) {
            el.style.transition = `transform ${duration}ms ease`;
            el.style.transform = '';

            const cleanup = () => {
                el.style.transition = '';
                el.style.transform = '';
                el.removeEventListener('transitionend', cleanup);
            };
            el.addEventListener('transitionend', cleanup);
            setTimeout(cleanup, duration + 50);
        }
    });
}

// ─── Internal ──────────────────────────────────────────────────────

/** Wait for CSS transitionend (with fallback timeout). */
function onTransitionEnd(el: HTMLElement, timeout = 1000): Promise<void> {
    return new Promise(resolve => {
        let resolved = false;

        const done = () => {
            if (resolved) return;
            resolved = true;
            el.removeEventListener('transitionend', onEnd);
            resolve();
        };

        const onEnd = (e: TransitionEvent) => {
            // Only handle transitions on this element (not children)
            if (e.target === el) done();
        };

        el.addEventListener('transitionend', onEnd);

        // Fallback: resolve after timeout even if no transition fires
        // (e.g., element has no CSS transition defined)
        setTimeout(done, timeout);
    });
}

// ─── Built-in Animation CSS ────────────────────────────────────────
// These CSS rules should be included in the application's stylesheet
// or injected automatically. Here's the reference CSS:
//
// .pdx-fade-in.pdx-enter-from  { opacity: 0; }
// .pdx-fade-in.pdx-enter-active { transition: opacity 200ms ease; }
//
// .pdx-fade-out.pdx-exit-from  { opacity: 1; }
// .pdx-fade-out.pdx-exit-active { opacity: 0; transition: opacity 200ms ease; }
//
// .pdx-slide-right.pdx-enter-from  { transform: translateX(100%); }
// .pdx-slide-right.pdx-enter-active { transition: transform 300ms ease; }
// .pdx-slide-right.pdx-exit-from   { transform: translateX(0); }
// .pdx-slide-right.pdx-exit-active  { transform: translateX(100%); transition: transform 300ms ease; }
//
// (etc. for slide-left, slide-up, slide-down, scale-in, scale-out, collapse)

/** Inject built-in transition CSS into the document (once). SSR-safe. */
let injected = false;

/**
 * Inject the stylesheet the built-in transitions need (fade, slide, scale, collapse), once.
 *
 * Idempotent and SSR-safe: repeated calls do nothing and it is a no-op without a `document`. Call it
 * only if you use the transition class names WITHOUT `@pdxui/design`, which already ships them —
 * otherwise you get the same rules twice.
 */
export function injectTransitionCSS(): void {
    if (injected || typeof document === 'undefined') return;
    injected = true;

    const style = document.createElement('style');
    style.textContent = `
/* ─── Fade ─── */
.pdx-fade-in.pdx-enter-from { opacity: 0; }
.pdx-fade-in.pdx-enter-active { transition: opacity 200ms ease; }
.pdx-fade-out.pdx-exit-from { }
.pdx-fade-out.pdx-exit-active { opacity: 0; transition: opacity 200ms ease; }

/* ─── Slide Right ─── */
.pdx-slide-right.pdx-enter-from { transform: translateX(100%); }
.pdx-slide-right.pdx-enter-active { transition: transform 300ms ease; }
.pdx-slide-right.pdx-exit-active { transform: translateX(100%); transition: transform 300ms ease; }

/* ─── Slide Left ─── */
.pdx-slide-left.pdx-enter-from { transform: translateX(-100%); }
.pdx-slide-left.pdx-enter-active { transition: transform 300ms ease; }
.pdx-slide-left.pdx-exit-active { transform: translateX(-100%); transition: transform 300ms ease; }

/* ─── Slide Up ─── */
.pdx-slide-up.pdx-enter-from { transform: translateY(-100%); }
.pdx-slide-up.pdx-enter-active { transition: transform 300ms ease; }
.pdx-slide-up.pdx-exit-active { transform: translateY(-100%); transition: transform 300ms ease; }

/* ─── Slide Down ─── */
.pdx-slide-down.pdx-enter-from { transform: translateY(100%); }
.pdx-slide-down.pdx-enter-active { transition: transform 300ms ease; }
.pdx-slide-down.pdx-exit-active { transform: translateY(100%); transition: transform 300ms ease; }

/* ─── Scale ─── */
.pdx-scale-in.pdx-enter-from { transform: scale(0); opacity: 0; }
.pdx-scale-in.pdx-enter-active { transition: transform 200ms ease, opacity 200ms ease; }
.pdx-scale-out.pdx-exit-active { transform: scale(0); opacity: 0; transition: transform 200ms ease, opacity 200ms ease; }

/* ─── Collapse ─── */
.pdx-collapse.pdx-enter-from { max-height: 0; overflow: hidden; opacity: 0; }
.pdx-collapse.pdx-enter-active { max-height: 500px; transition: max-height 300ms ease, opacity 300ms ease; }
.pdx-collapse.pdx-exit-active { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 300ms ease, opacity 300ms ease; }
`;
    document.head.appendChild(style);
}
