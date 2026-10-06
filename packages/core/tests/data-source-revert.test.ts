// Undoing ONE tracked change, and what `sync()` leaves behind.
//
// Undoing all of the change set or none of it is not enough. A page that removes a row
// optimistically, calls the transport itself and has to put the row back on a refusal would have
// one exit: `cancelChanges()` — which on a grid with inline editing throws away every unsaved edit
// on screen.
import { describe, it, expect, vi } from 'vitest';
import { createDataSource } from '../src/data/data-source';
import { effect } from '../src/reactivity/signal';
import type { IDataTransport, DataRequest, DataResponse } from '../src/data/transport';

interface Row extends Record<string, unknown> { id: number; name: string }

const ROWS: Row[] = [
    { id: 1, name: 'Alpha' }, { id: 2, name: 'Bravo' }, { id: 3, name: 'Charlie' },
];

function transportOf(rows: Row[] = ROWS) {
    return {
        read: vi.fn(async (req: DataRequest): Promise<DataResponse<Row>> => ({
            data: rows.slice((req.page - 1) * req.pageSize, req.page * req.pageSize),
            total: rows.length,
        })),
        create: vi.fn(async (item: Row) => item),
        update: vi.fn(async (item: Row) => item),
        destroy: vi.fn(async () => {}),
    } satisfies IDataTransport<Row>;
}

/** A loaded source, since every assertion below is about what the change set does to the view. */
async function loaded(transport = transportOf()) {
    const ds = createDataSource<Row>({ transport, pageSize: 10 });
    await vi.waitFor(() => expect(ds.data()).toHaveLength(3));
    return ds;
}

const names = (ds: { data: () => Row[] }): string[] => ds.data().map((r) => r.name);

describe('revert(id) undoes one row', () => {
    it('puts a removed row back and leaves the other change alone', async () => {
        const ds = await loaded();
        ds.update({ id: 1, name: 'Alpha edited' });
        ds.remove({ id: 2, name: 'Bravo' });
        expect(names(ds)).toEqual(['Alpha edited', 'Charlie']);

        ds.revert(2);

        expect(names(ds), 'the row did not come back, or the edit went with it')
            .toEqual(['Alpha edited', 'Bravo', 'Charlie']);
        expect(ds.hasChanges(), 'the unsaved edit was dropped too').toBe(true);
        expect([...ds.changes().updated].map((r) => r.id)).toEqual([1]);
        expect(ds.changes().removed, 'the removal is still tracked').toEqual([]);
        ds.dispose();
    });

    it('and the change it kept still syncs', async () => {
        // The half that matters: reverting one row must not quietly disarm the rest.
        const transport = transportOf();
        const ds = await loaded(transport);
        ds.update({ id: 1, name: 'Alpha edited' });
        ds.remove({ id: 2, name: 'Bravo' });
        ds.revert(2);

        await ds.sync();

        expect(transport.update, 'the surviving edit was never sent').toHaveBeenCalledTimes(1);
        expect(transport.update.mock.calls[0][0]).toMatchObject({ id: 1, name: 'Alpha edited' });
        expect(transport.destroy, 'the reverted removal was sent anyway').not.toHaveBeenCalled();
        ds.dispose();
    });

    it('undoes an edit as readily as a removal', async () => {
        const ds = await loaded();
        ds.update({ id: 1, name: 'Alpha edited' });
        expect(names(ds)).toEqual(['Alpha edited', 'Bravo', 'Charlie']);

        ds.revert(1);

        expect(names(ds), 'the row kept the edit').toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(ds.hasChanges()).toBe(false);
        ds.dispose();
    });

    it('and an added row, which exists nowhere else', async () => {
        const ds = await loaded();
        ds.add({ id: 99, name: 'Delta' });
        expect(names(ds)).toContain('Delta');

        ds.revert(99);

        expect(names(ds), 'the added row survived its own revert').not.toContain('Delta');
        expect(ds.hasChanges()).toBe(false);
        ds.dispose();
    });

    it('an id with nothing tracked against it changes nothing and notifies nobody', async () => {
        const ds = await loaded();
        ds.update({ id: 1, name: 'Alpha edited' });

        let notifications = 0;
        const stop = effect(() => { ds.changes(); notifications++; });
        expect(notifications).toBe(1);

        ds.revert(3);          // never touched
        ds.revert(12345);      // never existed
        await Promise.resolve();

        expect(notifications, 'a revert that changed nothing woke every reader of changes()').toBe(1);
        expect(names(ds)).toEqual(['Alpha edited', 'Bravo', 'Charlie']);
        stop();
        ds.dispose();
    });

    it('and it DOES notify when it changes something', async () => {
        // The control for the line above: a silent state change is worse than a spurious one.
        const ds = await loaded();
        ds.remove({ id: 2, name: 'Bravo' });

        let notifications = 0;
        const stop = effect(() => { ds.changes(); notifications++; });
        expect(notifications).toBe(1);

        ds.revert(2);
        await vi.waitFor(() => expect(notifications).toBe(2));
        stop();
        ds.dispose();
    });
});

