// Resize Handle — drag to resize panels/columns.
// Distinct from drag (changes size, not position).
// Used by: Splitter, DataGrid column resize, Drawer resize.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface ResizeHandleOptions {
    /** Resize direction. Default: 'horizontal' (dragging changes width). */
    direction?: 'horizontal' | 'vertical';
    /** Minimum size in px. Default: 50. */
    min?: number;
    /** Maximum size in px. Default: Infinity. */
    max?: number;
    /** Initial size in px. If omitted, reads from the target element. */
    initialSize?: number;
    /** Called during resize with current size. */
    onResize?: (size: number) => void;
    /** Called when resize starts. */
    onResizeStart?: () => void;
    /** Called when resize ends with final size. */
    onResizeEnd?: (size: number) => void;
    /** Reverse direction (drag right = shrink instead of grow). */
    reverse?: boolean;
}

export interface ResizeHandleReturn {
    /** Current size in px (reactive). */
    size: ReadonlySignal<number>;
    /** Whether currently resizing (reactive). */
    isResizing: ReadonlySignal<boolean>;
    /** Programmatically set size. */
    setSize(px: number): void;
    /** Reset to initial size. */
    reset(): void;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── useResizeHandle ──────────────────────────────────────────

/**
 * Attach resize behavior to a handle element.
 * The handle is the draggable grip; the target is the element being resized.
 *
 * @param handle - Getter for the handle element (the grip bar).
 * @param target - Getter for the element being resized.
 */
export function useResizeHandle(
    handle: () => HTMLElement | null,
    target: () => HTMLElement | null,
    options?: ResizeHandleOptions,
): ResizeHandleReturn {
    const direction = options?.direction ?? 'horizontal';
    const minSize = options?.min ?? 50;
    const maxSize = options?.max ?? Infinity;
    const reverse = options?.reverse ?? false;

    const _size = signal(options?.initialSize ?? 0);
    const _isResizing = signal(false);

    let startPointer = 0;
    let startSize = 0;

    function clamp(v: number): number {
        return Math.max(minSize, Math.min(maxSize, v));
    }

    function onPointerDown(e: PointerEvent): void {
        e.preventDefault();
        const t = target();
        if (!t) return;

        _isResizing.set(true);
        options?.onResizeStart?.();

        const rect = t.getBoundingClientRect();
        startSize = direction === 'horizontal' ? rect.width : rect.height;
        startPointer = direction === 'horizontal' ? e.clientX : e.clientY;

        // Read initial size if not provided
        if (_size.peek() === 0) _size.set(startSize);

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }

    function onPointerMove(e: PointerEvent): void {
        const current = direction === 'horizontal' ? e.clientX : e.clientY;
        const delta = reverse ? (startPointer - current) : (current - startPointer);
        const newSize = clamp(startSize + delta);
        _size.set(newSize);
        options?.onResize?.(newSize);
    }

    function onPointerUp(): void {
        _isResizing.set(false);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        options?.onResizeEnd?.(_size.peek());
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const h = handle();
            if (!h) return;

            h.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
            h.addEventListener('pointerdown', onPointerDown);

            return () => {
                h.removeEventListener('pointerdown', onPointerDown);
                h.style.cursor = '';
            };
        });
    }

    return {
        size: _size as ReadonlySignal<number>,
        isResizing: _isResizing as ReadonlySignal<boolean>,
        setSize(px: number) { _size.set(clamp(px)); },
        reset() { _size.set(clamp(options?.initialSize ?? startSize)); },
        dispose() {
            cleanupEffect?.();
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        },
    };
}
