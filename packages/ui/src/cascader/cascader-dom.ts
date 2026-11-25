// pdx-cascader's open panel, drawn as the TypeScript version drew it: the flat list of search
// results, or the columns of the active path. Beside the component, which holds the state and
// passes what the panel needs in a PanelView; each function returns the id of the option the
// keyboard is on, for aria-activedescendant.

import { getComponentString } from '@pdxui/core';
import { uiString, format, uiAttr } from '../shared/i18n';
import type { CascaderNode } from './cascader-types';

/** What the panel reads from the component and calls back into. */
export type PanelView = {
    panelId: string;
    /** The keyboard is driving: only then is the active option drawn with a ring. */
    kbd: boolean;
    loading: Set<string>;
    /** The parent's `option` snippet, when it set one. */
    optionSnippet: ((node: CascaderNode, level: number, selected: boolean) => Node | undefined) | undefined;
    onSearchSelect: (path: CascaderNode[]) => void;
    /** A click on an option of a column: the component moves the cursor there and acts on it. */
    onColumnClick: (node: CascaderNode, level: number) => void;
};

/** The search results, a listbox of options reached with the arrows, or the no-match status. */
export function renderResults(
    into: HTMLElement, filtered: { path: CascaderNode[]; labels: string }[], searchCursor: number, v: PanelView,
): string | null {
    const list = document.createElement('div');
    list.className = 'pdx-cascader-flat-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('data-part', 'list');
    uiAttr(list, 'aria-label', () => uiString('cascader', 'results'));
    let activeId: string | null = null;
    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'pdx-cascader-loading';
        empty.setAttribute('role', 'status');
        empty.textContent = getComponentString('cascader', 'noMatch')();
        into.appendChild(empty);
        return null;
    }
    filtered.forEach((item, i) => {
        const row = document.createElement('div');
        const off = item.path.some(n => n.disabled);
        row.id = `${v.panelId}-r-${i}`;
        row.className = 'pdx-cascader-flat-item' + (i === searchCursor && v.kbd ? ' focus' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('data-part', 'option');
        row.setAttribute('aria-selected', 'false');
        if (off) row.setAttribute('aria-disabled', 'true');
        if (i === searchCursor) activeId = row.id;
        row.textContent = item.labels;
        if (!off) row.addEventListener('click', () => v.onSearchSelect(item.path));
        list.appendChild(row);
    });
    into.appendChild(list);
    return activeId;
}

/** The columns of the active path, and the status column of a branch being fetched. */
export function renderColumns(
    into: HTMLElement, columns: { items: CascaderNode[]; activeValue: string }[], cursorLevel: number, v: PanelView,
): string | null {
    const columnsWrap = document.createElement('div');
    columnsWrap.style.display = 'flex';
    let activeId: string | null = null;
    for (let level = 0; level < columns.length; level++) {
        const col = columns[level];
        const colEl = document.createElement('div');
        colEl.className = 'pdx-cascader-column';
        colEl.setAttribute('role', 'listbox');
        colEl.setAttribute('data-part', 'list');
        // A4 (#287): the list holding a branch being fetched is busy. The status row that says so
        // is in a column of its own, so this does not hold its announcement back.
        if (col.items.some((n) => v.loading.has(n.value))) colEl.setAttribute('aria-busy', 'true');
        // The column's accessible name (role=listbox requires it — axe aria-input-field-name).
        uiAttr(colEl, 'aria-label', () => format(uiString('cascader', 'level'), { n: level + 1 }));

        col.items.forEach((node, index) => {
            const item = document.createElement('div');
            const isActive = node.value === col.activeValue;
            const hasChildren = (node.children && node.children.length > 0) || (node.isLeaf === false);
            const isLoading = v.loading.has(node.value);
            const isCursor = isActive && level === cursorLevel;
            item.id = `${v.panelId}-o-${level}-${index}`;
            item.className = 'pdx-cascader-item' + (isActive ? ' active' : '') + (isCursor && v.kbd ? ' focus' : '') + (node.disabled ? ' disabled' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('data-part', 'option');
            item.setAttribute('aria-selected', String(isActive));
            // A class alone would offer disabled options as normal ones.
            if (node.disabled) item.setAttribute('aria-disabled', 'true');
            if (isLoading) item.setAttribute('aria-busy', 'true');
            if (isCursor) activeId = item.id;

            const content = v.optionSnippet?.(node, level, isActive);
            if (content) {
                item.appendChild(content);
            } else {
                const label = document.createElement('span');
                label.className = 'pdx-cascader-item-label';
                label.textContent = node.label;
                item.appendChild(label);
            }

            if (hasChildren) {
                const arrow = document.createElement('span');
                arrow.className = 'pdx-cascader-item-arrow';
                arrow.textContent = isLoading ? '⋯' : '›';
                item.appendChild(arrow);
            }

            item.addEventListener('click', () => v.onColumnClick(node, level));
            colEl.appendChild(item);
        });
        columnsWrap.appendChild(colEl);
    }

    // A branch being fetched: the column its children will fill says so, in words, with
    // the spinner, not only with the arrow turning «⋯». The busy state is on the option (above), not on this
    // column: a busy region may hold back its announcements until it is no longer busy,
    // which here is when the row is gone. The text is written a frame after the status
    // row is inserted, so the live region announces it (as pdx-block-ui).
    const lastCol = columns[columns.length - 1];
    if (lastCol && v.loading.has(lastCol.activeValue)) {
        const loadingText = getComponentString('cascader', 'loading')();
        const colEl = document.createElement('div');
        colEl.className = 'pdx-cascader-column pdx-cascader-column-loading';
        const row = document.createElement('div');
        row.className = 'pdx-cascader-loading';
        row.setAttribute('role', 'status');
        const spinner = document.createElement('span');
        spinner.className = 'pdx-cascader-spinner';
        spinner.setAttribute('data-part', 'spinner');
        spinner.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        row.append(spinner, text);
        colEl.appendChild(row);
        columnsWrap.appendChild(colEl);
        requestAnimationFrame(() => { text.textContent = loadingText; });
    }
    into.appendChild(columnsWrap);
    return activeId;
}
