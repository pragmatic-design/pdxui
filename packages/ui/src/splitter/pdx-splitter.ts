// pdx-splitter — Resizable split pane layout.
// Children become panes. Drag handles appear between them.
// Supports: H/V orientation, min/max per pane, collapsible, keyboard resize,
// autoSaveId persistence, double-click to collapse/reset, nested splits.

import { component, html, signal } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/splitter';

export interface SplitterPane {
    /** Min size in % (default: 10) */
    min?: number;
    /** Max size in % (default: 90) */
    max?: number;
    /** Default size in % (auto-distributed if omitted) */
    defaultSize?: number;
    /** Collapsible — double-click handle to collapse */
    collapsible?: boolean;
    /** Collapsed size in % when collapsed (default: 0) */
    collapsedSize?: number;
}

/** Per-instance id prefix for the panes the separators control. */
let _splitterSeq = 0;

/**
 * A layout of resizable panes the user resizes by dragging the handles between them or from the
 * keyboard, with collapsible and nested panes.
 */
component('pdx-splitter', {
    props: {
        /** Orientation: horizontal (side-by-side) or vertical (stacked) */
        orientation: { type: String, default: 'horizontal' },
        /** Pane configurations — array matching child elements */
        panes: { type: Array, default: [] },
        /** Gutter size in px */
        gutterSize: { type: Number, default: 6 },
        /** localStorage key for persistence (empty = no save) */
        autoSaveId: { type: String, default: '' },
        /** Keyboard step size in % */
        keyboardStep: { type: Number, default: 2 },
    },
    setup(ctx) {
        const _uid = 'pdx-splitter-' + (++_splitterSeq);
        const _sizes = signal<number[]>([]);
        const _dragging = signal(false);
        let _paneEls: HTMLElement[] = [];
        let _handleEls: HTMLElement[] = [];
        // _containerEl reserved for future layout operations

        function getSavedSizes(): number[] | null {
            const saveId = ctx.autoSaveId() as string;
            if (!saveId) return null;
            try {
                const saved = localStorage.getItem('pdx-splitter-' + saveId);
                return saved ? JSON.parse(saved) : null;
            } catch { return null; }
        }

        function saveSizes(sizes: number[]): void {
            const saveId = ctx.autoSaveId() as string;
            if (saveId) localStorage.setItem('pdx-splitter-' + saveId, JSON.stringify(sizes));
        }

        // A size is a percentage of the space the gutters leave, as the drag computes it. As a bare
        // `flex-basis: N%` of the whole host, the panes would sum to 100% with the gutters on top:
        // with flex-shrink 0 the last pane would run past the host by the gutter width and be clipped.
        function applySizes(sizes: number[]): void {
            const gutters = (ctx.gutterSize() as number) * Math.max(0, _paneEls.length - 1);
            for (let idx = 0; idx < _paneEls.length; idx++) {
                if (idx < sizes.length) {
                    _paneEls[idx].style.flexBasis = `calc(${sizes[idx]}% - ${(gutters * sizes[idx]) / 100}px)`;
                    _paneEls[idx].style.flexGrow = '0';
                    _paneEls[idx].style.flexShrink = '0';
                }
            }
        }

        function initPanes(): void {
            const children = Array.from(ctx.el.children).filter(
                (ch) => ch instanceof HTMLElement && !ch.classList.contains('pdx-splitter-handle')
            ) as HTMLElement[];

            const paneConfigs = ctx.panes() as SplitterPane[];
            const count = children.length;
            if (count < 2) return;

            // Calculate initial sizes
            const saved = getSavedSizes();
            let sizes: number[];
            if (saved && saved.length === count) {
                sizes = saved;
            } else {
                sizes = [];
                let remaining = 100;
                for (let idx = 0; idx < count; idx++) {
                    const config = paneConfigs[idx];
                    if (config?.defaultSize != null) {
                        sizes.push(config.defaultSize);
                        remaining -= config.defaultSize;
                    } else {
                        sizes.push(-1); // auto
                    }
                }
                const autoCount = sizes.filter(s => s === -1).length;
                const autoSize = autoCount > 0 ? remaining / autoCount : 0;
                sizes = sizes.map(s => s === -1 ? autoSize : s);
            }

            _sizes.set(sizes);

            // Build container
            const orientation = ctx.orientation() as string;
            const gutterSize = ctx.gutterSize() as number;

            ctx.el.classList.add('pdx-splitter', 'pdx-splitter-' + orientation);
            _paneEls = [];
            _handleEls = [];

            // Wrap children in pane containers and insert handles
            for (let idx = 0; idx < children.length; idx++) {
                const pane = children[idx];
                pane.classList.add('pdx-splitter-pane');
                pane.setAttribute('data-pane-index', String(idx));
                if (!pane.id) pane.id = `${_uid}-pane-${idx}`;
                _paneEls.push(pane);

                // Insert handle between panes (not after last)
                if (idx < children.length - 1) {
                    const handle = document.createElement('div');
                    handle.className = 'pdx-splitter-handle';
                    handle.setAttribute('role', 'separator');
                    handle.setAttribute('tabindex', '0');
                    handle.setAttribute('aria-orientation', orientation);
                    handle.setAttribute('aria-valuenow', String(Math.round(sizes[idx])));
                    // The WAI-ARIA "Window Splitter" pattern: the separator needs min/max and an
                    // accessible name (it is focusable). Without them AT reports neither the range nor the identity.
                    handle.setAttribute('aria-valuemin', String(paneConfigs[idx]?.min ?? 0));
                    handle.setAttribute('aria-valuemax', String(paneConfigs[idx]?.max ?? 100));
                    uiAttr(handle, 'aria-label', () => uiString('splitter', 'label'));
                    // The pane whose size aria-valuenow is (APG window splitter).
                    handle.setAttribute('aria-controls', pane.id);
                    handle.setAttribute('data-handle-index', String(idx));

                    if (orientation === 'vertical') {
                        handle.style.height = gutterSize + 'px';
                        handle.style.cursor = 'row-resize';
                    } else {
                        handle.style.width = gutterSize + 'px';
                        handle.style.cursor = 'col-resize';
                    }

                    // Insert handle after the pane
                    pane.after(handle);

                    // Drag logic
                    setupHandleDrag(handle, idx, orientation, gutterSize);

                    // Double-click to collapse/reset
                    handle.addEventListener('dblclick', () => {
                        const config = (ctx.panes() as SplitterPane[])[idx];
                        if (config?.collapsible) {
                            const currentSizes = _sizes.peek().slice();
                            const collapsedSize = config.collapsedSize ?? 0;
                            if (currentSizes[idx] <= collapsedSize + 1) {
                                // Expand back to default
                                currentSizes[idx] = config.defaultSize ?? (100 / currentSizes.length);
                                // Redistribute
                                const total = currentSizes.reduce((a, b) => a + b, 0);
                                if (total !== 100) {
                                    const factor = 100 / total;
                                    for (let j = 0; j < currentSizes.length; j++) currentSizes[j] *= factor;
                                }
                            } else {
                                // Collapse
                                const freed = currentSizes[idx] - collapsedSize;
                                currentSizes[idx] = collapsedSize;
                                currentSizes[idx + 1] += freed;
                            }
                            _sizes.set(currentSizes);
                            applySizes(currentSizes);
                            saveSizes(currentSizes);
                            ctx.emit('pdx-resize', { sizes: currentSizes });
                        }
                    });

                    // Keyboard resize
                    handle.addEventListener('keydown', (e: KeyboardEvent) => {
                        const step = ctx.keyboardStep() as number;
                        const currentSizes = _sizes.peek().slice();
                        let changed = false;

                        if ((orientation === 'horizontal' && e.key === 'ArrowLeft') ||
                            (orientation === 'vertical' && e.key === 'ArrowUp')) {
                            e.preventDefault();
                            if (currentSizes[idx] > ((ctx.panes() as SplitterPane[])[idx]?.min ?? 5)) {
                                currentSizes[idx] -= step;
                                currentSizes[idx + 1] += step;
                                changed = true;
                            }
                        } else if ((orientation === 'horizontal' && e.key === 'ArrowRight') ||
                                   (orientation === 'vertical' && e.key === 'ArrowDown')) {
                            e.preventDefault();
                            if (currentSizes[idx + 1] > ((ctx.panes() as SplitterPane[])[idx + 1]?.min ?? 5)) {
                                currentSizes[idx] += step;
                                currentSizes[idx + 1] -= step;
                                changed = true;
                            }
                        } else if (e.key === 'Home') {
                            e.preventDefault();
                            const maxLeft = (ctx.panes() as SplitterPane[])[idx]?.max ?? 90;
                            const freed = maxLeft - currentSizes[idx];
                            currentSizes[idx] = maxLeft;
                            currentSizes[idx + 1] -= freed;
                            changed = true;
                        } else if (e.key === 'End') {
                            e.preventDefault();
                            const minLeft = (ctx.panes() as SplitterPane[])[idx]?.min ?? 5;
                            const freed = currentSizes[idx] - minLeft;
                            currentSizes[idx] = minLeft;
                            currentSizes[idx + 1] += freed;
                            changed = true;
                        }

                        if (changed) {
                            _sizes.set(currentSizes);
                            applySizes(currentSizes);
                            saveSizes(currentSizes);
                            // Keep aria-valuenow in step with a keyboard resize (otherwise AT stays put).
                            handle.setAttribute('aria-valuenow', String(Math.round(currentSizes[idx])));
                            ctx.emit('pdx-resize', { sizes: currentSizes });
                        }
                    });

                    _handleEls.push(handle);
                }
            }

            applySizes(sizes);
        }

        function setupHandleDrag(handle: HTMLElement, handleIdx: number, orientation: string, gutterSize: number): void {
            let startPos = 0;
            let startSizes: number[] = [];
            let containerSize = 0;

            handle.addEventListener('pointerdown', (e: PointerEvent) => {
                e.preventDefault();
                handle.setPointerCapture(e.pointerId);
                _dragging.set(true);
                ctx.el.classList.add('pdx-splitter-dragging');
                handle.classList.add('pdx-splitter-handle-active');

                startPos = orientation === 'vertical' ? e.clientY : e.clientX;
                startSizes = _sizes.peek().slice();
                const rect = ctx.el.getBoundingClientRect();
                containerSize = orientation === 'vertical' ? rect.height : rect.width;
                // Subtract gutter sizes
                containerSize -= gutterSize * (_paneEls.length - 1);

                ctx.emit('pdx-resize-start', { sizes: startSizes });
            });
            // A move processed at most once per frame: style writes +
            // setAttribute + emit on every event would cause a burst of style recalcs.
            let _moveRaf = 0;
            let _lastMove: PointerEvent | null = null;
            handle.addEventListener('pointermove', (e: PointerEvent) => {
                if (!_dragging.peek()) return;
                _lastMove = e;
                if (_moveRaf) return;
                _moveRaf = requestAnimationFrame(() => {
                    _moveRaf = 0;
                    if (_lastMove && _dragging.peek()) processMove(_lastMove);
                });
            });

            const processMove = (e: PointerEvent): void => {
                const currentPos = orientation === 'vertical' ? e.clientY : e.clientX;
                const deltaPx = currentPos - startPos;
                const deltaPercent = (deltaPx / containerSize) * 100;

                const newSizes = startSizes.slice();
                const paneConfigs = ctx.panes() as SplitterPane[];
                const minA = paneConfigs[handleIdx]?.min ?? 5;
                const maxA = paneConfigs[handleIdx]?.max ?? 95;
                const minB = paneConfigs[handleIdx + 1]?.min ?? 5;
                const maxB = paneConfigs[handleIdx + 1]?.max ?? 95;

                let sizeA = startSizes[handleIdx] + deltaPercent;
                let sizeB = startSizes[handleIdx + 1] - deltaPercent;

                // Clamp
                if (sizeA < minA) { sizeB += sizeA - minA; sizeA = minA; }
                if (sizeB < minB) { sizeA += sizeB - minB; sizeB = minB; }
                if (sizeA > maxA) { sizeB += sizeA - maxA; sizeA = maxA; }
                if (sizeB > maxB) { sizeA += sizeB - maxB; sizeB = maxB; }

                newSizes[handleIdx] = sizeA;
                newSizes[handleIdx + 1] = sizeB;

                _sizes.set(newSizes);
                applySizes(newSizes);
                handle.setAttribute('aria-valuenow', String(Math.round(sizeA)));
                ctx.emit('pdx-resize', { sizes: newSizes });
            };

            const onPointerUp = () => {
                if (!_dragging.peek()) return;
                _dragging.set(false);
                ctx.el.classList.remove('pdx-splitter-dragging');
                handle.classList.remove('pdx-splitter-handle-active');
                saveSizes(_sizes.peek());
                ctx.emit('pdx-resize-end', { sizes: _sizes.peek() });
            };
            handle.addEventListener('pointerup', onPointerUp);
            handle.addEventListener('pointercancel', onPointerUp);
        }

        ctx.track(() => {
            void ctx.orientation();
            void ctx.panes();

            // Post-mount changes of orientation/panes re-initialize the panes
            // instead of staying inert after the first build.
            requestAnimationFrame(() => initPanes());
        });

        ctx.expose({
            /** The pane sizes now, in percent of the space the gutters leave. */
            getSizes: () => _sizes.peek(),
            /** Apply pane sizes, in percent, and save them when `auto-save-id` is set. */
            setSizes: (sizes: number[]) => { _sizes.set(sizes); applySizes(sizes); saveSizes(sizes); },
            /** Forget the saved sizes and lay the panes out again from their props. */
            resetSizes: () => { localStorage.removeItem('pdx-splitter-' + (ctx.autoSaveId() as string)); initPanes(); },
            /** Whether a divider is being dragged right now. */
            isDragging: () => _dragging.peek(),
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
