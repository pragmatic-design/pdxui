// An entity list's round-trip, written once. Tickets and customers make the same five moves, and a
// copy of them diverges: one list clears the grid's checkboxes, the other leaves them ticked.
//
// What is here is what both lists do the same way: the selection mirror, create in a modal, one
// record in the drawer its row opens with the question before discarding, the save, and the
// removal with its undo.
// What a list does its own way — the tickets' inline subject, its bulk pickers — stays on its page,
// and calls in.
//
// `pdx-entity-grid` was measured first and does not fit: it holds an array and keeps an optimistic
// copy, where these lists read a server-paged DataSource; it edits and creates in one drawer, where
// they create in a modal; it opens a record from a pencil, not from the row; and it has no unsaved
// question, no refusal and no undo. Closing that gap is not a small, generic extension of it.
import { signal } from '@pdxui/core';
import type { Signal, DataSource, IDataTransport } from '@pdxui/core';
import type { Answer } from './answer';

type Row = Record<string, unknown> & { id?: unknown };

/** What the list needs of the grid element: the checkboxes are the grid's, not the page's. */
interface GridHandle { clearSelection(): void }
/** What the list needs of the drawer element: only it knows whether its form was touched. */
interface DrawerHandle { isDirty(): boolean }

export interface ListActionsOptions<T extends Row> {
    source: DataSource<T>;
    /** The list's transport, which must be able to create, update and destroy. */
    transport: IDataTransport<T> & Required<Pick<IDataTransport<T>, 'create' | 'update' | 'destroy'>>;
    answer: Answer;
    /** The grid, read when needed: a `:ref` fills it after setup. */
    grid: () => GridHandle | null;
    /** The edit drawer, read when needed. */
    drawer: () => DrawerHandle | null;
}

export interface ListActions<T extends Row> {
    /** The ids the grid has ticked: a mirror of the grid's, for the bulk bar. */
    selectedIds: Signal<T['id'][]>;
    onSelectionChange(e: CustomEvent): void;
    /** Clear the selection where it lives, in the grid, and the mirror with it. */
    clearSelection(): void;
    /** Drop one id from the mirror: a row that went away under the selection. */
    forget(id: T['id']): void;

    createOpen: Signal<boolean>;
    openCreate(): void;
    closeCreate(): void;
    /** Write a new record, close the modal and re-read the list. */
    create(values: Partial<T>): Promise<void>;

    /** The record in the drawer, or null. */
    editing: Signal<T | null>;
    /** Open a record in the drawer. Opening is not selecting: the checkbox stays the bulk bar's. */
    openRecord(row: T): void;
    /** Whether the question before discarding is on screen. */
    confirmClose: Signal<boolean>;
    /** The drawer's ✕ and Escape: asks only when there is something to lose. */
    askToClose(): void;
    discardAndClose(): void;
    keepEditing(): void;
    closeDrawer(): void;
    /** Write the drawer's values over the record, close it and re-read the list. */
    save(values: Partial<T>): Promise<void>;
    /**
     * Take the selected rows out, optimistically, and answer with an undo that puts back EVERY row
     * taken — not the first one. A refusal puts the rows back and says so.
     */
    removeSelected(words: RemoveWords<T>): Promise<void>;
}

/** What a list says about a removal, and how it writes a removed row back. */
export interface RemoveWords<T extends Row> {
    /** The toast's sentence for the rows removed: one row by name, several by count. */
    describe(rows: T[]): string;
    undoLabel: string;
    /** The record the undo creates from a removed row: what the server assigns is the list's to drop. */
    recreate(row: T): Partial<T>;
}

export function createListActions<T extends Row>(options: ListActionsOptions<T>): ListActions<T> {
    const { source, transport, answer } = options;
    const selectedIds = signal<T['id'][]>([]);
    const createOpen = signal(false);
    const editing = signal<T | null>(null);
    const confirmClose = signal(false);
    let lastOpener: HTMLElement | null = null;

    function clearSelection(): void {
        selectedIds.set([]);
        // The checkboxes live in the GRID: clearing the mirror alone left every row ticked under a
        // bar that had gone. `clearSelection()` on the element unchecks them, and it publishes, so
        // the two never disagree.
        options.grid()?.clearSelection();
    }

    function closeDrawer(): void {
        editing.set(null);
        // The drawer took the focus; it owes it back to the control that opened it, which is the
        // only place a keyboard reader can carry on from.
        if (lastOpener && lastOpener.isConnected) lastOpener.focus();
        lastOpener = null;
    }

    return {
        selectedIds,
        onSelectionChange(e) {
            // `e.detail.selected`, not `e.detail.ids` — the grid emits { selected, count }.
            selectedIds.set((e.detail?.selected as T['id'][]) ?? []);
        },
        clearSelection,
        forget(id) {
            selectedIds.set(selectedIds.peek().filter(x => x !== id));
        },

        createOpen,
        openCreate() {
            editing.set(null);
            createOpen.set(true);
        },
        closeCreate() { createOpen.set(false); },
        async create(values) {
            // Rule 2: what confirms a create is the row appearing. No toast.
            answer.clearRefusal();
            await transport.create(values);
            createOpen.set(false);
            await source.refresh();
        },

        editing,
        openRecord(row) {
            // The DataSource is what holds the record; the row is the fallback.
            editing.set(source.getById(Number(row.id)) ?? row);
            lastOpener = document.activeElement as HTMLElement | null;
        },
        confirmClose,
        askToClose() {
            // Asked of the COMPONENT, the only thing that knows: comparing values with the record
            // races a keystroke that has not reached the form model yet.
            if (options.drawer()?.isDirty()) { confirmClose.set(true); return; }
            closeDrawer();
        },
        discardAndClose() { confirmClose.set(false); closeDrawer(); },
        keepEditing() { confirmClose.set(false); },
        closeDrawer,
        async save(values) {
            const record = editing.peek();
            if (!record) return;
            answer.clearRefusal();
            await transport.update({ ...record, ...values } as T);
            closeDrawer();
            await source.refresh();
        },
        async removeSelected(words) {
            answer.clearRefusal();
            const rows = selectedIds.peek().map(id => source.getById(id)).filter((r): r is T => r != null);
            if (rows.length === 0) return;

            // Optimistic: the rows go now, and the server is told afterwards.
            for (const row of rows) source.remove(row);
            clearSelection();

            try {
                for (const row of rows) await transport.destroy(row);
                // RULE 1: reversible and out of sight, so the way back travels with the
                // message. It carries every row this removal took, not only `rows[0]`.
                answer.reversible(words.describe(rows), words.undoLabel, async () => {
                    for (const row of rows) await transport.create(words.recreate(row));
                    await source.refresh();
                });
            } catch (err) {
                answer.refused((err as Error).message);
            }

            // Drop the optimistic removal BEFORE reloading, row by row:
            // `remove()` records a user delete in the change set, and `refresh()` keeps that set, so
            // a refused delete would stay hidden for good. `revert(id)` undoes only these rows, not
            // an unsaved edit elsewhere in the grid.
            for (const row of rows) source.revert(row.id);
            await source.refresh();
        },
    };
}
