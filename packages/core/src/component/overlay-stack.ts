// Overlay stack — z-index management, portal, backdrop, dismiss coordination.
// Used by: Dialog, Drawer, Toast, Popover, Tooltip, ContextMenu, BottomSheet.

import { signal, computed, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface OverlayOptions {
    /** Whether the overlay is modal (locks body scroll, shows backdrop). */
    modal?: boolean;
    /** The overlay element — used for swipe-down dismiss on mobile. */
    element?: HTMLElement;
}

export interface OverlayEntry {
    id: string;
    zIndex: number;
    modal: boolean;
}

export interface OverlayStack {
    /** Push an overlay onto the stack. Returns the assigned z-index. */
    push(id: string, options?: OverlayOptions): number;
    /** Remove an overlay from the stack. */
    pop(id: string): void;
    /** Get the ID of the topmost overlay, or null if empty. */
    top(): string | null;
    /** Check if the given overlay is the topmost. */
    isTop(id: string): boolean;
    /** Number of active overlays (reactive). */
    count: ReadonlySignal<number>;
    /** Number of modal overlays (reactive, for body scroll lock). */
    modalCount: ReadonlySignal<number>;
    /** Register a callback invoked when the top overlay should be dismissed (Escape). */
    onDismissTop(callback: () => void): Dispose;
    /** Get all entries (readonly snapshot). */
    entries(): readonly OverlayEntry[];
}

// ─── Z-index constants ─────────────────────────────────────────

const Z_BASE = 1000;
const Z_INCREMENT = 10;

// ─── Singleton stack ───────────────────────────────────────────

const _stack = signal<OverlayEntry[]>([]);
const _dismissCallbacks = new Map<string, () => void>();
// A monotonic counter: a z-index taken from stack.length repeats itself after an
// out-of-order pop (two overlays with the same z, a random paint order).
let _zCounter = 0;

const _count = computed(() => _stack().length);
const _modalCount = computed(() => _stack().filter(e => e.modal).length);

// Body scroll lock — effect reacts to modalCount changes
if (isBrowser) {
    effect(() => {
        const body = document.body;
        if (!body) return; // guard for test teardown (happy-dom)
        if (_modalCount() > 0) {
            body.style.overflow = 'hidden';
        } else {
            body.style.overflow = '';
        }
    });
}

// Global Escape handler — notifies only the topmost overlay
if (isBrowser) {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        const stack = _stack.peek();
        if (stack.length === 0) return;

        const topEntry = stack[stack.length - 1];
        const cb = _dismissCallbacks.get(topEntry.id);
        if (cb) {
            e.preventDefault();
            e.stopPropagation();
            cb();
        }
    });
}

function push(id: string, options?: OverlayOptions): number {
    const current = _stack.peek();
    // Prevent duplicate
    if (current.some(e => e.id === id)) {
        const existing = current.find(e => e.id === id)!;
        return existing.zIndex;
    }

    const zIndex = Z_BASE + (_zCounter++) * Z_INCREMENT;
    const entry: OverlayEntry = { id, zIndex, modal: options?.modal ?? false };
    _stack.set([...current, entry]);
    return zIndex;
}

function pop(id: string): void {
    _stack.set(prev => prev.filter(e => e.id !== id));
    _dismissCallbacks.delete(id);
}

function top(): string | null {
    const stack = _stack.peek();
    return stack.length > 0 ? stack[stack.length - 1].id : null;
}

function isTop(id: string): boolean {
    return top() === id;
}

function onDismissTop(callback: () => void): Dispose {
    // Register for current top — recalculated on each call
    const id = top();
    if (!id) return () => {};
    _dismissCallbacks.set(id, callback);
    // The dispose removes ONLY if the registered callback is still its own:
    // without the check, disposing an old registration would delete the new one
    // with the same id.
    return () => {
        if (_dismissCallbacks.get(id) === callback) _dismissCallbacks.delete(id);
    };
}

function entries(): readonly OverlayEntry[] {
    return _stack.peek();
}

/** Global overlay stack — manages z-index, Escape dismiss, body scroll lock. */
export const overlayStack: OverlayStack = {
    push,
    pop,
    top,
    isTop,
    count: _count,
    modalCount: _modalCount,
    onDismissTop,
    entries,
};

// ─── Portal ────────────────────────────────────────────────────

export interface PortalResult {
    /** The portal container element. */
    el: HTMLElement;
    /** Remove the portal from the DOM and clean up. */
    dispose: Dispose;
}

/**
 * Create a portal: mount content into a target container (default: document.body).
 * Returns the wrapper element and a dispose function.
 */
