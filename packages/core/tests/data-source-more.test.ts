// DataSource — the paths the happy-path suite does not walk: the failure ones, the persisted ones,
// and the ones that only exist because two things happen at once.
//
// A DataSource is where a list stops being a list: a request in flight while another starts, a
// sync that half succeeds, a page restored from sessionStorage. Every one of those is handled on
// purpose, and this file measures it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataSource, isDataSource } from '../src/data/data-source';
import { signal, computed } from '../src/reactivity/signal';
import type { IDataTransport, DataRequest, DataResponse } from '../src/data/transport';

type Row = { id: number; name: string };

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `r${i + 1}` }));

/** A transport whose every answer is decided by the test. */
function scriptedTransport(answer: (req: DataRequest) => DataResponse<Row> | Promise<DataResponse<Row>>) {
    return { read: vi.fn(answer) } as unknown as IDataTransport<Row>;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

describe('construction', () => {
    it('refuses to exist without a transport or data, instead of loading nothing forever', () => {
        expect(() => createDataSource({} as never)).toThrow(/transport.*data|data.*transport/i);
    });

    it('the array shorthand turns pagination off — a local array has one page', async () => {
        const ds = createDataSource(rows(30));
        await tick();
        expect(ds.data()).toHaveLength(30);
        expect(ds.totalPages()).toBe(1);
    });

    it('isDataSource recognises one, and refuses a look-alike', () => {
        const ds = createDataSource(rows(1));
        expect(isDataSource(ds)).toBe(true);
        expect(isDataSource(null)).toBe(false);
        expect(isDataSource({ setFilter() {}, setSort() {}, refresh() {} }),
            'a "data" that is not a signal is not a DataSource').toBe(false);
        expect(isDataSource([1, 2, 3])).toBe(false);
    });
});

describe('a read that fails', () => {
    it('lands in error() and stops loading', async () => {
        const boom = new Error('gateway');
        const ds = createDataSource({ transport: scriptedTransport(() => Promise.reject(boom)) });
        await tick();

        expect(ds.error()).toBe(boom);
        expect(ds.isLoading(), 'the spinner outlived the request').toBe(false);
        expect(ds.data()).toEqual([]);
    });

    it('wraps a thrown non-Error so error() is always an Error', async () => {
        const ds = createDataSource({ transport: scriptedTransport(() => Promise.reject('just a string')) });
        await tick();
        expect(ds.error()).toBeInstanceOf(Error);
        expect(ds.error()?.message).toContain('just a string');
    });

    it('clears the previous error when the next read succeeds', async () => {
        let fail = true;
        const ds = createDataSource({
            transport: scriptedTransport(() => (fail
                ? Promise.reject(new Error('down'))
                : Promise.resolve({ data: rows(2), total: 2 }))),
        });
        await tick();
        expect(ds.error()).toBeTruthy();

        fail = false;
        await ds.refresh();
        expect(ds.error(), 'the failure stayed on screen after the retry worked').toBeNull();
    });
});

describe('two reads at once', () => {
    it('the superseded answer never lands, however late it arrives', async () => {
        const resolvers: ((r: DataResponse<Row>) => void)[] = [];
        const ds = createDataSource({
            transport: scriptedTransport(() => new Promise<DataResponse<Row>>((r) => resolvers.push(r))),
            autoLoad: false,
        });

        const first = ds.refresh();
        const second = ds.refresh();
        resolvers[1]({ data: [{ id: 2, name: 'second' }], total: 1 });
        resolvers[0]({ data: [{ id: 1, name: 'first' }], total: 1 });   // the stale one, last
        await Promise.all([first, second]);

        expect(ds.data(), 'a superseded response overwrote the current one').toEqual([
            { id: 2, name: 'second' },
        ]);
    });

    it('a superseded FAILURE does not put the current read into error', async () => {
        let n = 0;
        const rejecters: ((e: Error) => void)[] = [];
        const ds = createDataSource({
            transport: scriptedTransport(() => {
                n++;
                return n === 1
                    ? new Promise<DataResponse<Row>>((_, rej) => rejecters.push(rej))
                    : Promise.resolve({ data: rows(1), total: 1 });
            }),
            autoLoad: false,
        });

        const first = ds.refresh();
        const second = ds.refresh();
        rejecters[0](new Error('the abandoned one'));
        await Promise.all([first, second]);

        expect(ds.error(), 'an abandoned request reported its failure anyway').toBeNull();
        expect(ds.data()).toHaveLength(1);
    });
});

describe('debounced reads', () => {
    it('a burst of query changes costs one request', async () => {
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        const ds = createDataSource({ transport, debounceMs: 20, autoLoad: false });

        ds.setFilter([{ field: 'name', operator: 'contains', value: 'a' }]);
        ds.setFilter([{ field: 'name', operator: 'contains', value: 'ab' }]);
        ds.setFilter([{ field: 'name', operator: 'contains', value: 'abc' }]);
        await tick(60);

        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls[0][0].filter[0].value).toBe('abc');
    });
});

