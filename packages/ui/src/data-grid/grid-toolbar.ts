// Grid toolbar — sort recap chips, filter chips, reload, column chooser, custom slots.
// Sits above the header. Orchestrates sort/filter display when showToolbar is active.

import type { FilterDescriptor, CompositeFilter, SortDescriptor } from '@pdxui/core';
import { toCsv, toXlsx, saveBlob } from '@pdxui/core';
import type { GridContext, AnyColumn } from './grid-context';
import { canFilter } from './grid-context';
import { openColumnMenu } from './grid-column-menu';
import { openFilterPopover, closeFilterPopover } from './grid-filter-popover';
import { commitBatch, revertBatch, addRow } from './grid-edit';
import { t } from './grid-i18n';
import { i18nMark, applyChromeStrings } from './grid-chrome-strings';
import { openGridMenu } from './grid-menu';
import { buildGroupButton, buildGroupChips } from './grid-group-menu';

/** How long the quick search waits after the last keystroke before it asks. */
const SEARCH_PAUSE_MS = 300;

// ─── Build toolbar ──────────────────────────────────────────

export function buildToolbar(gc: GridContext): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'pdx-dg-toolbar';
    bar.setAttribute('role', 'toolbar');
    i18nMark(bar, 'toolbar.label', 'label');

    // Reload button
    // Every button of the grid is type="button": the default is submit, and a grid inside a form
    // would submit it from Reload, Columns or a chip's ✕.
    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.className = 'pdx-dg-toolbar-btn';
    i18nMark(reloadBtn, 'toolbar.reload', 'label', 'title');
    reloadBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
    reloadBtn.addEventListener('click', () => gc.grid?.source.refresh());
    bar.appendChild(reloadBtn);

    // Slot: toolbar-start
    const startSlot = gc.getSlot('toolbar-start');
    if (startSlot) {
        const content = startSlot({ grid: gc.grid });
        bar.appendChild(content instanceof DocumentFragment ? content : content);
    }

    // Single chips area — sort + filter chips mixed together, inline
    const chipsArea = document.createElement('div');
    chipsArea.className = 'pdx-dg-toolbar-chips';
    bar.appendChild(chipsArea);

    // Spacer — pushes right-side buttons to the end
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Slot: toolbar-end
    const endSlot = gc.getSlot('toolbar-end');
    if (endSlot) {
        const content = endSlot({ grid: gc.grid });
        bar.appendChild(content instanceof DocumentFragment ? content : content);
    }

    // Quick search: one term over the columns marked `searchable`, after a pause — a
    // request per keystroke is a server asked about «v», «vp» and «vpn» when the reader meant one.
    if (gc.hasSearch()) {
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'pdx-input pdx-dg-toolbar-search';
        search.dataset.gridSearch = '';
        i18nMark(search, 'toolbar.search', 'label');
        search.placeholder = t('toolbar.search');
        let pending: ReturnType<typeof setTimeout> | null = null;
        search.addEventListener('input', () => {
            if (pending) clearTimeout(pending);
            pending = setTimeout(() => {
                pending = null;
                const fields = (gc.grid?.columns.peek() as AnyColumn[] ?? [])
                    .filter(c => (c.def as { searchable?: boolean }).searchable).map(c => String(c.field));
                gc.grid?.source.setSearch(search.value, fields);
            }, SEARCH_PAUSE_MS);
        });
        bar.appendChild(search);
    }

    // Add filter button
    const addFilterBtn = document.createElement('button');
    addFilterBtn.type = 'button';
    addFilterBtn.className = 'pdx-dg-toolbar-btn pdx-dg-toolbar-btn-text pdx-dg-toolbar-add-filter';
    addFilterBtn.setAttribute('aria-haspopup', 'menu');
    addFilterBtn.setAttribute('aria-expanded', 'false');   // the menu keeps it in step
    addFilterBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>&nbsp;';
    // The word in its own <span>: `text` replaces an element's content, and the icon shares the
    // button with it.
    const addFilterLabel = document.createElement('span');
    i18nMark(addFilterLabel, 'filter.addFilter', 'text');
    addFilterBtn.appendChild(addFilterLabel);
    addFilterBtn.addEventListener('click', () => {
        openAddFilterPopover(gc, addFilterBtn);
    });
    bar.appendChild(addFilterBtn);

    // Clear all filters button — visible only when filters are active (updated in updateToolbar)
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'pdx-dg-toolbar-btn pdx-dg-toolbar-chip-remove-all';
    // Named by aria-label: its content is a ✕, which a screen reader would read as the name, and a
    // title alone is not a name. The glyph is hidden so the name is all that is read.
    i18nMark(clearAllBtn, 'filter.clearAll', 'label', 'title');
    const clearAllGlyph = document.createElement('span');
    clearAllGlyph.setAttribute('aria-hidden', 'true');
    clearAllGlyph.textContent = '✕';
    clearAllBtn.appendChild(clearAllGlyph);
    clearAllBtn.style.display = 'none';
    clearAllBtn.addEventListener('click', () => {
        // Clear all popover filter state
        for (const key of Object.keys(gc.popoverFilters)) {
            delete gc.popoverFilters[key];
        }
        gc.grid?.source.setFilter([]);
    });
    bar.appendChild(clearAllBtn);

    // Batch mode: Save All / Revert buttons (updated in updateToolbar)
    if (gc.editMode() === 'batch') {
        const batchSave = document.createElement('pdx-button') as any;
        batchSave.className = 'pdx-dg-toolbar-batch-save';
        batchSave.setAttribute('size', 'xs');
        batchSave.setAttribute('variant', 'primary');
        i18nMark(batchSave, 'edit.saveAll', 'text');
        batchSave.style.display = 'none';
        batchSave.addEventListener('click', () => commitBatch(gc));
        bar.appendChild(batchSave);

        const batchRevert = document.createElement('pdx-button') as any;
        batchRevert.className = 'pdx-dg-toolbar-batch-revert';
        batchRevert.setAttribute('size', 'xs');
        batchRevert.setAttribute('variant', 'ghost');
        i18nMark(batchRevert, 'edit.revert', 'text');
        batchRevert.style.display = 'none';
        batchRevert.addEventListener('click', () => revertBatch(gc));
        bar.appendChild(batchRevert);
    }

    // Add row button (visible when editable)
    if (gc.editMode() !== 'none') {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'pdx-dg-toolbar-btn pdx-dg-toolbar-btn-text';
        addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>&nbsp;';
        // The label in its own element, not inside the innerHTML string: a word buried in
        // markup is a word no locale can reach, and the guard cannot see it either;
        // its own element is also what lets the name be re-read later.
        const addLabel = document.createElement('span');
        i18nMark(addLabel, 'edit.addRow', 'text');
        addBtn.appendChild(addLabel);
        addBtn.addEventListener('click', () => addRow(gc));
        bar.appendChild(addBtn);
    }

    // «Group by», when a column is groupable: `grid-group-menu.ts`.
    const groupBtn = buildGroupButton(gc);
    if (groupBtn) bar.appendChild(groupBtn);

    // Export — the request every line-of-business grid receives. A MENU: CSV or Excel, the same
    // rows either way.
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'pdx-dg-toolbar-btn';
    exportBtn.dataset.gridExport = '';
    exportBtn.setAttribute('aria-haspopup', 'menu');
    exportBtn.setAttribute('aria-expanded', 'false');   // the menu keeps it in step
    i18nMark(exportBtn, 'toolbar.export', 'label', 'title');
    exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openGridMenu(exportBtn, [
            { label: t('toolbar.exportCsv'), select: () => { void exportRows(gc, 'csv'); } },
            { label: t('toolbar.exportXlsx'), select: () => { void exportRows(gc, 'xlsx'); } },
        ], {
            label: t('toolbar.exportMenu'),
            menuClass: 'pdx-dg-col-menu',
            itemClass: 'pdx-dg-col-menu-item',
            place: (menu, rect) => {
                menu.style.top = `${rect.bottom + 4}px`;
                menu.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
            },
        });
    });
    bar.appendChild(exportBtn);

    // Column chooser button
    const colBtn = document.createElement('button');
    colBtn.type = 'button';
    colBtn.className = 'pdx-dg-toolbar-btn';
    i18nMark(colBtn, 'toolbar.columns', 'label', 'title');
    colBtn.setAttribute('aria-expanded', 'false');   // the chooser keeps it in step
    colBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
    colBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openColumnMenu(gc, colBtn);
    });
    bar.appendChild(colBtn);

    return bar;
}

