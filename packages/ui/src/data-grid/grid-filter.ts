// Grid inline filter row — type-aware filter inputs under header.

import type { FilterOperator } from '@pdxui/core';
import type { GridContext, AnyColumn } from './grid-context';
import { applyColSize, NAV_SKIP, canFilter } from './grid-context';
import { t } from './grid-i18n';
import { getOperatorsForColumn } from './grid-filter-popover';
import { buildEnumSelect } from '../shared/filter-popover';
import type { FilterFieldInfo } from '../shared/filter-popover';
import { RELATIVE_DATE_OPS } from '@pdxui/core';
import { openGridMenu } from './grid-menu';

// ─── Filter state (per-grid via gc.inlineFilterValues) ─────

let filterTimer: ReturnType<typeof setTimeout> | null = null;

export function clearAllFilters(gc: GridContext): void {
    const fv = gc.inlineFilterValues;
    for (const key of Object.keys(fv)) {
        delete fv[key];
    }
    gc.grid?.source.setFilter([]);
}

/** Default operator per column type. */
function defaultOpForType(type: string): FilterOperator {
    switch (type) {
        case 'number': case 'currency': return 'gte';
        case 'boolean': return 'eq';
        case 'date': return 'gte';
        case 'enum': return 'in';
        default: return 'contains';
    }
}

function applyFilters(gc: GridContext): void {
    if (!gc.grid) return;
    const fv = gc.inlineFilterValues;
    const ops = gc.inlineFilterOps;
    const filters: { field: string; operator: FilterOperator; value: unknown }[] = [];
    for (const [field, val] of Object.entries(fv)) {
        if (val == null || val === '' || val === 'all') continue;
        if (Array.isArray(val) && val.length === 0) continue; // multi-select enum: nothing selected
        const col = gc.grid.columns.peek().find((c: AnyColumn) => c.field === field);
        if (!col) continue;
        const op = (ops[field] ?? defaultOpForType(col.type)) as FilterOperator;
        const coerced = col.type === 'boolean' ? (val === 'true') : (col.type === 'number' || col.type === 'currency') ? Number(val) : val;
        filters.push({ field, operator: op, value: coerced });
    }
    gc.grid.source.setFilter(filters);
}

function debouncedApplyFilters(gc: GridContext): void {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(() => applyFilters(gc), 300);
}

// ─── Build filter row ───────────────────────────────────────

export function buildFilterRow(gc: GridContext, cols: AnyColumn[]): HTMLElement {
    // A row of the grid (its inputs sit in cells, as a grid's content must), which the arrows pass
    // over: the inputs keep their own tab stops and their own arrow keys.
    const row = document.createElement('div');
    row.className = 'pdx-dg-filter-row';
    row.setAttribute('role', 'row');
    row.setAttribute(NAV_SKIP, '');

    // Spacer for checkbox column
    if (gc.getSelectionMode() !== 'none') {
        const spacer = document.createElement('div');
        spacer.className = 'pdx-dg-filter-cell pdx-dg-checkbox';
        spacer.setAttribute('role', 'gridcell');
        row.appendChild(spacer);
    }

    const visibleCols = cols.filter(c => c.visible);
    for (const col of visibleCols) {
        const cell = document.createElement('div');
        cell.className = 'pdx-dg-filter-cell';
        cell.setAttribute('role', 'gridcell');
        applyColSize(cell, col);

        if (!canFilter(col)) {
            row.appendChild(cell);
            continue;
        }

        // Filter slot: filter:{field}
        const filterSlot = gc.getSlot(`filter:${col.field}`);
        if (filterSlot) {
            const content = filterSlot({ col, field: col.field });
            cell.appendChild(content instanceof DocumentFragment ? content : content);
            row.appendChild(cell);
            continue;
        }

        const input = createFilterInput(gc, col);
        if (input) cell.appendChild(input);
        row.appendChild(cell);
    }

    return row;
}

/**
 * Name a filter control after its column ("Filter Name"): a placeholder is not a name, and the
 * inputs have nothing else. pdx-select takes its name as `label`; the inputs and the
 * date picker take `aria-label` (their ariaLabel prop).
 */
