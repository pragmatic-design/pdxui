// Grid header — column headers with sort carets, filter icon, resize handles, checkbox.
// Supports column groups (BUG 7): when any visible column belongs to a group (`children`),
// the header renders as a two-row stack (group labels on top, leaf headers below). Columns
// WITHOUT a group render identically to the flat single-row header (feature-detected).

import type { GridContext, AnyColumn } from './grid-context';
import { applyColSize, GRID_WIDGET, canFilter, canResize, canReorder } from './grid-context';
import { openFilterPopover, isColumnFiltered } from './grid-filter-popover';
import { t } from './grid-i18n';
import { uiAttr } from '../shared/i18n';

/**
 * Leading spacer cells (row-detail chevron + selection checkbox) shared by both header modes.
 *
 * Their names go through `uiAttr`, so a dictionary that arrives after the grid is on screen reaches
 * them. The grid's reactive effect rebuilds this header, which covers most of it — but
 * not every path: a header built in a branch where the effect's frame finds nothing to replace
 * keeps what it was born with, and would keep `Details` on an otherwise translated page.
 * These three are one per GRID rather than one per row, so the registry
 * `uiAttr` keeps stays small, which is why the rest of this component does not use it.
 * They are columnheaders, so the header row has as many cells as a body row and the arrows keep
 * their column moving between them; an empty one is named by what its column holds.
 *
 * A two-row header draws them in both rows: the top ones span the two (aria-rowspan), and the leaf
 * row's are `layoutOnly` spacers — no role, and no second select-all checkbox.
 */
function buildLeadingCells(gc: GridContext, target: HTMLElement, rowSpan = 1, layoutOnly = false): void {
    const asHeader = (cell: HTMLElement) => {
        cell.setAttribute('role', 'columnheader');
        if (rowSpan > 1) cell.setAttribute('aria-rowspan', String(rowSpan));
    };
    // Expand column spacer (for row detail chevrons)
    if (gc.isExpandable()) {
        const expandSpacer = document.createElement('div');
        expandSpacer.className = 'pdx-dg-th pdx-dg-expand-cell';
        if (!layoutOnly) {
            asHeader(expandSpacer);
            uiAttr(expandSpacer, 'aria-label', () => t('detail.column'));
        }
        target.appendChild(expandSpacer);
    }

    // Selection checkbox header
    if (gc.getSelectionMode() !== 'none') {
        const checkCell = document.createElement('div');
        checkCell.className = 'pdx-dg-th pdx-dg-checkbox';
        if (layoutOnly) {
            target.appendChild(checkCell);
            return;
        }
        asHeader(checkCell);
        if (gc.getSelectionMode() === 'multiple') {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.setAttribute(GRID_WIDGET, '');
            uiAttr(cb, 'aria-label', () => t('selectAll'));
            cb.addEventListener('change', () => {
                // Inline select-all logic delegated to selection module via callback
                gc.emit('__select-all', {});
            });
            checkCell.appendChild(cb);
        } else {
            uiAttr(checkCell, 'aria-label', () => t('selection.column'));
        }
        target.appendChild(checkCell);
    }
}