// ─── Export ─────────────────────────────────────────────────

/**
 * The rows the user is looking at, as a CSV or an Excel workbook they can open.
 *
 * Three decisions, and each of them is what separates this from `rows.join(',')`:
 *
 *   - **which rows.** A SELECTION wins: someone who ticked four rows and pressed Export wants
 *     four. Otherwise every row the filter and the sort select — `getAllRows()`, not the page,
 *     because a user who narrowed 8000 down to 40 wants the 40 and not the 20 that fit on screen;
 *   - **which columns.** The visible ones, in the order they are on screen, under the header the
 *     user reads — and through the column's own `format`, so a coded value exports as the label
 *     the grid shows rather than as `closed`;
 *   - **the file name.** Dated, so a folder of exports is sortable and the second one does not
 *     silently replace the first.
 *
 * `pdx-grid-export` is emitted with the row count and the format either way: an application that
 * wants to log it, or to refuse it, has somewhere to listen.
 */
async function exportRows(gc: GridContext, format: 'csv' | 'xlsx'): Promise<void> {
    if (!gc.grid) return;
    // `visible` is the resolved column's own flag — the column chooser writes it, so an export
    // follows what the user turned off.
    const columns = (gc.grid.columns.peek() as AnyColumn[]).filter(c => c.visible !== false);

    const selected = gc.selectedIds;
    let rows: Record<string, unknown>[];
    if (selected && selected.size > 0) {
        const idField = gc.getIdField();
        const all = await gc.grid.source.getAllRows() as Record<string, unknown>[];
        rows = all.filter(r => selected.has(r[idField]));
    } else {
        rows = await gc.grid.source.getAllRows() as Record<string, unknown>[];
    }

    const exportColumns = columns.map(c => {
        // `col.def` is where a resolved column keeps what the author wrote — which is where the
        // cell renderer reads the formatter from too (`grid-cell.ts:115`). Read off `c.format`
        // first and the export would write `closed` and `high` while the screen says «Closed» and
        // «High»: the same data, a different file.
        const def = (c as { def?: { format?: unknown } }).def ?? c;
        const format = (def as { format?: unknown }).format;
        return {
            field: String(c.field),
            header: c.header ?? String(c.field),
            format: typeof format === 'function' ? (format as (v: unknown, row?: Record<string, unknown>) => unknown) : undefined,
        };
    });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'xlsx') saveBlob(toXlsx(rows, exportColumns), `export-${stamp}.xlsx`);
    else saveBlob(new Blob([toCsv(rows, exportColumns)], { type: 'text/csv;charset=utf-8' }), `export-${stamp}.csv`);
    gc.emit('pdx-grid-export', { rows: rows.length, columns: columns.length, format });
}

