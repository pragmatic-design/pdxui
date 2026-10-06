// Bottom Sheet — draggable sheet with detents (snap points).
// Mobile-first: Select→BottomSheet, Menu→BottomSheet on small screens.
// Uses overlay-stack for z-index, drag for gesture.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export type Detent = number; // 0-1 ratio of viewport height (0.25 = 25%)

export interface BottomSheetOptions {
    /** Snap points as ratio of viewport height. Default: [0.5, 1]. */
    detents?: Detent[];
    /** Initial detent index. Default: 0 (first/smallest). */
    initialDetent?: number;
    /** Show backdrop. Default: true. */
    backdrop?: boolean;
    /** Close on backdrop click. Default: true. */
    closeOnBackdrop?: boolean;
    /** Close on swipe below minimum detent. Default: true. */
    closeOnSwipeDown?: boolean;
    /** Minimum velocity (px/s) to trigger snap/close. Default: 300. */
    velocityThreshold?: number;
    /** Called when the sheet closes. */
    onClose?: () => void;
    /** Called when detent changes. */
    onDetentChange?: (detent: Detent) => void;
}

export interface BottomSheetReturn {
    /** Whether the sheet is open (reactive). */
    isOpen: ReadonlySignal<boolean>;
    /** Current height in px (reactive). */
    height: ReadonlySignal<number>;
    /** Current detent (reactive). */
    currentDetent: ReadonlySignal<Detent>;
    /** Whether the user is dragging (reactive). */
    isDragging: ReadonlySignal<boolean>;
    /** Open the sheet. */
    open(detent?: number): void;
    /** Close the sheet. */
    close(): void;
    /** Snap to a specific detent index. */
    snapTo(detentIndex: number): void;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── useBottomSheet ───────────────────────────────────────────

/**
 * A drag-to-dismiss bottom sheet with snap points.
 *
 * `detents` are fractions of the viewport height (`[0.5, 1]` = half and full) and the sheet settles
 * on the nearest one. The release is decided by VELOCITY as well as position: a quick flick past
 * `velocityThreshold` moves a detent even if the finger did not travel far, which is what makes the
 * gesture feel native rather than sticky.
 */
export function useBottomSheet(
    el: () => HTMLElement | null,
    options?: BottomSheetOptions,
): BottomSheetReturn {
    const detents = options?.detents ?? [0.5, 1];
    const velocityThreshold = options?.velocityThreshold ?? 300;
    const closeOnSwipeDown = options?.closeOnSwipeDown ?? true;

    const _isOpen = signal(false);
    const _height = signal(0);
    const _currentDetent = signal(detents[0]);
    const _isDragging = signal(false);

    let sheetEl: HTMLElement | null = null;
    let backdropEl: HTMLElement | null = null;
    let startY = 0;
    let startHeight = 0;
    let lastY = 0;
    let lastTime = 0;

    function getVh(): number {
        return isBrowser ? window.innerHeight : 800;
    }

    function snapToNearest(h: number, velocity: number): void {
        const vh = getVh();
        const ratio = h / vh;

        // If swiping down fast and below min detent, close
        if (closeOnSwipeDown && velocity > velocityThreshold && ratio < detents[0]) {
            close();
            return;
        }

        // Find closest detent
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < detents.length; i++) {
            const dist = Math.abs(detents[i] - ratio);
            // Factor velocity into the snap decision
            const adjusted = velocity > velocityThreshold
                ? dist - (velocity > 0 ? 0.1 : -0.1)
                : dist;
            if (adjusted < closestDist) {
                closestDist = adjusted;
                closestIdx = i;
            }
        }

        snapTo(closestIdx);
    }

    function applyHeight(h: number, animate: boolean): void {
        _height.set(h);
        if (sheetEl) {
            sheetEl.style.height = `${h}px`;
            sheetEl.style.transition = animate ? 'height 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
        }
    }

    // Drag handlers
    function onPointerDown(e: PointerEvent): void {
        // Only handle the drag handle area (top 32px of sheet)
        const rect = sheetEl?.getBoundingClientRect();
        if (!rect || e.clientY < rect.top || e.clientY > rect.top + 40) return;

        e.preventDefault();
        _isDragging.set(true);
        startY = e.clientY;
        startHeight = _height.peek();
        lastY = e.clientY;
        lastTime = performance.now();

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e: PointerEvent): void {
        const dy = startY - e.clientY; // positive = drag up = increase height
        const newHeight = Math.max(0, Math.min(getVh(), startHeight + dy));
        applyHeight(newHeight, false);
        lastY = e.clientY;
        lastTime = performance.now();
    }

    function onPointerUp(e: PointerEvent): void {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        _isDragging.set(false);

        const dt = (performance.now() - lastTime) / 1000;
        const velocity = dt > 0 ? (lastY - e.clientY) / dt : 0; // negative = swipe down

        snapToNearest(_height.peek(), -velocity);
    }

    function open(detentIdx?: number): void {
        const idx = detentIdx ?? (options?.initialDetent ?? 0);
        _isOpen.set(true);
        if (sheetEl) {
            sheetEl.style.display = 'block';
            sheetEl.style.position = 'fixed';
            sheetEl.style.bottom = '0';
            sheetEl.style.left = '0';
            sheetEl.style.right = '0';
            sheetEl.style.zIndex = '1050';
        }
        if (options?.backdrop !== false) showBackdrop();
        // Start from 0 and animate to detent
        applyHeight(0, false);
        requestAnimationFrame(() => snapTo(idx));
    }

    function close(): void {
        applyHeight(0, true);
        setTimeout(() => {
            _isOpen.set(false);
            _height.set(0);
            if (sheetEl) sheetEl.style.display = 'none';
            hideBackdrop();
            options?.onClose?.();
        }, 300);
    }

    function snapTo(detentIndex: number): void {
        const d = detents[Math.max(0, Math.min(detentIndex, detents.length - 1))];
        const h = d * getVh();
        _currentDetent.set(d);
        applyHeight(h, true);
        options?.onDetentChange?.(d);
    }

    function showBackdrop(): void {
        if (!isBrowser || backdropEl) return;
        backdropEl = document.createElement('div');
        backdropEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1040;transition:opacity 300ms;';
        if (options?.closeOnBackdrop !== false) {
            backdropEl.addEventListener('click', close);
        }
        document.body.appendChild(backdropEl);
    }

    function hideBackdrop(): void {
        if (backdropEl) { backdropEl.remove(); backdropEl = null; }
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;
            sheetEl = target;
            target.style.display = 'none';
            target.addEventListener('pointerdown', onPointerDown);

            return () => {
                target.removeEventListener('pointerdown', onPointerDown);
                hideBackdrop();
            };
        });
    }

    return {
        isOpen: _isOpen as ReadonlySignal<boolean>,
        height: _height as ReadonlySignal<number>,
        currentDetent: _currentDetent as ReadonlySignal<Detent>,
        isDragging: _isDragging as ReadonlySignal<boolean>,
        open,
        close,
        snapTo,
        dispose: () => {
            cleanupEffect?.();
            hideBackdrop();
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        },
    };
}