export function createPortal(
    content: Node,
    target?: string | HTMLElement,
): PortalResult {
    if (!isBrowser) {
        return { el: {} as HTMLElement, dispose: () => {} };
    }

    const container = document.createElement('div');
    container.setAttribute('data-pdx-portal', '');
    container.appendChild(content);

    const parent = typeof target === 'string'
        ? document.querySelector<HTMLElement>(target) ?? document.body
        : target ?? document.body;

    parent.appendChild(container);

    return {
        el: container,
        dispose: () => { container.remove(); },
    };
}

// ─── Backdrop ──────────────────────────────────────────────────

export interface BackdropOptions {
    /** Apply backdrop-filter: blur effect. Default: false. */
    blur?: boolean;
    /** Click handler for the backdrop (usually to dismiss). */
    onClick?: () => void;
    /** Z-index for the backdrop element. */
    zIndex?: number;
}

export interface BackdropResult {
    /** The backdrop DOM element. */
    el: HTMLElement;
    /** Remove the backdrop and clean up. */
    dispose: Dispose;
}

/**
 * Create a backdrop overlay element with optional blur and click handler.
 */
export function createBackdrop(options?: BackdropOptions): BackdropResult {
    if (!isBrowser) {
        return { el: {} as HTMLElement, dispose: () => {} };
    }

    const el = document.createElement('div');
    el.setAttribute('data-pdx-backdrop', '');
    el.setAttribute('aria-hidden', 'true');

    // Inline styles — minimal, consumer can override via CSS
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.zIndex = String(options?.zIndex ?? Z_BASE - 1);
    el.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';

    if (options?.blur) {
        el.style.backdropFilter = 'blur(4px)';
    }

    const onClick = options?.onClick;
    if (onClick) {
        el.addEventListener('pointerdown', (e) => {
            if (e.target === el) onClick();
        });
    }

    document.body.appendChild(el);

    return {
        el,
        dispose: () => { el.remove(); },
    };
}

// ─── Click-outside (stack-aware) ───────────────────────────────

// ─── Mobile: Safe Area ────────────────────────────────────────

/**
 * Apply safe area insets to an overlay element (for notch, home indicator).
 * Sets CSS environment variables as padding.
 */
export function applySafeArea(el: HTMLElement): void {
    if (!isBrowser) return;
    el.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    el.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    el.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
    el.style.paddingRight = 'env(safe-area-inset-right, 0px)';
}

// ─── Mobile: Swipe-down dismiss ───────────────────────────────

/**
 * Enable swipe-down gesture to dismiss an overlay.
 * The overlay moves down with the finger; if swiped past threshold, it's dismissed.
 * Returns a Dispose function to remove listeners.
 */
export function swipeDownDismiss(
    el: HTMLElement,
    onDismiss: () => void,
    threshold = 100,
): Dispose {
    if (!isBrowser) return () => {};

    let startY = 0;
    let currentY = 0;
    let dragging = false;
    // The dismiss is scheduled 200ms out so the slide-away can finish. Held, so dispose() can
    // cancel it: the overlay may be closed some other way in between — or the component unmounted —
    // and onDismiss would then fire on something already gone.
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    function onTouchStart(e: TouchEvent): void {
        // Only from top 60px of the overlay (grab area)
        const rect = el.getBoundingClientRect();
        const touchY = e.touches[0].clientY;
        if (touchY - rect.top > 60) return;
        startY = touchY;
        currentY = touchY;
        dragging = true;
        el.style.transition = 'none';
    }

    function onTouchMove(e: TouchEvent): void {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        const dy = Math.max(0, currentY - startY); // only downward
        el.style.transform = `translateY(${dy}px)`;
        if (dy > 0) e.preventDefault();
    }

    function onTouchEnd(): void {
        if (!dragging) return;
        dragging = false;
        const dy = currentY - startY;
        el.style.transition = 'transform 200ms ease-out';
        if (dy > threshold) {
            el.style.transform = `translateY(100%)`;
            dismissTimer = setTimeout(() => { dismissTimer = null; onDismiss(); }, 200);
        } else {
            el.style.transform = '';
        }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
        if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    };
}

// ─── Mobile: Bottom Sheet adapter ─────────────────────────────

export interface BottomSheetOptions {
    /** Snap points as fractions of viewport height. Default: [0.5, 1.0]. */
    detents?: number[];
    /** Initial detent index. Default: 0. */
    initialDetent?: number;
    /** Called on dismiss (swipe below first detent). */
    onDismiss?: () => void;
}