describe('cascading params', () => {
    it('does not load at all while the parent has not chosen', async () => {
        const parent = signal<number | undefined>(undefined);
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        createDataSource({ transport, reactiveParams: () => (parent() === undefined ? undefined : { p: parent() }) });
        await tick();

        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls,
            'the child list queried the server with no parent selected').toHaveLength(0);
    });

    it('loads once the parent chooses, and sends the param', async () => {
        const parent = signal<number | undefined>(undefined);
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        createDataSource({ transport, reactiveParams: () => (parent() === undefined ? undefined : { p: parent() }) });

        parent.set(7);
        await tick();

        const call = (transport.read as ReturnType<typeof vi.fn>).mock.calls[0][0] as DataRequest;
        expect(call.params).toMatchObject({ p: 7 });
    });

    it('an undefined VALUE inside the params object also holds the load', async () => {
        // `{ country: undefined }` is a parent that exists but has not answered yet — different
        // from returning undefined, and just as much a reason not to ask.
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        createDataSource({ transport, reactiveParams: () => ({ country: undefined }) });
        await tick();
        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('merges the static params under the reactive ones', async () => {
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        createDataSource({ transport, params: { tenant: 'acme' }, reactiveParams: () => ({ p: 1 }) });
        await tick();
        const call = (transport.read as ReturnType<typeof vi.fn>).mock.calls[0][0] as DataRequest;
        expect(call.params).toEqual({ tenant: 'acme', p: 1 });
    });
});

describe('hasMore when the server does not count', () => {
    it('a full page means there may be more; a short one means there is not', async () => {
        let page = 1;
        const ds = createDataSource({
            transport: scriptedTransport((req) => {
                page = req.page;
                return Promise.resolve({ data: page === 1 ? rows(10) : rows(3), total: -1 });
            }),
            pageSize: 10,
        });
        await tick();
        expect(ds.hasMore(), 'a full page with an unknown total must not end the list').toBe(true);

        await ds.loadMore();
        expect(ds.hasMore(), 'a short page is the end').toBe(false);
    });

    it('is false before anything has been fetched', () => {
        const ds = createDataSource({
            transport: scriptedTransport(() => Promise.resolve({ data: [], total: -1 })),
            autoLoad: false,
        });
        expect(ds.hasMore()).toBe(false);
    });

    it('an empty result with a known total of 0 is not "more"', async () => {
        const ds = createDataSource({
            transport: scriptedTransport(() => Promise.resolve({ data: [], total: 0 })),
            pageSize: 10,
        });
        await tick();
        expect(ds.hasMore()).toBe(false);
    });

    it('loadMore does nothing once there is no more', async () => {
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(2), total: 2 }));
        const ds = createDataSource({ transport, pageSize: 10 });
        await tick();
        const before = (transport.read as ReturnType<typeof vi.fn>).mock.calls.length;

        await ds.loadMore();

        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
    });
});

