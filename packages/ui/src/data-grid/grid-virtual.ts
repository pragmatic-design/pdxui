// Grid virtual scroll — simple scroll-based rendering for large datasets.
// Renders only visible rows + overscan based on scrollTop and fixed row height.
// No external virtualizer dependency — direct DOM manipulation.

import type { GridContext, AnyColumn } from './grid-context';
import { applyColSize, GRID_WIDGET } from './grid-context';
import { getFieldValue, collectDisposers, DEV } from '@pdxui/core';
import { renderCellNode } from './grid-cell';
import { t } from './grid-i18n';
import { recordRow } from './grid-delegate';

export interface VirtualScrollState {
    update: () => void;
    dispose: () => void;
}

export function setupVirtualScroll(
    gc: GridContext,
    bodyEl: HTMLElement,
    requestedRowHeight: number,
    maxHeight: number,
    getRows: () => Record<string, unknown>[],
    getCols: () => AnyColumn[],
    fill = false,
): VirtualScrollState {
    const overscan = 5;
    // A row is a touch target: CSS gives .pdx-dg-row min-block-size: var(--pdx-target-min), which
    // is 44px under a coarse pointer. Rows are placed here by number, so they use the same one, or a
    // 44px row would sit under the next one placed 42px further down.
    const targetMin = parseFloat(getComputedStyle(bodyEl).getPropertyValue('--pdx-target-min')) || 0;
    const rowHeight = Math.max(requestedRowHeight, targetMin);

    // Body = scroll container. In fill mode the height comes from the flex layout
    // (CSS .pdx-dg-fill → body flex:1) and the visible range is computed from the
    // real clientHeight; otherwise a fixed max-height bounds the scroll area.
    if (!fill) bodyEl.style.maxHeight = `${maxHeight}px`;
    // In fill mode the X axis is handled by the outer scroller (.pdx-dg-scroll, header+filters+body together):
    // the body must scroll ONLY vertically, otherwise a second horizontal scrollbar appears.
    if (fill) {
        bodyEl.style.overflowY = 'auto';
        bodyEl.style.overflowX = 'hidden';
    } else {
        bodyEl.style.overflow = 'auto';
    }
    bodyEl.style.position = 'relative';

    // Spacer for total height
    const spacer = document.createElement('div');
    spacer.className = 'pdx-dg-virtual-spacer';
    spacer.style.pointerEvents = 'none';
    bodyEl.appendChild(spacer);

    // Row container (positioned absolute inside body)
    const rowContainer = document.createElement('div');
    rowContainer.style.position = 'absolute';
    rowContainer.style.top = '0';
    rowContainer.style.left = '0';
    rowContainer.style.right = '0';
    bodyEl.appendChild(rowContainer);

    let lastStart = -1;
    let lastEnd = -1;
    // The rows of the last rendered range by index, each with the disposer of the effects its cell
    // slots created: a row that leaves the range is disposed with it, or its bindings would leak.
    const live = new Map<number, { el: HTMLElement; dispose: () => void }>();
    // What the live rows were built from: other rows or other columns, or an explicit update, build
    // them all again.
    let builtRows: unknown = null;
    let builtCols: unknown = null;

    function clearRows(): void {
        for (const r of live.values()) r.dispose();
        live.clear();
        rowContainer.innerHTML = '';
    }

    function render(): void {
        const rows = getRows();
        const cols = getCols();
        const totalRows = rows.length;

        // Update spacer height
        spacer.style.height = `${totalRows * rowHeight}px`;

        if (totalRows === 0) {
            clearRows();
            builtRows = null;
            lastStart = -1;
            lastEnd = -1;
            return;
        }

        // Calculate visible range (use maxHeight as fallback before layout)
        const scrollTop = bodyEl.scrollTop;
        const viewHeight = bodyEl.clientHeight || maxHeight;
        const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
        const endIdx = Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / rowHeight) + overscan);

        // Skip if range hasn't changed
        if (startIdx === lastStart && endIdx === lastEnd) return;
        lastStart = startIdx;
        lastEnd = endIdx;

        // A row is built once while it stays in the range (#902): one that leaves it is disposed and
        // removed, and only the ones that enter are built, each in its own ownership scope.
        if (rows !== builtRows || cols !== builtCols) {
            clearRows();
            builtRows = rows;
            builtCols = cols;
        } else {
            for (const [i, r] of live) {
                if (i >= startIdx && i < endIdx) continue;
                r.dispose();
                r.el.remove();
                live.delete(i);
            }
        }
        rowContainer.style.transform = `translateY(${startIdx * rowHeight}px)`;

        const visibleCols = cols.filter(c => c.visible);
        const idFieldName = gc.getIdField();

        // The kept rows are one run of indices: a row that enters above it goes before it, the
        // others after it.
        const keptMin = live.size ? Math.min(...live.keys()) : Infinity;
        const above = document.createDocumentFragment();
        const below = document.createDocumentFragment();
        for (let i = startIdx; i < endIdx; i++) {
            const row = rows[i];
            if (!row || live.has(i)) continue;
            const [built, dispose] = collectDisposers(() => {

            const rowEl = document.createElement('div');
            rowEl.className = 'pdx-dg-row';
            rowEl.dataset.part = 'row';
            // The same mark as the non-virtual body: two views of one grid that disagree is the
            // drift `grid-cell.ts` exists to avoid.
            const rowClass = gc.getRowClass?.(row as Record<string, unknown>, i);
            if (rowClass) rowEl.classList.add(...rowClass.split(' ').filter(Boolean));
            rowEl.style.height = `${rowHeight}px`;
            rowEl.setAttribute('role', 'row');
            rowEl.setAttribute('data-row-index', String(i));
            // Data repetition, for `__PDX_DEVTOOLS__.outline()` (#271): as the non-virtual body.
            if (DEV) rowEl.setAttribute('data-pdx-item', '');
            const rowId = row[idFieldName];
            if (rowId != null) rowEl.setAttribute('data-row-id', String(rowId));
            // Its click and its checkbox are the body's listeners (grid-delegate.ts), as in the paged body.
            recordRow(rowEl, { row, index: i, id: rowId, rows });

            // Selection
            if (gc.getSelectionMode() !== 'none') {
                const selected = gc.selectedIds.has(rowId);
                if (selected) rowEl.classList.add('pdx-dg-row-selected');
                rowEl.setAttribute('aria-selected', String(selected));
            }

            // Checkbox
            if (gc.getSelectionMode() !== 'none') {
                const checkCell = document.createElement('div');
                checkCell.className = 'pdx-dg-td pdx-dg-checkbox';
                checkCell.setAttribute('role', 'gridcell');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.setAttribute(GRID_WIDGET, '');
                cb.setAttribute('aria-label', t('selectRow').replace('{n}', String(i + 1)));
                cb.checked = gc.selectedIds.has(rowId);
                checkCell.appendChild(cb);
                rowEl.appendChild(checkCell);
            }

            // Cells
            for (const col of visibleCols) {
                const td = document.createElement('div');
                td.className = 'pdx-dg-td';
                td.dataset.part = 'cell';
                if (col.def.command) td.classList.add('pdx-dg-td-command');
                if (col.align === 'right') td.classList.add('pdx-dg-td-right');
                else if (col.align === 'center') td.classList.add('pdx-dg-td-center');
                applyColSize(td, col);
                td.setAttribute('role', 'gridcell');
                td.setAttribute('data-field', col.field);

                let value: unknown;
                if (col.def.compute) {
                    value = col.def.compute(row);
                } else {
                    value = getFieldValue(row, col.field);
                }

                td.appendChild(gc.customCell(row, col, value, i) ?? renderCellNode(value, col, row));

                rowEl.appendChild(td);
            }

            return rowEl;
            });
            live.set(i, { el: built, dispose });
            (i < keptMin ? above : below).appendChild(built);
        }
        rowContainer.insertBefore(above, rowContainer.firstChild);
        rowContainer.appendChild(below);
        // A new window: its rows need their indices and the tab stop.
        gc.afterRender?.();
    }

    // Initial render
    render();

    // Scroll listener: one frame for every scroll event that arrives before it runs.
    let frame = 0;
    const onScroll = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            render();
        });
    };
    bodyEl.addEventListener('scroll', onScroll, { passive: true });

    /** Force re-render (invalidate range cache — used by column toggle, etc). */
    function forceRender(): void {
        lastStart = -1;
        lastEnd = -1;
        builtRows = null;
        render();
    }

    // In fill mode the available height is layout-driven and can change (window resize,
    // sidebar collapse, drawer open). Recompute the visible range whenever the body resizes.
    let resizeObs: ResizeObserver | null = null;
    if (fill && typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(() => forceRender());
        resizeObs.observe(bodyEl);
    }

    return {
        update: forceRender,
        dispose: () => {
            bodyEl.removeEventListener('scroll', onScroll);
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            resizeObs?.disconnect();
            for (const r of live.values()) r.dispose();
            live.clear();
        },
    };
}