export interface BottomSheetResult {
    /** The bottom sheet container element. */
    el: HTMLElement;
    /** Current detent index (reactive). */
    detent: ReadonlySignal<number>;
    /** Cleanup. */
    dispose: Dispose;
}

/**
 * Create a bottom sheet (mobile-optimized overlay).
 * Fixed to bottom, draggable between detent points, swipe-down to dismiss.
 */
export function createBottomSheet(
    content: Node,
    options?: BottomSheetOptions,
): BottomSheetResult {
    if (!isBrowser) {
        return { el: {} as HTMLElement, detent: signal(0) as ReadonlySignal<number>, dispose: () => {} };
    }

    const detents = options?.detents ?? [0.5, 1.0];
    const _detent = signal(options?.initialDetent ?? 0);

    const el = document.createElement('div');
    el.setAttribute('data-pdx-bottomsheet', '');
    el.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:${Z_BASE + 100};background:var(--pdx-color-bg, white);color:var(--pdx-color-text, inherit);border-radius:12px 12px 0 0;box-shadow:var(--pdx-shadow-lg, 0 -4px 24px rgba(0,0,0,0.15));transition:transform 300ms ease-out;touch-action:none;max-height:95vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,0px)`;

    // Drag handle area — larger touch target for mobile
    const handleArea = document.createElement('div');
    handleArea.style.cssText = 'padding:12px 0 8px;cursor:grab;touch-action:none';
    const handle = document.createElement('div');
    handle.style.cssText = 'width:36px;height:4px;background:var(--pdx-gray-300, #ccc);border-radius:2px;margin:0 auto';
    handleArea.appendChild(handle);
    el.appendChild(handleArea);
    el.appendChild(content);

    // The viewport height is read on every use: capturing it once throws the detents off
    // after a resize or a rotation.
    const vh = () => window.innerHeight;
    el.style.height = `${detents[_detent.peek()] * vh()}px`;

    document.body.appendChild(el);

    // Swipe gesture for detents — PointerEvents for unified touch/mouse/pen
    let startY = 0;
    let startHeight = 0;
    let dragging = false;

    function onPointerDown(e: PointerEvent): void {
        startY = e.clientY;
        startHeight = el.offsetHeight;
        dragging = true;
        el.style.transition = 'none';
        handleArea.setPointerCapture(e.pointerId);
        handleArea.style.cursor = 'grabbing';
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragging) return;
        const dy = startY - e.clientY;
        const newHeight = Math.max(0, startHeight + dy);
        el.style.height = `${newHeight}px`;
    }

    function onPointerUp(e: PointerEvent): void {
        if (!dragging) return;
        dragging = false;
        handleArea.releasePointerCapture(e.pointerId);
        handleArea.style.cursor = 'grab';
        el.style.transition = 'height 300ms ease-out';
        const currentH = el.offsetHeight;
        const currentFrac = currentH / vh();

        // Dismiss if below first detent * 0.5
        if (currentFrac < detents[0] * 0.5) {
            el.style.height = '0px';
            setTimeout(() => { el.remove(); options?.onDismiss?.(); }, 300);
            return;
        }

        let closest = 0;
        let minDist = Math.abs(currentFrac - detents[0]);
        for (let i = 1; i < detents.length; i++) {
            const dist = Math.abs(currentFrac - detents[i]);
            if (dist < minDist) { minDist = dist; closest = i; }
        }
        _detent.set(closest);
        el.style.height = `${detents[closest] * vh()}px`;
    }

    handleArea.addEventListener('pointerdown', onPointerDown);
    handleArea.addEventListener('pointermove', onPointerMove);
    handleArea.addEventListener('pointerup', onPointerUp);

    return {
        el,
        detent: _detent as ReadonlySignal<number>,
        dispose: () => { el.remove(); },
    };
}

// ─── Click-outside (stack-aware) ───────────────────────────────

/**
 * Stack-aware click-outside detection.
 * Only fires if the click is outside the element AND the overlay is still on top.
 */
export function onClickOutsideStack(
    overlayId: string,
    element: HTMLElement,
    handler: () => void,
): Dispose {
    if (!isBrowser) return () => {};

    function onClick(e: PointerEvent): void {
        // Only fire if this overlay is the topmost
        if (!isTop(overlayId)) return;
        if (element.contains(e.target as Node)) return;
        handler();
    }

    // Delay to avoid catching the triggering click
    const raf = requestAnimationFrame(() => {
        document.addEventListener('pointerdown', onClick, true);
    });

    return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('pointerdown', onClick, true);
    };
}
