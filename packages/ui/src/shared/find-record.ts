// The record a `record-id` attribute names, in a DataSource. Shared by pdx-form and pdx-auto-form.

import type { DataSource } from '@pdxui/core';

/**
 * The record whose id `id` names. An attribute is a string and `getById` compares strictly, so
 * `record-id="1"` alone would never find `{ id: 1 }`: the form would stay empty and Save would update
 * a record it never loaded. The id as written first,
 * then as the number it spells. The key is the DataSource's own `idField`.
 *
 * `getById` does not subscribe: a caller inside a reactive scope reads `ds.data()` itself to re-run
 * when the records change.
 */
export function findRecord<T>(ds: DataSource<T>, id: string): T | undefined {
    const asWritten = ds.getById(id);
    if (asWritten !== undefined) return asWritten;
    const asNumber = Number(id);
    return id.trim() !== '' && Number.isFinite(asNumber) ? ds.getById(asNumber) : undefined;
}