// ─── Update toolbar (called from reactive effect) ───────────

export function updateToolbar(gc: GridContext, bar: HTMLElement): void {
    if (!gc.grid) return;

    // The chrome's names, re-read: the grid's effect calls this after a tracked read of
    // `componentStringsChanged()`, so a dictionary that lands later reaches the toolbar the same
    // way it reaches the header and the rows.
    applyChromeStrings(bar);

    const chipsArea = bar.querySelector('.pdx-dg-toolbar-chips') as HTMLElement;
    if (!chipsArea) return;

    const allCols = gc.grid.columns.peek() as AnyColumn[];
    const activeFilters = gc.grid.source.filter.peek() as (FilterDescriptor | CompositeFilter)[];
    const quickCols = allCols.filter(c => (c.def as { quickFilter?: boolean }).quickFilter && canFilter(c));
    const quickFields = new Set(quickCols.map(c => String(c.field)));
    // The «+» rides at the end of the chips when there are quick filters: taken out before the
    // chips are cleared, so it is not thrown away with them.
    const addFilterBtn = bar.querySelector('.pdx-dg-toolbar-add-filter') as HTMLElement | null;
    if (quickCols.length > 0 && addFilterBtn) addFilterBtn.remove();

    chipsArea.innerHTML = '';

    // Quick filters first, in column order: a chip for each, empty until it is set.
    for (const col of quickCols) {
        const field = String(col.field);
        const active = activeFilters.find(f => 'logic' in f
            ? f.filters.some(sf => 'field' in sf && sf.field === field)
            : f.field === field);
        let chip: HTMLElement;
        if (!active) chip = buildEmptyQuickChip(gc, col);
        else if ('logic' in active) {
            const sub = active.filters.filter((sf): sf is FilterDescriptor => 'field' in sf);
            chip = buildCompositeFilterChip(gc, active, sub, col.header ?? field);
        } else chip = buildFilterChip(gc, active, col.header ?? field);
        chip.classList.add('pdx-dg-toolbar-chip-quick');
        chip.dataset.field = field;
        chipsArea.appendChild(chip);
    }

    // Sort chips
    const sorts = gc.grid.sortState.peek() as SortDescriptor[];
    sorts.forEach((s, i) => {
        const cols = gc.grid!.columns.peek() as AnyColumn[];
        const col = cols.find(c => c.field === s.field);
        // `||`, not `??`: a column whose header is '' — the row's actions — sorted by its field would
        // read «↑ ×», a chip naming nothing. The field is at least a name.
        // Numbered when there is more than one level, as the headers are.
        chipsArea.appendChild(buildSortChip(gc, s, col?.header || s.field, sorts.length > 1 ? i + 1 : 0));
    });

    // Group chips, after the sort's.
    for (const chip of buildGroupChips(gc)) chipsArea.appendChild(chip);

    // Filter chips — composite filters render as a single chip. A quick filter's is drawn above.
    const filters = activeFilters;
    const cols = allCols;
    for (const f of filters) {
        if ('logic' in f) {
            // Composite (AND/OR) — single chip for both conditions
            const subFilters = f.filters.filter((sf): sf is FilterDescriptor => 'field' in sf);
            if (subFilters.length > 0 && !quickFields.has(subFilters[0].field)) {
                const field = subFilters[0].field;
                const col = cols.find(c => c.field === field);
                chipsArea.appendChild(buildCompositeFilterChip(gc, f, subFilters, col?.header ?? field));
            }
        } else if (!quickFields.has(f.field)) {
            const col = cols.find(c => c.field === f.field);
            chipsArea.appendChild(buildFilterChip(gc, f, col?.header ?? f.field));
        }
    }

    // With quick filters, «+ Add filter» is a «+» after the chips, for the other columns; its
    // accessible name is the same words.
    if (quickCols.length > 0 && addFilterBtn) {
        if (!addFilterBtn.dataset.compact) {
            addFilterBtn.dataset.compact = '';
            addFilterBtn.classList.remove('pdx-dg-toolbar-btn-text');
            addFilterBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
            i18nMark(addFilterBtn, 'filter.addFilter', 'label', 'title');
        }
        chipsArea.appendChild(addFilterBtn);
    }

    // Show/hide clear all button
    const clearAllBtn = bar.querySelector('.pdx-dg-toolbar-chip-remove-all') as HTMLElement;
    if (clearAllBtn) {
        clearAllBtn.style.display = filters.length > 0 ? '' : 'none';
    }

    // Batch mode: show/hide Save All / Revert buttons
    const batchSave = bar.querySelector('.pdx-dg-toolbar-batch-save') as HTMLElement;
    const batchRevert = bar.querySelector('.pdx-dg-toolbar-batch-revert') as HTMLElement;
    if (batchSave && batchRevert) {
        const hasChanges = gc.batchChanges.size > 0;
        batchSave.style.display = hasChanges ? '' : 'none';
        batchRevert.style.display = hasChanges ? '' : 'none';
        if (hasChanges) {
            batchSave.textContent = t('edit.saveAll') + ' (' + gc.batchChanges.size + ')';
        }
    }
}

