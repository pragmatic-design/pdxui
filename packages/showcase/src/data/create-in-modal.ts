// Create in a modal, then read the list again.
//
// The lists whose record opens as a page of its own — employees, sites — create in a modal and do
// nothing else to a row: no drawer, no selection, no removal. `createListActions` carries all of those
// and asks for a grid, a drawer and an answer to hold them, so it does not fit these two lists.
// This is its `create` alone.
import { signal } from '@pdxui/core';
import type { Signal, DataSource, IDataTransport } from '@pdxui/core';

type Row = Record<string, unknown>;

export interface CreateInModalOptions<T extends Row> {
    source: DataSource<T>;
    transport: IDataTransport<T> & Required<Pick<IDataTransport<T>, 'create'>>;
}

export interface CreateInModal<T extends Row> {
    /** Whether the modal is open. */
    open: Signal<boolean>;
    /** Write the new record, close the modal and re-read the list. What confirms it is the row appearing (rule 2). */
    create(values: Partial<T>): Promise<void>;
}

export function createInModal<T extends Row>(options: CreateInModalOptions<T>): CreateInModal<T> {
    const open = signal(false);
    return {
        open,
        async create(values) {
            await options.transport.create(values);
            open.set(false);
            await options.source.refresh();
        },
    };
}
