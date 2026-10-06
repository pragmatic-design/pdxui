// A change that comes FROM the server, not from the user.
//
// The bridge into the reactive world is `fromCallback(setup)`, which turns a socket, an
// EventSource or an SDK subscription into a signal. This is what comes after it: a push arrives
// for a row that is on screen, and the application puts it into the DataSource.
//
// `update()` is the wrong tool and it is worth being precise about why, because it LOOKS right:
// it records the row in the change set as a LOCAL edit, with the pre-push row kept as `original`.
// So after applying a server push with `update()`:
//   - `hasChanges()` is true, and the screen believes the user has unsaved work;
//   - `sync()` would send the server its own change back;
//   - `cancelChanges()` would "roll back" to the row as it was BEFORE the server changed it —
//     that is, it would throw the server's truth away and restore a value that no longer exists.
//
// `applyServerChange()` is the other direction: it writes into the loaded page underneath the
// change set, touches no tracking, schedules no sync, and triggers no reload — which is what keeps
// the selection, the scroll offset and an open editor alive while the row updates.

import { describe, it, expect } from 'vitest';
import { createDataSource } from '../src/data/data-source';
import type { IDataTransport, DataRequest, DataResponse } from '../src/data/transport';

interface Row extends Record<string, unknown> {
    id: number;
    subject: string;
    status: string;
}

const seed = (): Row[] => [
    { id: 1, subject: 'Printer jammed', status: 'open' },
    { id: 2, subject: 'VPN drops', status: 'open' },
    { id: 3, subject: 'Laptop for new starter', status: 'waiting' },
];

function transportOf(rows: Row[]): IDataTransport<Row> {
    return {
        async read(req: DataRequest): Promise<DataResponse<Row>> {
            const size = req.pageSize > 0 ? req.pageSize : rows.length;
            const start = (Math.max(1, req.page) - 1) * size;
            return { data: rows.slice(start, start + size), total: rows.length };
        },
        async create(item) { return item as Row; },
        async update(item) { return item; },
        async destroy() { /* the server is not asked anything in these tests */ },
    };
}

/** `autoLoad` resolves on a microtask; every test needs the first page before it asserts. */
async function loaded(rows = seed()) {
    const ds = createDataSource<Row>({
        transport: transportOf(rows), pageSize: 10, idField: 'id',
        // Selection has to be ON for `setSelected` to hold anything — and the selection surviving
        // (or not) a push is half of what this file measures.
        selection: { mode: 'multiple' },
    });
    await ds.refresh();
    return ds;
}

describe('a change that came from the server', () => {
    it('updates the row that is on screen', async () => {
        const ds = await loaded();

        const outcome = ds.applyServerChange({ type: 'updated', item: { id: 2, subject: 'VPN drops', status: 'closed' } });

        expect(outcome).toBe('applied');
        expect(ds.getById(2)?.status).toBe('closed');
    });

    it('is not a local edit: nothing to save, nothing to roll back', async () => {
        const ds = await loaded();

        ds.applyServerChange({ type: 'updated', item: { id: 2, subject: 'VPN drops', status: 'closed' } });

        // The three ways the screen would otherwise be lied to.
        expect(ds.hasChanges(), 'a server push is not unsaved work').toBe(false);
        expect(ds.changes().updated, 'it must not be queued for sync').toEqual([]);

        ds.cancelChanges();
        expect(ds.getById(2)?.status, 'cancelling local edits must not undo the server').toBe('closed');
    });

    it('the control: a local edit IS a change, and rolls back', async () => {
        const ds = await loaded();

        ds.update({ id: 2, subject: 'VPN drops', status: 'closed' });

        expect(ds.hasChanges()).toBe(true);
        ds.cancelChanges();
        expect(ds.getById(2)?.status).toBe('open');
    });

    it('a row created elsewhere appears, and the total counts it', async () => {
        const ds = await loaded();
        const before = ds.total();

        const outcome = ds.applyServerChange({ type: 'created', item: { id: 9, subject: 'Badge reader', status: 'open' } });

        expect(outcome).toBe('applied');
        expect(ds.getById(9)?.subject).toBe('Badge reader');
        expect(ds.total()).toBe(before + 1);
        expect(ds.hasChanges()).toBe(false);
    });

    it('a row deleted elsewhere goes, and takes its selection with it', async () => {
        const ds = await loaded();
        ds.setSelected([2]);
        expect(ds.isSelected(2)).toBe(true);

        const outcome = ds.applyServerChange({ type: 'deleted', item: { id: 2, subject: 'VPN drops', status: 'open' } });

        expect(outcome).toBe('applied');
        expect(ds.getById(2)).toBeUndefined();
        expect(ds.isSelected(2), 'a selected id that no longer exists is a selection nobody can act on').toBe(false);
    });

    it('a push for a row this page does not hold is ignored, not invented', async () => {
        const ds = await loaded();

        const outcome = ds.applyServerChange({ type: 'updated', item: { id: 404, subject: 'Another page', status: 'open' } });

        expect(outcome).toBe('ignored');
        expect(ds.data().some(r => r.id === 404)).toBe(false);
    });

    // ─── The race the story names: a push and an optimistic local write on the same record ───
    //
    // The local edit stays on screen — the user is mid-sentence and must not have the field
    // yanked from under them — but the server's value replaces the ORIGINAL underneath, so a
    // rollback lands on what the server now says rather than on a value that no longer exists.
    describe('when the same row has an unsaved local edit', () => {
        it('says so, instead of applying silently', async () => {
            const ds = await loaded();
            ds.update({ id: 2, subject: 'VPN drops every twenty minutes', status: 'open' });

            const outcome = ds.applyServerChange({ type: 'updated', item: { id: 2, subject: 'VPN drops', status: 'closed' } });

            expect(outcome, 'the application has to be able to tell the user').toBe('shadowed');
        });

        it('leaves the edit in front of the user', async () => {
            const ds = await loaded();
            ds.update({ id: 2, subject: 'VPN drops every twenty minutes', status: 'open' });

            ds.applyServerChange({ type: 'updated', item: { id: 2, subject: 'VPN drops', status: 'closed' } });

            expect(ds.getById(2)?.subject).toBe('VPN drops every twenty minutes');
        });

        it('but a rollback now lands on what the server says, not on the stale value', async () => {
            const ds = await loaded();
            ds.update({ id: 2, subject: 'VPN drops every twenty minutes', status: 'open' });

            ds.applyServerChange({ type: 'updated', item: { id: 2, subject: 'VPN drops', status: 'closed' } });
            ds.cancelChanges();

            expect(ds.getById(2)?.status, 'the pre-push value is gone; rolling back to it would restore a lie').toBe('closed');
        });
    });
});
