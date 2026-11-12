// The model of pdx-kanban: the column an item is in is a field of the item, and the order inside a
// column is the order of the array. Pure, so the component's three ways to move a card — the keyboard,
// the Move menu, the pointer — all go through one function, and a test reads it without a DOM.

/** Each column's items, in array order, for every column given (an empty one included). */
export function arrange<T>(items: readonly T[], columns: readonly string[], field: string): Map<string, T[]> {
    const out = new Map<string, T[]>(columns.map((c) => [c, []]));
    for (const item of items) out.get(String((item as Record<string, unknown>)[field]))?.push(item);
    return out;
}

/**
 * `items` with `item` moved to `column` at `index`: a new array, the item a copy with its `field` set.
 * `index` is where the item ends in its column, counted without it; past the end is after the last.
 * Into an empty column the item goes at the end of the array. Items no column shows keep their place.
 */
export function moveItem<T>(items: readonly T[], item: T, column: string, index: number, field: string): T[] {
    const rest = items.filter((i) => i !== item);
    const moved = { ...item, [field]: column } as T;
    const inColumn = rest.filter((i) => String((i as Record<string, unknown>)[field]) === column);
    if (index < inColumn.length) {
        rest.splice(rest.indexOf(inColumn[Math.max(0, index)]), 0, moved);
    } else if (inColumn.length > 0) {
        rest.splice(rest.indexOf(inColumn[inColumn.length - 1]) + 1, 0, moved);
    } else {
        rest.push(moved);
    }
    return rest;
}