// ─── Quick filter chip, not set yet ─────────────────────────

/** The column's name, muted, and a click that opens the column's own filter popover. */
function buildEmptyQuickChip(gc: GridContext, col: AnyColumn): HTMLElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pdx-dg-toolbar-chip';
    chip.dataset.empty = '';
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.textContent = String(col.header ?? col.field);
    chip.addEventListener('click', (e) => {
        e.stopPropagation();
        openFilterPopover(gc, col, chip);
    });
    return chip;
}

// ─── Sort chip ──────────────────────────────────────────────

/** `position` is the level's number, 1-based, or 0 when the sort has one level and needs none. */
function buildSortChip(gc: GridContext, sort: SortDescriptor, headerText: string, position = 0): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'pdx-dg-toolbar-chip pdx-dg-toolbar-chip-sort';

    if (position > 0) {
        const order = document.createElement('span');
        order.className = 'pdx-dg-sort-badge';
        order.textContent = String(position);
        chip.appendChild(order);
    }

    // Sort direction icon (arrow up or down)
    const icon = document.createElement('span');
    icon.className = 'pdx-dg-toolbar-chip-icon';
    icon.innerHTML = sort.dir === 'asc'
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
    chip.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = headerText;
    chip.appendChild(text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pdx-dg-toolbar-chip-remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', t('sort.remove').replace('{column}', String(headerText)));
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = gc.grid?.sortState.peek() as SortDescriptor[] ?? [];
        const updated = current.filter(s => s.field !== sort.field);
        gc.grid?.source.setSort(updated);
    });
    chip.appendChild(remove);

    // Click chip to toggle direction
    chip.addEventListener('click', () => {
        gc.grid?.sort(sort.field, sort.dir === 'asc' ? 'desc' : 'asc', true);
    });

    return chip;
}

