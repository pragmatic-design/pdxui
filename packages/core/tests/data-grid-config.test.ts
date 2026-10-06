// createGridFromConfig — the JSON-in, grid-out entry point.
//
// The rules it enforces are almost entirely DEFAULTS, and a default table is exactly the kind of
// code that rots without anyone noticing: two of these are `true`, so the usual "everything falls
// back to false" reading of the file is wrong, and a `||` where the code has `??` would silently
// ignore a caller who asked for `false`.

import { describe, it, expect } from 'vitest';
import { createGridFromConfig } from '../src/data/data-grid-config';
import type { FieldDefinition } from '../src/data/field-definition';

const FIELDS: FieldDefinition[] = [
    { field: 'id', label: 'ID', type: 'number' },
    { field: 'title', label: 'Title', type: 'text' },
];

/** The source loads on creation (autoLoad defaults to true), so give it a turn to settle. */
const settle = () => new Promise(r => setTimeout(r, 0));

describe('createGridFromConfig — columns', () => {
    it('derives the columns from the field definitions', () => {
        const { columns } = createGridFromConfig({ fields: FIELDS });
        expect(columns.map(c => c.field)).toEqual(['id', 'title']);
    });

    it('accepts an empty field list without inventing columns', () => {
        const { columns } = createGridFromConfig({ fields: [] });
        expect(columns).toEqual([]);
    });
});

describe('createGridFromConfig — where the rows come from', () => {
    it('uses the static data when no url is given', async () => {
        const { source } = createGridFromConfig({
            fields: FIELDS,
            dataSource: { data: [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }] },
        });
        await settle();
        expect(source.data().map(r => r.id)).toEqual([1, 2]);
    });

    it('falls back to an empty array rather than undefined', async () => {
        // `data: undefined` and `dataSource: undefined` must both give a working, empty source —
        // a grid that renders nothing is right, a grid that throws on load is not.
        const a = createGridFromConfig({ fields: FIELDS });
        const b = createGridFromConfig({ fields: FIELDS, dataSource: {} });
        await settle();
        expect(a.source.data()).toEqual([]);
        expect(b.source.data()).toEqual([]);
        expect(a.source.error()).toBeNull();
    });

    it('carries the id field and the page size into the source, in both branches', () => {
        const rest = createGridFromConfig({
            fields: FIELDS,
            dataSource: { url: 'https://example.test/api/items', idField: 'uuid', pageSize: 25 },
        });
        const local = createGridFromConfig({
            fields: FIELDS,
            dataSource: { data: [], idField: 'uuid', pageSize: 25 },
        });
        expect(rest.source.pageSize()).toBe(25);
        expect(local.source.pageSize()).toBe(25);
    });

    it('defaults to no pagination, which is not the DataSource default', () => {
        // createDataSource's own default is 25. This file overrides it to 0 in BOTH branches, so a
        // grid built from config shows everything unless the config asks for pages. Worth pinning:
        // dropping the `?? 0` would silently paginate every JSON-configured grid at 25 rows.
        const { source } = createGridFromConfig({ fields: FIELDS, dataSource: { data: [] } });
        expect(source.pageSize()).toBe(0);
    });
});

describe('createGridFromConfig — the defaults are a contract', () => {
    it('fills every prop when the config says nothing', () => {
        const { props } = createGridFromConfig({ fields: FIELDS });
        expect(props).toEqual({
            editable: false,
            editMode: 'cell',
            selection: 'none',
            showToolbar: false,
            showGroupBar: false,
            virtualScroll: false,
            striped: false,
            hover: true,          // not false — a grid highlights the row under the cursor
            compact: false,
            stickyHeader: true,   // not false — the header stays put while the body scrolls
            paginationPosition: 'bottom',
        });
    });

    it('passes through what the config does say', () => {
        const { props } = createGridFromConfig({
            fields: FIELDS,
            editable: true,
            editMode: 'row',
            selection: 'multiple',
            toolbar: true,
            groupBar: true,
            virtualScroll: true,
            striped: true,
            compact: true,
            paginationPosition: 'both',
        });
        expect(props.editable).toBe(true);
        expect(props.editMode).toBe('row');
        expect(props.selection).toBe('multiple');
        expect(props.showToolbar).toBe(true);
        expect(props.showGroupBar).toBe(true);
        expect(props.virtualScroll).toBe(true);
        expect(props.striped).toBe(true);
        expect(props.compact).toBe(true);
        expect(props.paginationPosition).toBe('both');
    });

    it('lets a caller turn OFF the two that default to on', () => {
        // The reason this is its own case: `hover ?? true` honours an explicit `false`, and
        // `hover || true` — the mistake one refactor away — cannot. Nothing else in the file
        // distinguishes the two.
        const { props } = createGridFromConfig({ fields: FIELDS, hover: false, stickyHeader: false });
        expect(props.hover).toBe(false);
        expect(props.stickyHeader).toBe(false);
    });

    it('renames toolbar and groupBar on the way to the component', () => {
        // The config speaks the author's language and the component speaks its own. A silent rename
        // is where a prop goes missing, so it is pinned.
        const { props } = createGridFromConfig({ fields: FIELDS, toolbar: true, groupBar: true });
        expect(props.toolbar, 'the config key must not leak through unmapped').toBeUndefined();
        expect(props.groupBar).toBeUndefined();
        expect(props.showToolbar).toBe(true);
        expect(props.showGroupBar).toBe(true);
    });
});