/** Build a single leaf column header cell (sort caret, filter icon, resize handle, drag reorder). */
function buildColumnTh(gc: GridContext, col: AnyColumn, root: HTMLElement): HTMLElement {
    // Drag reorder state (per-th; shared cleanup queries `root`)
    let dragField: string | null = null;

    const th = document.createElement('div');
    th.className = 'pdx-dg-th';
    if (col.sortable) th.classList.add('pdx-dg-th-sortable');
    if (col.align === 'right') th.classList.add('pdx-dg-td-right');
    else if (col.align === 'center') th.classList.add('pdx-dg-td-center');
    applyColSize(th, col);
    th.setAttribute('role', 'columnheader');
    th.setAttribute('data-field', col.field);

    // Drag reorder (if column is reorderable)
    if (canReorder(col)) {
        th.draggable = true;
        th.addEventListener('dragstart', (e) => {
            dragField = col.field;
            th.classList.add('pdx-dg-th-dragging');
            e.dataTransfer!.effectAllowed = 'copyMove';
            e.dataTransfer!.setData('text/plain', col.field);
        });
        th.addEventListener('dragend', () => {
            dragField = null;
            th.classList.remove('pdx-dg-th-dragging');
            // Remove all drop indicators
            root.querySelectorAll('.pdx-dg-th-drop-target').forEach(el =>
                el.classList.remove('pdx-dg-th-drop-target', 'pdx-dg-th-drop-left', 'pdx-dg-th-drop-right'));
        });
        th.addEventListener('dragover', (e) => {
            if (!dragField || dragField === col.field) return;
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';
            // Show drop indicator (left or right half)
            const rect = th.getBoundingClientRect();
            const isLeft = e.clientX < rect.left + rect.width / 2;
            th.classList.add('pdx-dg-th-drop-target');
            th.classList.toggle('pdx-dg-th-drop-left', isLeft);
            th.classList.toggle('pdx-dg-th-drop-right', !isLeft);
        });
        th.addEventListener('dragleave', () => {
            th.classList.remove('pdx-dg-th-drop-target', 'pdx-dg-th-drop-left', 'pdx-dg-th-drop-right');
        });
        th.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!dragField || dragField === col.field) return;
            gc.grid?.reorder(dragField, col.field);
            dragField = null;
        });
    }

    // A sortable header's label and carets are a button: the sort is reachable from the keyboard
    // (Enter/Space are its click, which bubbles to the th's handler) and the columnheader says how
    // the column is sorted. aria-sort goes on the primary sort column only — ARIA asks for one at a
    // time — and every other sortable header is "none".
    let sortBtn: HTMLButtonElement | null = null;
    if (col.sortable) {
        sortBtn = document.createElement('button');
        sortBtn.type = 'button';
        sortBtn.className = 'pdx-dg-sort-btn';
        sortBtn.setAttribute(GRID_WIDGET, '');
        const primary = col.sortIndex <= 0 && !!col.sortDir;
        th.setAttribute('aria-sort', primary ? (col.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
    const labelHost: HTMLElement = sortBtn ?? th;

    // Header slot: header:{field}
    const headerSlot = gc.getSlot(`header:${col.field}`);
    if (headerSlot) {
        const content = headerSlot({ col, field: col.field, header: col.header });
        labelHost.appendChild(content instanceof DocumentFragment ? content : content);
    } else {
        // Label — flex squeeze target: truncates with ellipsis in narrow columns
        const label = document.createElement('span');
        label.className = 'pdx-dg-th-label';
        label.textContent = col.header;
        // Tooltip for truncated text. On a sortable header the button's own title carries the
        // name AND how to add it to the sort; a title here would hide it under the label.
        if (!sortBtn) label.title = col.header;
        labelHost.appendChild(label);
    }
    if (sortBtn) sortBtn.title = t('sort.hint').replace('{column}', String(col.header ?? col.field));

    // Sort indicator — stacked caret pattern
    if (sortBtn) {
        const sortWrap = document.createElement('span');
        sortWrap.className = 'pdx-dg-sort';
        sortWrap.setAttribute('aria-hidden', 'true');
        if (col.sortDir) sortWrap.classList.add('sorted');

        const caretUp = document.createElement('span');
        caretUp.className = 'pdx-dg-sort-caret pdx-dg-sort-caret-up';
        if (col.sortDir === 'asc') caretUp.classList.add('active');

        const caretDown = document.createElement('span');
        caretDown.className = 'pdx-dg-sort-caret pdx-dg-sort-caret-down';
        if (col.sortDir === 'desc') caretDown.classList.add('active');

        sortWrap.appendChild(caretUp);
        sortWrap.appendChild(caretDown);
        sortBtn.appendChild(sortWrap);
        th.appendChild(sortBtn);

        // Multi-sort position, whenever there is more than one level, with a toolbar or without: the
        // chips recap the sort, but the headers are where the order is read. Said as well as drawn:
        // the columnheader describes its position; the number itself is decoration.
        const levels = gc.grid?.sortState.peek().length ?? 0;
        if (col.sortIndex >= 0 && levels > 1) {
            const badge = document.createElement('span');
            badge.className = 'pdx-dg-sort-badge';
            badge.setAttribute('aria-hidden', 'true');
            badge.textContent = String(col.sortIndex + 1);
            th.appendChild(badge);
            th.setAttribute('aria-description', t('sort.position')
                .replace('{n}', String(col.sortIndex + 1))
                .replace('{total}', String(levels))
                .replace('{dir}', t(col.sortDir === 'desc' ? 'sort.desc' : 'sort.asc')));
        }

        th.addEventListener('click', (e) => {
            gc.grid?.sort(col.field, undefined, e.shiftKey);
        });
        // Shift+Enter / Shift+Space add to the sort, as Shift+click does. A button's keyboard click
        // does not carry the Shift everywhere, so the key is read here and the click never happens.
        sortBtn.addEventListener('keydown', (e) => {
            if (!e.shiftKey || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            e.stopPropagation();
            gc.grid?.sort(col.field, undefined, true);
        });
    }

    // Filter icon (funnel) — show unless inline filter row is active (redundant)
    if (canFilter(col) && col.type !== 'boolean' && !gc.hasFilterRow()) {
        const filterBtn = document.createElement('button');
        filterBtn.type = 'button';   // not submit: a grid inside a form would submit it
        filterBtn.className = 'pdx-dg-filter-icon';
        if (isColumnFiltered(gc, col.field)) filterBtn.classList.add('active');
        filterBtn.setAttribute('aria-label', t('filter.forColumn').replace('{column}', String(col.header ?? '')));
        // Inline SVG filter funnel — tiny, no pdx-icon overhead
        filterBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't trigger sort
            // The FUNNEL is the anchor, not the header cell: anchored to the cell, the popover
            // would open at the column's left edge, a column's width away from what was clicked.
            // The column menu passes its own button.
            openFilterPopover(gc, col, filterBtn);
        });
        th.appendChild(filterBtn);
    }

    // Resize handle
    if (canResize(col)) {
        const handle = document.createElement('div');
        handle.className = 'pdx-dg-resize-handle';
        handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = th.getBoundingClientRect().width;
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = (ev: PointerEvent) => {
                gc.grid?.resize(col.field, startWidth + (ev.clientX - startX));
            };
            const onUp = () => {
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
        th.appendChild(handle);
    }

    return th;
}

/** Flat single-row header (original behaviour — every column is top-level). */
function buildFlatHeader(gc: GridContext, cols: AnyColumn[]): HTMLElement {
    const header = document.createElement('div');
    header.className = 'pdx-dg-header';
    header.setAttribute('role', 'row');

    buildLeadingCells(gc, header);

    for (const col of cols.filter(c => c.visible)) {
        header.appendChild(buildColumnTh(gc, col, header));
    }
    return header;
}

/** Group label cell spanning its leaf columns (aria-colspan). Width = Σ leaf widths. */
function buildGroupCell(header: string, leafCols: AnyColumn[]): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'pdx-dg-th pdx-dg-th-group';
    cell.setAttribute('role', 'columnheader');
    cell.setAttribute('aria-colspan', String(leafCols.length));

    const totalFlex = leafCols.reduce((a, c) => a + (c.flex || 0), 0);
    const totalWidth = leafCols.reduce((a, c) => a + c.width, 0);
    const totalMin = leafCols.reduce((a, c) => a + c.minWidth, 0);
    if (totalFlex > 0) {
        cell.style.flex = `${totalFlex} 1 ${totalWidth}px`;
        cell.style.minWidth = `${totalMin}px`;
    } else {
        cell.style.width = `${totalWidth}px`;
        cell.style.minWidth = `${totalMin}px`;
        cell.style.flexShrink = '0';
    }

    const label = document.createElement('span');
    label.className = 'pdx-dg-th-label';
    label.textContent = header;
    label.title = header;
    cell.appendChild(label);
    return cell;
}

/** Two-row header: group labels on top, leaf headers below. Top-level columns span both rows. */
function buildGroupedHeader(gc: GridContext, cols: AnyColumn[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pdx-dg-header pdx-dg-header-grouped';

    const topRow = document.createElement('div');
    topRow.className = 'pdx-dg-header-row pdx-dg-header-top';
    topRow.setAttribute('role', 'row');

    const leafRow = document.createElement('div');
    leafRow.className = 'pdx-dg-header-row pdx-dg-header-leaf';
    leafRow.setAttribute('role', 'row');

    // Leading spacers in BOTH rows → columns stay aligned across the two levels.
    buildLeadingCells(gc, topRow, 2);
    buildLeadingCells(gc, leafRow, 1, true);

    // Partition visible columns into consecutive runs by group (order preserved).
    const visibleCols = cols.filter(c => c.visible);
    const runs: { id: string | null; header: string | null; cols: AnyColumn[] }[] = [];
    for (const col of visibleCols) {
        const gid = col.groupId ?? null;
        const last = runs[runs.length - 1];
        if (last && gid !== null && last.id === gid) last.cols.push(col);
        else runs.push({ id: gid, header: col.group ?? null, cols: [col] });
    }

    for (const run of runs) {
        if (run.id === null) {
            // Top-level column: real header cell spans both rows; a placeholder keeps the
            // leaf row aligned to the same column width.
            const col = run.cols[0];
            const th = buildColumnTh(gc, col, container);
            th.classList.add('pdx-dg-th-span');
            th.setAttribute('aria-rowspan', '2');   // the placeholder below it is layout only
            topRow.appendChild(th);

            const ph = document.createElement('div');
            ph.className = 'pdx-dg-th pdx-dg-th-leaf-placeholder';
            applyColSize(ph, col);
            leafRow.appendChild(ph);
        } else {
            topRow.appendChild(buildGroupCell(run.header ?? '', run.cols));
            for (const col of run.cols) {
                leafRow.appendChild(buildColumnTh(gc, col, container));
            }
        }
    }

    container.appendChild(topRow);
    container.appendChild(leafRow);
    return container;
}

export function buildHeader(gc: GridContext, cols: AnyColumn[]): HTMLElement {
    // Feature-detect column groups: only pay the two-row cost when a visible column has a group.
    const hasGroups = cols.some(c => c.visible && (c.groupId ?? null) !== null);
    return hasGroups ? buildGroupedHeader(gc, cols) : buildFlatHeader(gc, cols);
}