// ─── Filter chip ────────────────────────────────────────────

function buildFilterChip(gc: GridContext, filter: FilterDescriptor, headerText: string): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'pdx-dg-toolbar-chip pdx-dg-toolbar-chip-filter';

    // Filter icon (small funnel)
    const icon = document.createElement('span');
    icon.className = 'pdx-dg-toolbar-chip-icon';
    icon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
    chip.appendChild(icon);

    const opLabel = t(`filter.${filter.operator}`) || filter.operator;
    // The column's LABEL for the value when it declares one, as a badge does: the stored code —
    // `"closed"` — would not match every cell of the column, which says «Closed».
    const cols = gc.grid?.columns.peek() as AnyColumn[] ?? [];
    const format = (cols.find(c => c.field === filter.field)?.def as { format?: unknown } | undefined)?.format;
    const valStr = filter.value == null ? ''
        : typeof format === 'function' ? String((format as (v: unknown, r: Record<string, unknown>) => unknown)(filter.value, {}) ?? '')
            : String(filter.value);
    const displayVal = valStr.length > 20 ? valStr.slice(0, 20) + '...' : valStr;
    const isNullOp = filter.operator === 'isnull' || filter.operator === 'isnotnull';

    const text = document.createElement('span');
    text.textContent = isNullOp
        ? `${headerText} ${opLabel}`
        : `${headerText} ${opLabel} "${displayVal}"`;
    chip.appendChild(text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pdx-dg-toolbar-chip-remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', t('filter.remove').replace('{column}', String(headerText)));
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFilter(gc, filter.field);
    });
    chip.appendChild(remove);

    // Click chip to edit filter (opens popover)
    chip.addEventListener('click', () => {
        const cols = gc.grid?.columns.peek() as AnyColumn[] ?? [];
        const col = cols.find(c => c.field === filter.field);
        if (col) openFilterPopover(gc, col, chip);
    });

    return chip;
}

