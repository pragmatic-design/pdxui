// Grid «Group by» — the toolbar's menu of groupable columns, and the chip of the grouping.
//
// Without it, the only ways a reader could ask the grid to group would be a drag onto the group bar
// and the `groupBy` prop: a gesture no keyboard and no finger makes, and an author's choice. A column
// opts in with `groupable`; this is the menu that offers them and the chip that shows the choice.

import type { GroupDescriptor } from '@pdxui/core';
import type { GridContext, AnyColumn } from './grid-context';
import { openGridMenu } from './grid-menu';
import { t } from './grid-i18n';
import { i18nMark } from './grid-chrome-strings';

/** The columns a reader may group by. */
export function groupableColumns(gc: GridContext): AnyColumn[] {
    return (gc.grid?.columns.peek() as AnyColumn[] ?? []).filter(c => (c.def as { groupable?: boolean }).groupable === true);
}

/** The grouping in force, as descriptors. */
function currentGroup(gc: GridContext): GroupDescriptor[] {
    const g = gc.grid?.source.group;
    const value = typeof g === 'function' ? g() : [];
    return Array.isArray(value) ? value : [];
}

/**
 * The toolbar's «Group by» button, or null when no column is groupable. One level: a reader who
 * picks a second column replaces the first, which is what a menu of radios says it does.
 */
export function buildGroupButton(gc: GridContext): HTMLButtonElement | null {
    if (groupableColumns(gc).length === 0) return null;
    const btn = document.createElement('button');
    btn.type = 'button';   // not submit: a grid inside a form would submit it
    btn.className = 'pdx-dg-toolbar-btn';
    btn.dataset.gridGroup = '';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');   // the menu keeps it in step
    i18nMark(btn, 'group.by', 'label', 'title');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="6" rx="1"/><path d="M7 13h14M7 18h14M3 13v5"/></svg>';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = currentGroup(gc)[0]?.field;
        openGridMenu(btn, [
            { label: t('group.none'), checked: !active, select: () => gc.grid?.source.setGroup([]) },
            ...groupableColumns(gc).map(col => ({
                label: String(col.header ?? col.field),
                checked: active === col.field,
                select: () => gc.grid?.source.setGroup([{ field: String(col.field) }]),
            })),
        ], {
            label: t('group.by'),
            radio: true,
            menuClass: 'pdx-dg-col-menu',
            itemClass: 'pdx-dg-col-menu-item',
            place: (menu, rect) => {
                menu.style.top = `${rect.bottom + 4}px`;
                menu.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
            },
        });
    });
    return btn;
}

/** The chip of each grouping level, beside the sort's, with the ✕ that takes it away. */
export function buildGroupChips(gc: GridContext): HTMLElement[] {
    const cols = gc.grid?.columns.peek() as AnyColumn[] ?? [];
    return currentGroup(gc).map(desc => {
        const header = String(cols.find(c => c.field === desc.field)?.header || desc.field);
        const chip = document.createElement('span');
        chip.className = 'pdx-dg-toolbar-chip pdx-dg-toolbar-chip-group';
        const text = document.createElement('span');
        text.textContent = t('group.chip').replace('{column}', header);
        chip.appendChild(text);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pdx-dg-toolbar-chip-remove';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', t('group.remove').replace('{column}', header));
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            gc.grid?.source.setGroup(currentGroup(gc).filter(g => g.field !== desc.field));
        });
        chip.appendChild(remove);
        return chip;
    });
}