describe('cancelChanges() is still the blunt instrument', () => {
    it('clears both changes, which is what revert exists not to do', async () => {
        // The control the issue asked for: the new method must not have narrowed the old one.
        const ds = await loaded();
        ds.update({ id: 1, name: 'Alpha edited' });
        ds.remove({ id: 2, name: 'Bravo' });

        ds.cancelChanges();

        expect(names(ds)).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(ds.hasChanges()).toBe(false);
        ds.dispose();
    });
});

describe('what sync() leaves behind', () => {
    // The issue's second question, asked because a 'removed' entry that survives its own sync is
    // invisible: hiding a row the server really deleted is a no-op, and only `hasChanges()` knows.
    it('clears the entries it sent — optimistic', async () => {
        const transport = transportOf();
        const ds = createDataSource<Row>({ transport, pageSize: 10, optimistic: true });
        await vi.waitFor(() => expect(ds.data()).toHaveLength(3));
        ds.remove({ id: 2, name: 'Bravo' });
        expect(ds.hasChanges()).toBe(true);

        await ds.sync();

        expect(ds.hasChanges(), 'the delete stayed in the change set after the server took it')
            .toBe(false);
        expect(transport.destroy).toHaveBeenCalledTimes(1);
        ds.dispose();
    });

    it('clears the entries it sent — and when it is not optimistic', async () => {
        const transport = transportOf();
        const ds = await loaded(transport);
        ds.remove({ id: 2, name: 'Bravo' });

        await ds.sync();

        expect(ds.hasChanges()).toBe(false);
        expect(transport.destroy).toHaveBeenCalledTimes(1);
        ds.dispose();
    });

    it('and keeps what the server refused, so the page can revert it', async () => {
        // Which is the whole reason `revert` has an id: after a failed sync the entry is back in
        // the change set, and the page decides row by row what to do with it.
        const transport = transportOf();
        transport.destroy = vi.fn(async () => { throw new Error('403'); });
        const ds = await loaded(transport);
        ds.update({ id: 1, name: 'Alpha edited' });
        ds.remove({ id: 2, name: 'Bravo' });

        await ds.sync().catch(() => {});

        expect(ds.hasChanges(), 'a refused change was forgotten').toBe(true);
        expect(ds.changes().removed.map((r) => r.id)).toEqual([2]);
        // The edit is NOT in the change set any more, and that is right: `sync` prunes the
        // operations that persisted, so a retry cannot send them twice. The view reads the server
        // rows, which this mock does not mutate — so nothing here measures the edit.
        expect(ds.changes().updated).toEqual([]);

        ds.revert(2);
        expect(names(ds), 'the refused removal could not be undone').toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(ds.hasChanges(), 'and nothing is left pending').toBe(false);
        ds.dispose();
    });
});
