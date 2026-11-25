// pdx-entity-grid's rows: their shape, a delete waiting for its confirmation, and the column that names
// a row. Pure, beside the component: a .pdx script runs at every mount, and these are fixed.
import type { ColumnDef } from '@pdxui/core';

export type Row = Record<string, unknown>;
/** A delete waiting for the confirmation: one row's (with the row) or the selection's. */
export type PendingDelete = { ids: unknown[]; row?: Row };

/** The first plain-text column, skipping the id: what names a row when `rowLabel` is not set. */
export function firstTextField(cols: ColumnDef[], idField: string): string | undefined {
    for (const c of cols) {
        if (c.children?.length) {
            const f = firstTextField(c.children, idField);
            if (f) return f;
        } else if ((!c.type || c.type === 'text') && !c.command && c.field && c.field !== idField) {
            return c.field as string;
        }
    }
    return undefined;
}