describe('the infinite-scroll cache', () => {
    const key = 'list-a';

    it('writes the accumulated pages to sessionStorage', async () => {
        const ds = createDataSource({
            transport: scriptedTransport((req) => Promise.resolve({
                data: rows(20).slice((req.page - 1) * 10, req.page * 10),
                total: 20,
            })),
            pageSize: 10,
            cacheKey: key,
        });
        await tick();
        await ds.loadMore();

        const raw = sessionStorage.getItem(`pdx-ds-cache:${key}`);
        expect(raw, 'nothing was cached, so a back-navigation reloads from page 1').toBeTruthy();
        expect(JSON.parse(raw!).data).toHaveLength(20);
    });

    it('a new source restores those pages, and comes back in append mode', async () => {
        sessionStorage.setItem(`pdx-ds-cache:${key}`, JSON.stringify({
            data: rows(20), page: 2, total: 40,
        }));
        const ds = createDataSource({
            transport: scriptedTransport(() => Promise.resolve({ data: [], total: 40 })),
            pageSize: 10,
            cacheKey: key,
            autoLoad: false,
        });

        expect(ds.data()).toHaveLength(20);
        expect(ds.page()).toBe(2);
        expect(ds.loadedCount()).toBe(20);
    });

    it('ignores a corrupt cache rather than refusing to start', () => {
        sessionStorage.setItem(`pdx-ds-cache:${key}`, '{not json');
        expect(() => createDataSource({
            transport: scriptedTransport(() => Promise.resolve({ data: [], total: 0 })),
            cacheKey: key,
            autoLoad: false,
        })).not.toThrow();
    });

    it('clearCache empties both the storage and the accumulated pages', async () => {
        const ds = createDataSource({
            transport: scriptedTransport((req) => Promise.resolve({
                data: rows(20).slice((req.page - 1) * 10, req.page * 10),
                total: 20,
            })),
            pageSize: 10,
            cacheKey: key,
        });
        await tick();
        await ds.loadMore();

        ds.clearCache();

        expect(sessionStorage.getItem(`pdx-ds-cache:${key}`)).toBeNull();
        expect(ds.loadedCount()).toBe(10);
    });
});

describe('persisted selection', () => {
    const key = 'sel-a';

    it('restores the ids chosen in the previous session', async () => {
        localStorage.setItem(`pdx-ds-sel:${key}`, JSON.stringify([2, 3]));
        const ds = createDataSource({
            data: rows(5),
            selection: { mode: 'multiple', persistKey: key },
        });
        await tick();

        expect(ds.selectedCount()).toBe(2);
        expect(ds.isSelected(3)).toBe(true);
        expect(ds.selectedItems().map((r) => r.id)).toEqual([2, 3]);
    });

    it('writes every change back', async () => {
        const ds = createDataSource({ data: rows(5), selection: { mode: 'multiple', persistKey: key } });
        await tick();
        ds.select(4);
        expect(JSON.parse(localStorage.getItem(`pdx-ds-sel:${key}`)!)).toEqual([4]);
    });

    it('ignores a corrupt entry instead of starting with a broken selection', () => {
        localStorage.setItem(`pdx-ds-sel:${key}`, 'nonsense');
        const ds = createDataSource({ data: rows(3), selection: { mode: 'single', persistKey: key } });
        expect(ds.selectedCount()).toBe(0);
    });

    it('clearSelection removes the stored entry too', async () => {
        const ds = createDataSource({ data: rows(5), selection: { mode: 'multiple', persistKey: key } });
        await tick();
        ds.select(1);
        ds.clearSelection();

        expect(ds.selectedCount()).toBe(0);
        expect(localStorage.getItem(`pdx-ds-sel:${key}`),
            'the selection came back on the next page load').toBeNull();
    });

    it('clearPersisted clears both stores at once', async () => {
        const ds = createDataSource({
            data: rows(5),
            cacheKey: 'both', selection: { mode: 'multiple', persistKey: 'both' },
        });
        await tick();
        ds.select(1);
        sessionStorage.setItem('pdx-ds-cache:both', '{"data":[],"page":1,"total":0}');

        ds.clearPersisted();

        expect(sessionStorage.getItem('pdx-ds-cache:both')).toBeNull();
        expect(localStorage.getItem('pdx-ds-sel:both')).toBeNull();
    });

    it('selectAll is inert when selection was never enabled', async () => {
        const ds = createDataSource(rows(3));
        await tick();
        await ds.selectAll();
        expect(ds.selectedCount()).toBe(0);
        expect(ds.isSelected(1)).toBe(false);
    });
});

