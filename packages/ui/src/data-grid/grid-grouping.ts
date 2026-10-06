// Grid grouping — render grouped rows with expand/collapse headers + aggregates.

import type { GridContext, AnyColumn } from './grid-context';
import { GRID_WIDGET } from './grid-context';
import { t } from './grid-i18n';

// ─── Collapsed state helpers (per-instance via GridContext) ────

function groupKey(field: string, value: unknown): string {
    return `${field}::${String(value)}`;
}

export function isGroupCollapsed(gc: GridContext, field: string, value: unknown): boolean {
    return gc.collapsedGroups.has(groupKey(field, value));
}

export function toggleGroup(gc: GridContext, field: string, value: unknown): void {
    const key = groupKey(field, value);
    if (gc.collapsedGroups.has(key)) gc.collapsedGroups.delete(key);
    else gc.collapsedGroups.add(key);
}

// ─── Render grouped rows ────────────────────────────────────

interface GroupResult {
    field: string;
    value: unknown;
    items: Record<string, unknown>[] | GroupResult[];
    aggregates?: Record<string, number>;
}

/**
 * Render grouped data into the body container.
 * Groups show a header row with expand/collapse + aggregate info.
 * Expanded groups show their data rows.
 */
export function renderGroupedRows(
    gc: GridContext,
    container: HTMLElement,
    groups: GroupResult[],
    cols: AnyColumn[],
    renderRowFn: (gc: GridContext, container: HTMLElement, rows: Record<string, unknown>[], cols: AnyColumn[], append?: boolean) => void,
    depth: number = 0,
): void {
    for (const group of groups) {
        const key = groupKey(group.field, group.value);
        const collapsed = gc.collapsedGroups.has(key);
        const itemCount = countItems(group);

        // Group header row: one cell spanning the columns (grid-a11y sets its aria-colspan), holding
        // the toggle button — reachable from the keyboard, named with its count, and saying whether
        // the group is open. A row with a click handler and no button reaches none of that.
        const headerRow = document.createElement('div');
        headerRow.className = 'pdx-dg-group-row';
        headerRow.setAttribute('role', 'row');
        headerRow.setAttribute('data-group-key', key);
        headerRow.style.paddingLeft = `${12 + depth * 20}px`;

        const cell = document.createElement('div');
        cell.className = 'pdx-dg-group-cell';
        cell.setAttribute('role', 'gridcell');
        headerRow.appendChild(cell);

        const colDef = cols.find(c => c.field === group.field);
        const fieldLabel = colDef?.header ?? group.field;
        const valueText = formatGroupValue(group.value, colDef, group);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'pdx-dg-group-toggle';
        toggle.setAttribute(GRID_WIDGET, '');
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', t(itemCount === 1 ? 'group.toggleOne' : 'group.toggle')
            .replace('{column}', String(fieldLabel))
            .replace('{value}', valueText)
            .replace('{count}', String(itemCount)));
        cell.appendChild(toggle);

        // Expand/collapse chevron
        const chevron = document.createElement('span');
        chevron.className = 'pdx-dg-group-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = collapsed ? '▶' : '▼';
        toggle.appendChild(chevron);

        // Group label
        const label = document.createElement('span');
        label.className = 'pdx-dg-group-label';
        const strong = document.createElement('strong');
        strong.textContent = fieldLabel + ':';
        label.appendChild(strong);
        label.appendChild(document.createTextNode(' ' + valueText));
        toggle.appendChild(label);

        // Item count badge
        const count = document.createElement('span');
        count.className = 'pdx-dg-group-count';
        count.textContent = `(${itemCount})`;
        toggle.appendChild(count);

        // Aggregates
        if (group.aggregates) {
            const aggSpan = document.createElement('span');
            aggSpan.className = 'pdx-dg-group-agg';
            const parts: string[] = [];
            for (const [key, val] of Object.entries(group.aggregates)) {
                const num = typeof val === 'number' ? val.toLocaleString() : String(val);
                parts.push(`${key}: ${num}`);
            }
            aggSpan.textContent = parts.join(' · ');
            cell.appendChild(aggSpan);
        }

        // Click anywhere on the row to toggle — the button's click (and its Enter/Space) bubbles here
        headerRow.addEventListener('click', () => {
            toggleGroup(gc, group.field, group.value);
            gc.emit('__group-toggle', { field: group.field, value: group.value });
        });
        headerRow.style.cursor = 'pointer';

        container.appendChild(headerRow);

        // Render children if expanded
        if (!collapsed) {
            if (isGroupResultArray(group.items)) {
                renderGroupedRows(gc, container, group.items as GroupResult[], cols, renderRowFn, depth + 1);
            } else {
                const rows = group.items as Record<string, unknown>[];
                renderRowFn(gc, container, rows, cols, true);
            }
        }
    }
}

function isGroupResultArray(items: unknown[]): boolean {
    return items.length > 0 && typeof items[0] === 'object' && items[0] !== null && 'field' in (items[0] as object);
}

function countItems(group: GroupResult): number {
    if (isGroupResultArray(group.items)) {
        return (group.items as GroupResult[]).reduce((sum, g) => sum + countItems(g), 0);
    }
    return group.items.length;
}

/**
 * A group's value as the column shows it: its `format` when it has one, so a status groups under
 * «Open» and not `open`. The first row of the group is the row the formatter is handed.
 */
function formatGroupValue(value: unknown, col?: AnyColumn, group?: GroupResult): string {
    if (value == null) return t('group.empty');
    const format = (col?.def as { format?: unknown } | undefined)?.format;
    if (typeof format === 'function') {
        const first = group && !isGroupResultArray(group.items) ? (group.items[0] as Record<string, unknown>) : {};
        return String(format(value, first ?? {}));
    }
    if (typeof value === 'boolean') return t(value ? 'filter.yes' : 'filter.no');
    if (value instanceof Date) return value.toLocaleDateString();
    return String(value);
}
