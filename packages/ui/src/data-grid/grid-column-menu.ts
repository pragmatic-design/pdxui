// Grid column chooser — delegates to shared column-chooser module.
// Bridges GridContext with the standalone column chooser.

import type { GridContext, AnyColumn } from './grid-context';
import { openColumnChooser as openChooser, closeColumnChooser as closeChooser } from '../shared/column-chooser';
import type { ColumnChooserItem } from '../shared/column-chooser';

export function closeColumnMenu(): void {
    closeChooser();
}

export function openColumnMenu(gc: GridContext, anchorEl: HTMLElement): void {
    if (!gc.grid) return;

    // A command column (row actions) is not a column of data: nothing to show, hide or move.
    const cols = (gc.grid.columns.peek() as AnyColumn[]).filter(c => !c.def.command);
    const items: ColumnChooserItem[] = cols.map(c => ({
        field: c.field,
        header: c.header,
        visible: c.visible,
    }));

    openChooser(items, anchorEl, {
        onToggle: (field) => {
            gc.grid?.toggleColumn(field);
            gc.forceUpdate();
        },
        onReorder: (fromField, toField) => {
            gc.grid?.reorder(fromField, toField);
            gc.forceUpdate();
        },
    });
}