describe('change tracking', () => {
    it('editing a row that was only just added keeps it an insert', async () => {
        const ds = createDataSource({ data: rows(2), autoLoad: false });
        ds.add({ id: 99, name: 'new' });
        ds.update({ id: 99, name: 'renamed' });

        expect(ds.changes().added).toEqual([{ id: 99, name: 'renamed' }]);
        expect(ds.changes().updated, 'an unsaved row produced an UPDATE for a row the server has never seen')
            .toHaveLength(0);
    });

    it('deleting a row that was only just added simply forgets it', async () => {
        const ds = createDataSource({ data: rows(2), autoLoad: false });
        ds.add({ id: 99, name: 'new' });
        ds.remove({ id: 99, name: 'new' });

        expect(ds.hasChanges(), 'a DELETE was queued for a row that was never created').toBe(false);
    });

    it('an update keeps the original, so the sync can send a diff', async () => {
        const patch = vi.fn(async () => {});
        const transport = {
            read: vi.fn(async () => ({ data: [{ id: 1, name: 'a' }], total: 1 })),
            patch,
            update: vi.fn(async (i: Row) => i),
        } as unknown as IDataTransport<Row>;
        const ds = createDataSource({ transport });
        await tick();

        ds.update({ id: 1, name: 'b' });
        await ds.sync();

        expect(patch).toHaveBeenCalledWith(1, { name: 'b' });
        expect((transport.update as ReturnType<typeof vi.fn>),
            'PATCH was available and a whole record was sent anyway').not.toHaveBeenCalled();
    });

    it('falls back to update() when the diff is empty', async () => {
        const patch = vi.fn(async () => {});
        const update = vi.fn(async (i: Row) => i);
        const transport = {
            read: vi.fn(async () => ({ data: [{ id: 1, name: 'a' }], total: 1 })),
            patch, update,
        } as unknown as IDataTransport<Row>;
        const ds = createDataSource({ transport });
        await tick();

        ds.update({ id: 1, name: 'a' });   // identical → computeDiff returns null
        await ds.sync();

        expect(patch).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
    });

    it('patch() on an id that is not there does nothing', async () => {
        const ds = createDataSource({ data: rows(2), autoLoad: false });
        ds.patch(404, { name: 'ghost' });
        expect(ds.hasChanges()).toBe(false);
    });

    it('sync with nothing pending does not touch the transport', async () => {
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        const ds = createDataSource({ transport });
        await tick();
        const before = (transport.read as ReturnType<typeof vi.fn>).mock.calls.length;

        await ds.sync();

        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls.length,
            'an empty sync reloaded the list for nothing').toBe(before);
    });
});

describe('optimistic sync', () => {
    it('shows the change before the server has it', async () => {
        let release: () => void = () => {};
        const transport = {
            read: vi.fn(async () => ({ data: [{ id: 1, name: 'a' }], total: 1 })),
            update: vi.fn(() => new Promise<Row>((r) => { release = () => r({ id: 1, name: 'b' }); })),
        } as unknown as IDataTransport<Row>;
        const ds = createDataSource({ transport, optimistic: true });
        await tick();

        ds.update({ id: 1, name: 'b' });
        const syncing = ds.sync();
        await tick();

        expect(ds.data()[0].name, 'the optimistic write did not reach the view').toBe('b');
        release();
        await syncing;
    });

    it('rolls the server copy back and hands the change back when the server refuses', async () => {
        const transport = {
            read: vi.fn(async () => ({ data: [{ id: 1, name: 'a' }], total: 1 })),
            update: vi.fn(async () => { throw new Error('409'); }),
        } as unknown as IDataTransport<Row>;
        const ds = createDataSource({ transport, optimistic: true });
        await tick();

        ds.update({ id: 1, name: 'b' });
        await ds.sync();

        expect(ds.error()?.message).toContain('409');
        expect(ds.hasChanges(), 'the edit was swallowed, so the user cannot retry it').toBe(true);
        expect(ds.data()[0].name, 'a pending edit belongs on screen, refused or not').toBe('b');

        // What the rollback actually restored is the copy UNDER the pending change, and the only
        // way to see it is to drop the change: without the snapshot restore, `_data` would still
        // hold the optimistic 'b' and discarding the edit would leave it there forever.
        ds.cancelChanges();
        expect(ds.data()[0].name, 'the optimistic value was committed to the server copy').toBe('a');
    });
});

