// pdx-transfer's elements, built by the script as the TypeScript version built them: a side's panel
// (header, select-all, filter, listbox), a move button, and a list's rows with their keyboard and
// drag handling. Beside the component, which holds the state and passes what each needs.

import { getComponentString } from '@pdxui/core';
import type { TransferItem } from './transfer-types';

export type Side = 'source' | 'target';

/** A side's panel. `onToggleAll` is the select-all box; `onSearch` the filter's input. */
export function buildPanel(side: Side, title: string, searchable: boolean, mode: string, handlers: {
    onToggleAll: (side: Side) => void;
    onSearch: (side: Side, text: string) => void;
}): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'pdx-transfer-panel';
    panel.setAttribute('data-part', 'panel');
    // role=group (NOT listbox): the real listbox is the inner .pdx-transfer-list; two nested
    // listboxes are invalid (axe aria-required-children/parent).
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', title);

    const header = document.createElement('div');
    header.className = 'pdx-transfer-header';

    if (mode === 'checkbox') {
        const lbl = document.createElement('label');
        const allCb = document.createElement('input');
        allCb.type = 'checkbox';
        allCb.className = 'pdx-transfer-select-all';
        allCb.addEventListener('change', () => handlers.onToggleAll(side));
        lbl.appendChild(allCb);
        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;
        lbl.appendChild(titleSpan);
        header.appendChild(lbl);
    } else {
        const titleSpan = document.createElement('span');
        titleSpan.className = 'pdx-transfer-title';
        titleSpan.textContent = title;
        header.appendChild(titleSpan);
    }

    const count = document.createElement('span');
    count.className = 'pdx-transfer-count';
    count.textContent = '0/0';
    header.appendChild(count);
    panel.appendChild(header);

    if (searchable) {
        const searchWrap = document.createElement('div');
        searchWrap.className = 'pdx-transfer-search';
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('data-part', 'search');
        input.placeholder = getComponentString('transfer', 'search')();
        // Named after its list: two fields both called "Search" were told apart by nothing.
        input.setAttribute('aria-label', getComponentString('transfer', 'searchIn')().replace('{list}', title));
        input.addEventListener('input', () => handlers.onSearch(side, input.value));
        searchWrap.appendChild(input);
        panel.appendChild(searchWrap);
    }

    const list = document.createElement('div');
    list.className = 'pdx-transfer-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('data-part', 'list');
    list.setAttribute('aria-label', title);
    if (mode !== 'direct') list.setAttribute('aria-multiselectable', 'true');
    panel.appendChild(list);
    return panel;
}

export function makeBtn(icon: string, label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdx-transfer-btn';
    btn.setAttribute('data-part', 'move');
    btn.setAttribute('aria-label', label);
    btn.textContent = icon;
    return btn;
}

/** What a list's rows need from the component. `stop` is each list's tab stop, kept across rebuilds. */
export type ListContext = {
    stop: Record<Side, string | null>;
    searchText: (side: Side) => string;
    onToggle: (side: Side, value: string) => void;
    onDragStart: (e: DragEvent, value: string, side: Side) => void;
    onDragEnd: (e: DragEvent) => void;
};

/** Make `row` its list's tab stop, and optionally move focus to it. */
function takeStop(container: HTMLElement, side: Side, row: HTMLElement, focus: boolean, stop: Record<Side, string | null>): void {
    for (const r of container.querySelectorAll<HTMLElement>('.pdx-transfer-item:not(.disabled)')) {
        r.tabIndex = r === row ? 0 : -1;
    }
    stop[side] = row.dataset.value ?? null;
    if (focus) row.focus();
}

