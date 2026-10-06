// Shared column chooser — visibility toggle + drag-to-reorder menu.
// Reusable by grid column menu, external toolbar buttons, or any component.

// ─── Types ─────────────────────────────────────────────────

import { uiString } from './i18n';

export interface ColumnChooserItem {
    field: string;
    header: string;
    visible: boolean;
}

export interface ColumnChooserCallbacks {
    onToggle: (field: string) => void;
    onReorder: (fromField: string, toField: string) => void;
}

// ─── Column Chooser Menu ───────────────────────────────────

let _activeMenu: HTMLElement | null = null;
/** The element that opened the menu: its aria-expanded says whether the menu is open. */
let _activeAnchor: HTMLElement | null = null;
/** Takes the open menu's outside-click and scroll listeners away, attached or still pending. */
let _detach: (() => void) | null = null;

export function closeColumnChooser(): void {
    if (_activeMenu) { _activeMenu.remove(); _activeMenu = null; }
    if (_activeAnchor) { _activeAnchor.setAttribute('aria-expanded', 'false'); _activeAnchor = null; }
    if (_detach) { _detach(); _detach = null; }
}

/** Open a column chooser dropdown anchored to an element. */
export function openColumnChooser(
    columns: ColumnChooserItem[],
    anchorEl: HTMLElement,
    callbacks: ColumnChooserCallbacks,
): void {
    closeColumnChooser();

    const menu = document.createElement('div');
    menu.className = 'pdx-dg-col-menu';
    _activeMenu = menu;
    _activeAnchor = anchorEl;
    anchorEl.setAttribute('aria-expanded', 'true');

    // Title
    const title = document.createElement('div');
    title.className = 'pdx-dg-col-menu-title';
    title.textContent = uiString('shared', 'columns');
    menu.appendChild(title);

    // Column list
    const list = document.createElement('div');
    list.className = 'pdx-dg-col-menu-list';
    menu.appendChild(list);

    let dragField: string | null = null;

    function buildItems(): void {
        list.innerHTML = '';

        for (const col of columns) {
            const row = document.createElement('div');
            row.className = 'pdx-dg-col-menu-item';
            row.setAttribute('data-field', col.field);
            row.draggable = true;

            // Drag handle
            const grip = document.createElement('span');
            grip.className = 'pdx-dg-col-menu-grip';
            grip.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/></svg>';
            row.appendChild(grip);

            // Visibility checkbox
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = col.visible;
            cb.setAttribute('aria-label', col.header);   // the span beside it is not its label
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                callbacks.onToggle(col.field);
                col.visible = !col.visible;
            });
            row.appendChild(cb);

            // Label
            const label = document.createElement('span');
            label.textContent = col.header;
            row.appendChild(label);

            // Drag reorder
            row.addEventListener('dragstart', (e) => {
                dragField = col.field;
                row.classList.add('pdx-dg-col-menu-item-dragging');
                e.dataTransfer!.effectAllowed = 'move';
                e.dataTransfer!.setData('text/plain', col.field);
            });
            row.addEventListener('dragend', () => {
                dragField = null;
                row.classList.remove('pdx-dg-col-menu-item-dragging');
                list.querySelectorAll('.pdx-dg-col-menu-item-drop').forEach(el =>
                    el.classList.remove('pdx-dg-col-menu-item-drop'));
            });
            row.addEventListener('dragover', (e) => {
                if (!dragField || dragField === col.field) return;
                e.preventDefault();
                e.dataTransfer!.dropEffect = 'move';
                row.classList.add('pdx-dg-col-menu-item-drop');
            });
            row.addEventListener('dragleave', () => {
                row.classList.remove('pdx-dg-col-menu-item-drop');
            });
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('pdx-dg-col-menu-item-drop');
                if (!dragField || dragField === col.field) return;
                callbacks.onReorder(dragField, col.field);
                // Reorder the local array to reflect new order
                const fromIdx = columns.findIndex(c => c.field === dragField);
                const toIdx = columns.findIndex(c => c.field === col.field);
                if (fromIdx >= 0 && toIdx >= 0) {
                    const moved = columns.splice(fromIdx, 1)[0];
                    columns.splice(toIdx, 0, moved);
                }
                dragField = null;
                buildItems();
            });

            list.appendChild(row);
        }
    }

    buildItems();

    // Position fixed below anchor
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.zIndex = '1000';

    const menuWidth = 200;
    if (rect.right > window.innerWidth - menuWidth) {
        menu.style.right = `${window.innerWidth - rect.right}px`;
    } else {
        menu.style.left = `${rect.left}px`;
    }

    document.body.appendChild(menu);

    // Close on outside click or scroll. Attached a tick later, so the click that opened the menu
    // does not close it; every close — these two, a reopen, the grid's own — goes through
    // closeColumnChooser, which detaches them.
    const onClickOutside = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node) && e.target !== anchorEl) closeColumnChooser();
    };

    const onScroll = (e: Event) => {
        if (menu.contains(e.target as Node)) return;
        closeColumnChooser();
    };

    let attached = false;
    const attach = setTimeout(() => {
        attached = true;
        document.addEventListener('pointerdown', onClickOutside, true);
        window.addEventListener('scroll', onScroll, true);
    }, 0);
    _detach = () => {
        clearTimeout(attach);
        if (!attached) return;
        document.removeEventListener('pointerdown', onClickOutside, true);
        window.removeEventListener('scroll', onScroll, true);
    };
}