describe('bindForm', () => {
    /** The minimum a form has to look like for the bridge. */
    function fakeForm(initial: Record<string, unknown>) {
        const values = signal(initial);
        const dirty = signal(false);
        return {
            getValues: () => values(),
            setValues: (v: Record<string, unknown>) => values.set({ ...v }),
            state: { dirty: computed(() => dirty()), values: computed(() => values()) },
            _edit(v: Record<string, unknown>) { values.set(v); dirty.set(true); },
            _values: values,
        };
    }

    it('an edit in the form becomes a pending change on the record', async () => {
        const ds = createDataSource({ data: rows(3), autoLoad: false });
        await ds.refresh();
        const form = fakeForm({ id: 2, name: 'r2' });

        const unbind = ds.bindForm(form, 2);
        form._edit({ id: 2, name: 'edited' });
        await tick();

        expect(ds.getById(2)).toMatchObject({ name: 'edited' });
        unbind();
    });

    it('a refresh refills a form the user has not touched', async () => {
        const ds = createDataSource({ data: rows(3), autoLoad: false });
        await ds.refresh();
        const form = fakeForm({});

        const unbind = ds.bindForm(form, 3);
        await tick();

        expect(form._values(), 'the form stayed empty after the record arrived')
            .toMatchObject({ id: 3, name: 'r3' });
        unbind();
    });

    it('and leaves a dirty form alone', async () => {
        const ds = createDataSource({ data: rows(3), autoLoad: false });
        await ds.refresh();
        const form = fakeForm({ id: 3, name: 'mine' });
        form._edit({ id: 3, name: 'mine' });

        const unbind = ds.bindForm(form, 3);
        await tick();

        expect(form._values().name, 'a refresh overwrote what the user was typing').toBe('mine');
        unbind();
    });

    it('unbinding stops both directions', async () => {
        const ds = createDataSource({ data: rows(3), autoLoad: false });
        await ds.refresh();
        const form = fakeForm({ id: 1, name: 'r1' });

        ds.bindForm(form, 1)();
        form._edit({ id: 1, name: 'after-unbind' });
        await tick();

        expect(ds.hasChanges(), 'the bridge was still live after dispose').toBe(false);
    });
});

describe('dispose', () => {
    it('cancels the pending debounce, so no request follows the teardown', async () => {
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        const ds = createDataSource({ transport, debounceMs: 20, autoLoad: false });

        ds.setPage(2);
        ds.dispose();
        await tick(60);

        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls,
            'a disposed source queried the server').toHaveLength(0);
    });

    it('cancels a pending autoSync', async () => {
        const create = vi.fn(async (i: Row) => i);
        const transport = {
            read: vi.fn(async () => ({ data: [], total: 0 })),
            create,
        } as unknown as IDataTransport<Row>;
        const ds = createDataSource({ transport, autoSync: { debounceMs: 20 } });
        await tick();

        ds.add({ id: 1, name: 'x' });
        ds.dispose();
        await tick(60);

        expect(create, 'a disposed source wrote to the server').not.toHaveBeenCalled();
    });

    it('stops the cascading effect', async () => {
        const parent = signal(1);
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        const ds = createDataSource({ transport, reactiveParams: () => ({ p: parent() }) });
        await tick();
        const before = (transport.read as ReturnType<typeof vi.fn>).mock.calls.length;

        ds.dispose();
        parent.set(2);
        await tick(20);

        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
    });
});

describe('paging edges', () => {
    it('setPage clamps below 1 instead of asking for page 0', async () => {
        const transport = scriptedTransport(() => Promise.resolve({ data: rows(1), total: 1 }));
        const ds = createDataSource({ transport, autoLoad: false });
        ds.setPage(-5);
        await tick();
        expect(ds.page()).toBe(1);
        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls[0][0].page).toBe(1);
    });

    it('totalPages is 1 when there is no pagination, whatever the total', async () => {
        const ds = createDataSource({
            transport: scriptedTransport(() => Promise.resolve({ data: rows(50), total: 50 })),
            pageSize: 0,
        });
        await tick();
        expect(ds.totalPages()).toBe(1);
    });

    it('an unknown total does not invent a page count', async () => {
        const ds = createDataSource({
            transport: scriptedTransport(() => Promise.resolve({ data: rows(10), total: -1 })),
            pageSize: 10,
        });
        await tick();
        expect(ds.totalPages()).toBe(1);
    });
});
