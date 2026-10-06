// Grid header filter popover — delegates to shared filter-popover module.
// Bridges GridContext with the standalone filter popover.

import type { FilterOperator, CompositeFilter } from '@pdxui/core';
import type { GridContext, AnyColumn } from './grid-context';
import { t } from './grid-i18n';
import {
    openFilterPopoverFor, closeFilterPopover as closeSharedPopover,
    stateToFilter, getFieldOperators, FILTER_BLANK, makeFilterDialog,
} from '../shared/filter-popover';
import type { FilterFieldInfo, FilterConditionState } from '../shared/filter-popover';

// ─── Helpers ───────────────────────────────────────────────

/** Get operators for a column — delegates to shared module. */
export function getOperatorsForColumn(col: AnyColumn) {
    return getFieldOperators(colToFieldInfo(col));
}

/** Check if a column has an active popover filter. */
export function isColumnFiltered(gc: GridContext, field: string): boolean {
    const f = gc.popoverFilters[field];
    return !!(f && f.val1);
}

/** Convert AnyColumn to FilterFieldInfo for the shared module. */
function colToFieldInfo(col: AnyColumn): FilterFieldInfo {
    return {
        field: col.field,
        label: col.header,
        type: col.type as any,
        operators: col.def.filterOperators,
        options: col.def.filterOptions,
        multiple: col.def.filterMultiple,
        searchable: col.def.filterSearchable,
        optionsSource: col.def.filterOptionsSource,
        setFilter: col.def.filterSet,
    };
}

// ─── Popover management ─────────────────────────────────────

export function closeFilterPopover(): void {
    closeSharedPopover();
}

export function openFilterPopover(
    gc: GridContext,
    col: AnyColumn,
    anchorEl: HTMLElement,
): void {
    if (col.type === 'boolean') return;

    const fieldInfo = colToFieldInfo(col);
    const ops = getFieldOperators(fieldInfo);
    const defaultOp = ops[0]?.value ?? 'contains';

    // Load existing filter state or create default
    if (!gc.popoverFilters[col.field]) {
        gc.popoverFilters[col.field] = {
            op1: defaultOp as string,
            val1: '',
            logic: 'and',
            op2: defaultOp as string,
            val2: '',
        };
    }
    const state = gc.popoverFilters[col.field] as unknown as FilterConditionState;

    // Custom slot: filter-popover:{field}
    const popoverSlot = gc.getSlot(`filter-popover:${col.field}`);
    if (popoverSlot) {
        openCustomSlotPopover(gc, col, anchorEl, popoverSlot, state);
        return;
    }

    const callbacks = {
        onApply: (s: FilterConditionState) => { gc.popoverFilters[col.field] = s as any; applyPopoverFilters(gc); },
        onClear: () => { delete gc.popoverFilters[col.field]; applyPopoverFilters(gc); },
        onClose: () => {},
    };
    // Focus returns to this column's funnel as it is at close: the header is rebuilt — on Apply
    // always, to mark the column filtered — and the anchor may be gone by then.
    const opener = () => funnelOf(gc, col.field) ?? (anchorEl.isConnected ? anchorEl : null);

    // Set/Excel filter: derive the distinct values from the data, then open the
    // searchable checklist. (Blanks) maps null → FILTER_BLANK sentinel.
    const src = gc.grid?.source as { distinctValues?: (f: string) => Promise<unknown[]> } | undefined;
    if (col.def.filterSet && src?.distinctValues) {
        src.distinctValues(col.field).then(vals => {
            fieldInfo.options = vals.map(v => v == null
                ? { label: t('filter.blanks'), value: FILTER_BLANK }
                : { label: String(v), value: v });
            openFilterPopoverFor(fieldInfo, state, anchorEl, callbacks, { opener });
        });
        return;
    }

    // Delegate to shared filter popover
    openFilterPopoverFor(fieldInfo, state, anchorEl, callbacks, { opener });
}

/** A column's header filter button, as the header is now. */
function funnelOf(gc: GridContext, field: string): HTMLElement | null {
    return gc.getHeaderEl?.()?.querySelector<HTMLElement>(
        `[role="columnheader"][data-field="${CSS.escape(field)}"] .pdx-dg-filter-icon`) ?? null;
}

// ─── Custom slot popover (grid-specific) ───────────────────

function openCustomSlotPopover(
    gc: GridContext,
    col: AnyColumn,
    anchorEl: HTMLElement,
    slotFn: Function,
    _state: FilterConditionState,
): void {
    closeFilterPopover();

    const popover = document.createElement('div');
    popover.className = 'pdx-dg-filter-popover';
    popover.style.position = 'fixed';
    popover.style.zIndex = '1000';

    const title = document.createElement('div');
    title.className = 'pdx-dg-fp-title';
    title.textContent = t('filter.title').replace('{field}', col.header);
    popover.appendChild(title);

    // A dialog like the built-in popover. Apply and Clear close THIS popover, not through
    // closeFilterPopover(), which closes the shared one and would leave a custom popover open after Apply.
    const dialog = makeFilterDialog(popover, col.header,
        () => funnelOf(gc, col.field) ?? (anchorEl.isConnected ? anchorEl : null), () => dialog.closing(cleanup));
    const applyFn = () => dialog.closing(() => { applyPopoverFilters(gc); cleanup(); });
    const clearFn = () => dialog.closing(() => { delete gc.popoverFilters[col.field]; applyPopoverFilters(gc); cleanup(); });
    const content = slotFn({ col, apply: applyFn, clear: clearFn });
    popover.appendChild(content instanceof DocumentFragment ? content : content);

    const rect = anchorEl.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 4}px`;
    if (rect.left + 270 > window.innerWidth) {
        popover.style.right = `${window.innerWidth - rect.right}px`;
    } else {
        popover.style.left = `${rect.left}px`;
    }

    document.body.appendChild(popover);

    const cleanup = () => {
        popover.remove();
        document.removeEventListener('pointerdown', onOut, true);
    };
    const onOut = (e: MouseEvent) => {
        if (!popover.contains(e.target as Node) && e.target !== anchorEl) cleanup();
    };
    setTimeout(() => document.addEventListener('pointerdown', onOut, true), 0);
}

// ─── Apply popover filters to DataSource ────────────────────

function applyPopoverFilters(gc: GridContext): void {
    if (!gc.grid) return;

    const allFilters: ({ field: string; operator: FilterOperator; value: unknown } | CompositeFilter)[] = [];

    for (const [field, rawState] of Object.entries(gc.popoverFilters)) {
        const state = rawState as unknown as FilterConditionState;
        const filter = stateToFilter(field, state);
        if (filter) allFilters.push(filter);
    }

    gc.grid.source.setFilter(allFilters);
}