function nameFilterControl<T extends HTMLElement>(el: T, col: AnyColumn): T {
    const name = t('filter.forColumn').replace('{column}', String(col.header ?? ''));
    if (el.tagName === 'PDX-SELECT') (el as T & { label: string }).label = name;
    else el.setAttribute('aria-label', name);
    return el;
}

function createFilterInput(gc: GridContext, col: AnyColumn): HTMLElement | null {
    // Enum/lookup filter — multi-select (search + server-side options), operator `in`.
    const enumLike = (col.def.filterOptions && col.def.filterOptions.length > 0) || !!col.def.filterOptionsSource;
    if (enumLike) {
        const fieldInfo: FilterFieldInfo = {
            field: col.field, label: col.header, type: col.type as any,
            operators: col.def.filterOperators, options: col.def.filterOptions,
            multiple: col.def.filterMultiple, searchable: col.def.filterSearchable,
            optionsSource: col.def.filterOptionsSource,
        };
        const cur = gc.inlineFilterValues[col.field];
        const currentValues = Array.isArray(cur) ? cur.map(String) : (cur && cur !== 'all' ? [String(cur)] : []);
        return nameFilterControl(buildEnumSelect(fieldInfo, currentValues, (vals) => {
            gc.inlineFilterValues[col.field] = vals;
            gc.inlineFilterOps[col.field] = 'in';
            applyFilters(gc);
        }), col);
    }

    switch (col.type) {
        case 'boolean': {
            const sel = nameFilterControl(document.createElement('pdx-select') as any, col);
            sel.size = 'sm';
            sel.placeholder = t('filter.all');
            sel.clearable = true;
            requestAnimationFrame(() => {
                sel.options = [
                    { label: t('filter.yes'), value: 'true' },
                    { label: t('filter.no'), value: 'false' },
                ];
                if (gc.inlineFilterValues[col.field] && gc.inlineFilterValues[col.field] !== 'all') {
                    sel.value = String(gc.inlineFilterValues[col.field]);
                }
            });
            sel.addEventListener('pdx-change', (e: CustomEvent) => {
                gc.inlineFilterValues[col.field] = e.detail.value ?? 'all';
                applyFilters(gc);
            });
            sel.addEventListener('pdx-clear', () => {
                gc.inlineFilterValues[col.field] = 'all';
                applyFilters(gc);
            });
            return sel;
        }
        case 'number': case 'currency': {
            const input = nameFilterControl(document.createElement('pdx-number-input') as any, col);
            input.size = 'sm';
            input.placeholder = t('filter.minPlaceholder');
            input.controls = 'none';
            requestAnimationFrame(() => {
                if (gc.inlineFilterValues[col.field] != null && gc.inlineFilterValues[col.field] !== '') {
                    input.value = Number(gc.inlineFilterValues[col.field]);
                } else {
                    input.value = null;
                }
            });
            input.addEventListener('pdx-change', (e: CustomEvent) => {
                gc.inlineFilterValues[col.field] = e.detail.value ?? '';
                debouncedApplyFilters(gc);
            });
            return wrapWithOpDropdown(gc, col, input);
        }
        case 'date': {
            const picker = nameFilterControl(document.createElement('pdx-date-picker') as any, col);
            picker.size = 'sm';
            picker.placeholder = t('filter.fromPlaceholder');
            picker.clearable = true;
            if (gc.inlineFilterValues[col.field]) {
                requestAnimationFrame(() => { picker.value = String(gc.inlineFilterValues[col.field]); });
            }
            picker.addEventListener('pdx-change', (e: CustomEvent) => {
                gc.inlineFilterValues[col.field] = e.detail.value ?? '';
                debouncedApplyFilters(gc);
            });
            picker.addEventListener('pdx-clear', () => {
                gc.inlineFilterValues[col.field] = '';
                applyFilters(gc);
            });
            return wrapWithOpDropdown(gc, col, picker);
        }
        default: {
            const input = nameFilterControl(document.createElement('pdx-input') as any, col);
            input.size = 'sm';
            input.placeholder = t('filter.placeholder');
            input.clearable = true;
            if (gc.inlineFilterValues[col.field]) {
                requestAnimationFrame(() => { input.value = String(gc.inlineFilterValues[col.field]); });
            }
            input.addEventListener('pdx-input', (e: CustomEvent) => {
                gc.inlineFilterValues[col.field] = e.detail.value ?? '';
                debouncedApplyFilters(gc);
            });
            input.addEventListener('pdx-clear', () => {
                gc.inlineFilterValues[col.field] = '';
                applyFilters(gc);
            });
            return wrapWithOpDropdown(gc, col, input);
        }
    }
}

