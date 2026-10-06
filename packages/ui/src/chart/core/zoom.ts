// Zoom and pan — inside zoom via mouse wheel + drag.
// Manages a viewport window [start, end] as fraction of the full data range.

export interface ZoomState {
    /** Viewport start (0 = beginning, 1 = end). */
    start: number;
    /** Viewport end (0 = beginning, 1 = end). */
    end: number;
}

export interface ZoomController {
    state: ZoomState;
    /** Apply zoom state to filter visible data indices. */
    getVisibleRange(dataLength: number): [number, number];
    /** Attach mouse handlers. Returns cleanup function. */
    attach(canvas: HTMLCanvasElement, onUpdate: () => void): () => void;
    /** Reset to full range. */
    reset(): void;
}

export function createZoom(): ZoomController {
    const state: ZoomState = { start: 0, end: 1 };
    let _cleanup: (() => void) | null = null;

    return {
        state,

        getVisibleRange(dataLength: number): [number, number] {
            const s = Math.floor(state.start * dataLength);
            const e = Math.ceil(state.end * dataLength);
            return [Math.max(0, s), Math.min(dataLength, e)];
        },

        attach(canvas: HTMLCanvasElement, onUpdate: () => void): () => void {
            let isDragging = false;
            let dragStartX = 0;
            let dragStartState = { ...state };

            const onWheel = (e: WheelEvent) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mouseX = (e.clientX - rect.left) / rect.width;
                // Fraction of viewport where cursor is
                const cursorFrac = state.start + mouseX * (state.end - state.start);

                const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
                let newSpan = (state.end - state.start) * zoomFactor;
                newSpan = Math.max(0.05, Math.min(1, newSpan)); // min 5% visible

                // Keep cursor position stable
                state.start = cursorFrac - mouseX * newSpan;
                state.end = cursorFrac + (1 - mouseX) * newSpan;

                // Clamp
                if (state.start < 0) { state.end -= state.start; state.start = 0; }
                if (state.end > 1) { state.start -= (state.end - 1); state.end = 1; }
                state.start = Math.max(0, state.start);
                state.end = Math.min(1, state.end);

                onUpdate();
            };

            const onPointerDown = (e: PointerEvent) => {
                if (state.end - state.start >= 0.99) return; // no zoom active
                isDragging = true;
                dragStartX = e.clientX;
                dragStartState = { ...state };
                canvas.setPointerCapture(e.pointerId);
            };

            const onPointerMove = (e: PointerEvent) => {
                if (!isDragging) return;
                const rect = canvas.getBoundingClientRect();
                const dx = (e.clientX - dragStartX) / rect.width;
                const span = dragStartState.end - dragStartState.start;
                let newStart = dragStartState.start - dx * span;
                let newEnd = dragStartState.end - dx * span;

                // Clamp
                if (newStart < 0) { newEnd -= newStart; newStart = 0; }
                if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; }

                state.start = Math.max(0, newStart);
                state.end = Math.min(1, newEnd);
                onUpdate();
            };

            const onPointerUp = () => { isDragging = false; };

            canvas.addEventListener('wheel', onWheel, { passive: false });
            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('pointerup', onPointerUp);

            _cleanup = () => {
                canvas.removeEventListener('wheel', onWheel);
                canvas.removeEventListener('pointerdown', onPointerDown);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerup', onPointerUp);
            };
            return _cleanup;
        },

        reset() {
            state.start = 0;
            state.end = 1;
        },
    };
}
