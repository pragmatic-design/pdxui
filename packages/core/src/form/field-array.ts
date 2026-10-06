// Signal-backed field array — append, remove, move, swap with auto-keyed items.
//
// Each item gets a unique __id for template reconciliation (like RHF's field.id).
// Array mutations are batched and reactive — adding/removing items triggers
// exactly one signal update.
//
// Performance:
//   - Items stored as signal array (single signal, not signal-per-item)
//   - Keyed by auto-increment ID for O(1) reconciliation
//   - Mutation methods mutate-then-set (single signal write per operation)

import { signal } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface FieldArrayItem<T> {
    /** Unique stable ID for template keying. */
    readonly __id: number;
    /** The item data. */
    readonly value: T;
}

export interface FieldArray<T> {
    /** Current items (reactive). Each has a stable __id for keying. */
    readonly items: ReadonlySignal<FieldArrayItem<T>[]>;
    /** Number of items (reactive). */
    readonly length: ReadonlySignal<number>;

    /** Add item at the end. */
    append(value: T): void;
    /** Add item at the beginning. */
    prepend(value: T): void;
    /** Insert item at index. */
    insert(index: number, value: T): void;
    /** Remove item at index. */
    remove(index: number): void;
    /** Move item from one index to another. */
    move(from: number, to: number): void;
    /** Swap two items. */
    swap(a: number, b: number): void;
    /** Replace one item, keeping its `__id`. The write for a single row. */
    update(index: number, value: T): void;
    /** Replace ALL items — the whole array, not one index. Every item is re-keyed. */
    replace(values: T[]): void;
    /** Reset to initial values. */
    reset(): void;
    /** Get current values (non-reactive, without __id). */
    getValues(): T[];
    /** Cleanup. */
    dispose(): void;
}

// ─── createFieldArray() ────────────────────────────────────────────

let nextFieldId = 1;

function wrapItem<T>(value: T): FieldArrayItem<T> {
    return { __id: nextFieldId++, value };
}

/**
 * A repeating group of fields — the "add another line" pattern.
 *
 * Add a row with `append()`, `prepend()` or `insert()`; take one away with `remove()`; reorder with
 * `move()` or `swap()`; write one row with `update()`; read the plain values with `getValues()`, and
 * start over with `reset()`. There is no `add`.
 *
 * **An item is a wrapper, not your object.** `items()` gives `{ __id, value }`, so a row's field is
 * `item.value.name` — `item.name` is undefined, and a template that writes it renders empty fields
 * and reports nothing.
 *
 * ```ts
 * const rooms = createFieldArray([{ type: 'kitchen', area: 0 }]);
 * rooms.append({ type: 'bath', area: 0 });
 * // one field of one row: rebuild that row's value and update it by index
 * rooms.update(0, { ...rooms.getValues()[0], area: 12 });
 * // @for (rooms.items() as room; track room.__id) { room.value.type, room.value.area }
 * ```
 *
 * The `__id` is a stable internal key that survives reorder, removal and `update()`. That is the
 * whole point: keyed by index, removing the second of three rows makes the third inherit the
 * second's DOM, its focus and its validation error. Render with `track item.__id`.
 *
 * `replace()` takes the WHOLE array — `replace(values: T[])`, not an index and a value — and re-keys
 * every item, which is why writing a single field through `getValues()` + `replace()` costs every
 * other row its identity. Use `update()` for that.
 *
 * Inside a form the same object is reached as `form.array('items')`, and its values are merged back
 * into `form.getValues()` and into submit.
 *
 * This is the primitive, which draws nothing. `<pdx-field-list name="items" :form>` is the other
 * way to build repeating rows: a component that draws them, keeping each row as dotted paths in
 * the form (`items.0.name`) rather than as wrappers. **They do not compose** — the merge above
 * happens last, so calling `form.array(name)` on a name a field list manages discards what the
 * list has written. Pick one per name; the comparison is in the recipe "Rows that repeat".
 */
export function createFieldArray<T>(initialValues: T[]): FieldArray<T> {
    const initial = initialValues.map(wrapItem);
    const _items = signal<FieldArrayItem<T>[]>(initial);

    function mutate(fn: (arr: FieldArrayItem<T>[]) => FieldArrayItem<T>[]): void {
        _items.set(prev => fn([...prev])); // clone before mutating
    }

    const arr: FieldArray<T> = {
        items: _items as unknown as ReadonlySignal<FieldArrayItem<T>[]>,

        get length(): ReadonlySignal<number> {
            const self = _items;
            const read = () => self().length;
            read.peek = () => self.peek().length;
            return read as ReadonlySignal<number>;
        },

        append(value: T): void {
            mutate(items => { items.push(wrapItem(value)); return items; });
        },

        prepend(value: T): void {
            mutate(items => { items.unshift(wrapItem(value)); return items; });
        },

        insert(index: number, value: T): void {
            mutate(items => {
                const i = Math.max(0, Math.min(index, items.length));
                items.splice(i, 0, wrapItem(value));
                return items;
            });
        },

        remove(index: number): void {
            mutate(items => {
                if (index >= 0 && index < items.length) items.splice(index, 1);
                return items;
            });
        },

        move(from: number, to: number): void {
            mutate(items => {
                if (from < 0 || from >= items.length) return items;
                if (to < 0 || to >= items.length) return items;
                const [item] = items.splice(from, 1);
                items.splice(to, 0, item);
                return items;
            });
        },

        swap(a: number, b: number): void {
            mutate(items => {
                if (a < 0 || a >= items.length) return items;
                if (b < 0 || b >= items.length) return items;
                const temp = items[a];
                items[a] = items[b];
                items[b] = temp;
                return items;
            });
        },

        update(index: number, value: T): void {
            mutate(items => {
                // The __id is carried over deliberately: this is the SAME row with a new value, and
                // keeping the key is what leaves its DOM, its focus and its validation error in
                // place. Going through getValues() + replace() to write one field would re-key every
                // row in the list, on every keystroke.
                if (index >= 0 && index < items.length) items[index] = { __id: items[index].__id, value };
                return items;
            });
        },

        replace(values: T[]): void {
            _items.set(values.map(wrapItem));
        },

        reset(): void {
            _items.set(initialValues.map(wrapItem));
        },

        getValues(): T[] {
            return _items.peek().map(item => item.value);
        },

        dispose(): void {
            // No resources to clean up currently
        },
    };

    return arr;
}