/** Wrap a filter input with an operator dropdown for text/number/date columns. */
function wrapWithOpDropdown(gc: GridContext, col: AnyColumn, input: HTMLElement): HTMLElement {
    // `between` (two inputs) and relative-date presets (no value) → popover only.
    const inlineSkip = new Set(['between', ...RELATIVE_DATE_OPS]);
    const operators = getOperatorsForColumn(col).filter(o => !inlineSkip.has(o.value));
    if (operators.length <= 1) return input; // No dropdown if only one operator

    const wrap = document.createElement('div');
    wrap.className = 'pdx-dg-filter-cell-with-op';

    const opBtn = document.createElement('button');
    opBtn.type = 'button';
    opBtn.className = 'pdx-dg-filter-op-btn';
    opBtn.setAttribute('aria-haspopup', 'menu');
    opBtn.setAttribute('aria-expanded', 'false');
    const currentOp = gc.inlineFilterOps[col.field] ?? defaultOpForType(col.type);
    showOperator(opBtn, col, operators.find(o => o.value === currentOp));

    opBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openOpDropdown(gc, col, opBtn, operators);
    });

    wrap.appendChild(opBtn);
    input.style.flex = '1';
    input.style.minWidth = '0';
    wrap.appendChild(input);

    return wrap;
}

/** Truncate operator label for the tiny button. */
function shortLabel(label: string): string {
    const map: Record<string, string> = {
        'Contains': '⊃', 'Equals': '=', 'Not equals': '≠',
        'Starts with': 'A…', 'Ends with': '…Z',
        'Greater than': '>', 'Greater or equal': '≥',
        'Less than': '<', 'Less or equal': '≤',
        'After': '>', 'On or after': '≥', 'Before': '<', 'On or before': '≤',
        'Is empty': '∅', 'Is not empty': '∃',
    };
    return map[label] ?? label.slice(0, 2);
}

/**
 * Show the operator on its button: the symbol drawn, the operator in the tooltip, and a name that
 * says both the column and the operator ("Name filter: Contains"). The symbol alone is not a name.
 */
function showOperator(btn: HTMLElement, col: AnyColumn, op: { label: string } | undefined): void {
    btn.textContent = op ? shortLabel(op.label) : '=';
    btn.title = op?.label ?? '';
    btn.setAttribute('aria-label', t('filter.operatorFor')
        .replace('{column}', String(col.header ?? ''))
        .replace('{operator}', op?.label ?? ''));
}

/** Open the menu of the filter's operators, on the current one. */
function openOpDropdown(gc: GridContext, col: AnyColumn, anchorEl: HTMLElement, operators: { value: string; label: string }[]): void {
    const current = gc.inlineFilterOps[col.field] ?? defaultOpForType(col.type);
    openGridMenu(anchorEl, operators.map(op => ({
        label: op.label,
        checked: op.value === current,
        select: () => {
            gc.inlineFilterOps[col.field] = op.value;
            showOperator(anchorEl, col, op);
            // Re-apply filters with new operator
            if (gc.inlineFilterValues[col.field] != null && gc.inlineFilterValues[col.field] !== '') {
                applyFilters(gc);
            }
        },
    })), {
        label: t('filter.operatorMenu').replace('{column}', String(col.header ?? '')),
        radio: true,
        menuClass: 'pdx-dg-filter-op-dropdown',
        itemClass: 'pdx-dg-filter-op-item',
        place: (menu, rect) => {
            menu.style.top = `${rect.bottom + 2}px`;
            menu.style.left = `${rect.left}px`;
        },
    });
}