// ── One tab stop per list ──
// Each list keeps one option in the tab order — the one used last — and a rebuild puts
// focus back where it was: the rebuild after a click or Space destroys the focused row,
// which would drop focus on <body>.
export function renderList(
    container: HTMLElement, items: TransferItem[], checked: Set<string>,
    side: Side, mode: string, isDraggable: boolean, list: ListContext,
): void {
    // Where focus was, so the rebuild can put it back: on the same option, or — when that
    // option has moved to the other list — on the one that took its place.
    const focused = container.contains(document.activeElement)
        ? (document.activeElement as HTMLElement).closest<HTMLElement>('.pdx-transfer-item') : null;
    const focusedValue = focused?.dataset.value ?? null;
    const focusedIndex = focused
        ? Array.from(container.querySelectorAll('.pdx-transfer-item:not(.disabled)')).indexOf(focused) : -1;
    container.innerHTML = '';
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'pdx-transfer-empty';
        empty.textContent = list.searchText(side) ? getComponentString('transfer', 'noMatch')() : getComponentString('transfer', 'noData')();
        container.appendChild(empty);
        return;
    }
    for (const item of items) {
        const isChecked = checked.has(item.value);
        const row = document.createElement('div');
        row.className = 'pdx-transfer-item'
            + (isChecked ? ' checked' : '')
            + (item.disabled ? ' disabled' : '')
            + (mode === 'direct' ? ' clickable' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('data-part', 'option');
        row.setAttribute('aria-selected', isChecked ? 'true' : 'false');
        // Disabled options expose aria-disabled (the presentational check is a <span>, so the
        // disabled state must be programmatic for assistive tech, not just the .disabled class).
        if (item.disabled) row.setAttribute('aria-disabled', 'true');

        // Checkbox only in checkbox mode
        if (mode === 'checkbox') {
            // A PRESENTATIONAL checkbox (a span, not an <input>): an interactive control inside a
            // role=option violates WAI-ARIA (axe nested-interactive). The state is already on the option's
            // aria-selected + the row's .checked class (the CSS draws the tick). The toggle stays
            // on the row's click. aria-hidden: outside the a11y tree.
            const cb = document.createElement('span');
            cb.className = 'pdx-transfer-check';
            cb.setAttribute('aria-hidden', 'true');
            row.appendChild(cb);
        }

        const label = document.createElement('span');
        label.className = 'pdx-transfer-item-label';
        label.textContent = item.label;
        row.appendChild(label);

        // Drag support
        if (isDraggable && !item.disabled) {
            row.draggable = true;
            row.addEventListener('dragstart', (e) => list.onDragStart(e, item.value, side));
            row.addEventListener('dragend', list.onDragEnd);
        }

        if (!item.disabled) {
            // A click focuses the option too (Chromium does, with a tabindex); the rebuild the
            // click triggers then puts focus back on it — see the end of this function.
            row.addEventListener('click', () => { list.stop[side] = item.value; list.onToggle(side, item.value); });
            // Keyboard nav, so the component is usable from the
            // keyboard: Space/Enter toggle, the arrows move the focus,
            // Home/End to the first/last.
            row.tabIndex = -1;
            row.dataset.value = item.value;
            row.addEventListener('focus', () => takeStop(container, side, row, false, list.stop));
            row.addEventListener('keydown', (e: KeyboardEvent) => {
                const focusables = () => Array.from(
                    container.querySelectorAll<HTMLElement>('.pdx-transfer-item:not(.disabled)'));
                const go = (to: HTMLElement | undefined): void => { if (to) takeStop(container, side, to, true, list.stop); };
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    list.stop[side] = row.dataset.value!;
                    list.onToggle(side, row.dataset.value!);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const rows = focusables();
                    const idx = rows.indexOf(row);
                    go(e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1]);
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    go(focusables()[0]);
                } else if (e.key === 'End') {
                    e.preventDefault();
                    const rows = focusables();
                    go(rows[rows.length - 1]);
                }
            });
        }
        container.appendChild(row);
    }

    // Exactly one tab stop: the option used last, else the one now in its place, else the first.
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.pdx-transfer-item:not(.disabled)'));
    if (rows.length === 0) return;
    const byValue = (v: string | null): HTMLElement | undefined => (v ? rows.find(r => r.dataset.value === v) : undefined);
    const stop = byValue(focusedValue) ?? byValue(list.stop[side])
        ?? (focusedIndex >= 0 ? rows[Math.min(focusedIndex, rows.length - 1)] : rows[0]);
    takeStop(container, side, stop, focused !== null, list.stop);
}