// ─── Composite filter chip (AND/OR — single chip) ──────────

function buildCompositeFilterChip(
    gc: GridContext,
    composite: CompositeFilter,
    subFilters: FilterDescriptor[],
    headerText: string,
): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'pdx-dg-toolbar-chip pdx-dg-toolbar-chip-filter';

    const icon = document.createElement('span');
    icon.className = 'pdx-dg-toolbar-chip-icon';
    icon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
    chip.appendChild(icon);

    // Build readable description: "Name: contains "A" AND startsWith "B""
    const parts = subFilters.map(f => {
        const opLabel = t(`filter.${f.operator}`) || f.operator;
        const isNullOp = f.operator === 'isnull' || f.operator === 'isnotnull';
        if (isNullOp) return opLabel;
        const valStr = f.value != null ? String(f.value) : '';
        const displayVal = valStr.length > 15 ? valStr.slice(0, 15) + '...' : valStr;
        return `${opLabel} "${displayVal}"`;
    });

    const text = document.createElement('span');
    text.textContent = `${headerText}: ${parts.join(` ${composite.logic.toUpperCase()} `)}`;
    chip.appendChild(text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pdx-dg-toolbar-chip-remove';
    remove.textContent = '✕';
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFilter(gc, subFilters[0].field);
    });
    chip.appendChild(remove);

    chip.addEventListener('click', () => {
        const cols = gc.grid?.columns.peek() as AnyColumn[] ?? [];
        const col = cols.find(c => c.field === subFilters[0].field);
        if (col) openFilterPopover(gc, col, chip);
    });

    return chip;
}

// ─── Add filter popover (column picker) ─────────────────────

export function openAddFilterPopover(gc: GridContext, anchorEl: HTMLElement): void {
    if (!gc.grid) return;
    closeFilterPopover(); // Close any existing

    const cols = gc.grid.columns.peek() as AnyColumn[];
    // Exclude fields that already have an active filter
    const activeFields = new Set(
        flattenFilters(gc.grid.source.filter.peek() as (FilterDescriptor | CompositeFilter)[])
            .map(f => f.field),
    );
    const filterableCols = cols.filter(c => c.visible && canFilter(c) && !activeFields.has(c.field));

    if (filterableCols.length === 0) return; // All columns already filtered

    const title = document.createElement('div');
    title.className = 'pdx-dg-col-menu-title';
    title.textContent = t('filter.addFilter');

    openGridMenu(anchorEl, filterableCols.map(col => ({
        label: col.header,
        // Open filter popover anchored to the "+" button
        select: () => openFilterPopover(gc, col, anchorEl),
    })), {
        label: t('filter.addFilterMenu'),
        menuClass: 'pdx-dg-col-menu',
        itemClass: 'pdx-dg-col-menu-item',
        title,
        place: (menu, rect) => {
            menu.style.top = `${rect.bottom + 4}px`;
            const menuWidth = 200;
            if (rect.right > window.innerWidth - menuWidth) {
                menu.style.right = `${window.innerWidth - rect.right}px`;
            } else {
                menu.style.left = `${rect.left}px`;
            }
        },
    });
}

// ─── Helpers ────────────────────────────────────────────────

function flattenFilters(filters: (FilterDescriptor | CompositeFilter)[]): FilterDescriptor[] {
    const result: FilterDescriptor[] = [];
    for (const f of filters) {
        if ('logic' in f) {
            result.push(...flattenFilters(f.filters));
        } else {
            result.push(f);
        }
    }
    return result;
}

function removeFilter(gc: GridContext, field: string): void {
    if (!gc.grid) return;
    // Clear popover state for this field
    delete gc.popoverFilters[field];
    // Remove from DataSource filters
    const current = gc.grid.source.filter.peek() as (FilterDescriptor | CompositeFilter)[];
    const updated = current.filter(f => {
        if ('logic' in f) {
            // Remove entire composite if it contains this field
            return !f.filters.some(sf => 'field' in sf && sf.field === field);
        }
        return f.field !== field;
    });
    gc.grid.source.setFilter(updated);
}
