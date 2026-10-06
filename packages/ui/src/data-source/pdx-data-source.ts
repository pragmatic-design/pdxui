// pdx-data-source — Non-rendering data provider component.
// Creates a DataSource from declarative props and exposes it to children via slot scope.
// Usage:
//   <pdx-data-source url="/api/users" :page-size="25" let:source>
//     <pdx-select :source="source" label-field="name" />
//   </pdx-data-source>
//
// Or with static data:
//   <pdx-data-source :data="items" id-field="id" let:source>
//     <pdx-table :source="source" />
//   </pdx-data-source>

import { component, html, signal, computed, provide } from '@pdxui/core';
import { createDataSource, restTransport, arrayTransport } from '@pdxui/core';
import type { DataSource } from '@pdxui/core';

/**
 * A non-rendering element that creates a DataSource declaratively: the reactive data layer for lists,
 * tables and selects.
 */
component('pdx-data-source', {
    props: {
        /** REST endpoint URL. When set, creates a restTransport-backed DataSource. */
        url: { type: String, default: '' },
        /** Static data array. When set, creates an arrayTransport-backed DataSource. */
        data: { type: Array, default: null },
        /** Custom transport object (IDataTransport). Takes priority over url/data. */
        transport: { type: Object, default: null },
        /** ID field for identifying items. Default: 'id'. */
        idField: { type: String, default: 'id' },
        /** Page size. 0 = no pagination. Default: 0. */
        pageSize: { type: Number, default: 0 },
        /** Auto-load on creation. Default: true. */
        autoLoad: { type: Boolean, default: true },
        /** Initial sort. Array of { field, dir } objects. */
        sort: { type: Array, default: null },
        /** Initial filter. Array of filter descriptors. */
        filter: { type: Array, default: null },
        /** Additional params passed to transport.read(). */
        params: { type: Object, default: null },
        /** Name for Context Protocol provide. Descendants can inject('ds:{name}'). */
        name: { type: String, default: '' },
    },
    setup(ctx) {
        const _ds = signal<DataSource<Record<string, unknown>> | null>(null);

        // Create/recreate DataSource when config changes
        ctx.track(() => {
            const url = ctx.url() as string;
            const data = ctx.data() as unknown[] | null;
            const customTransport = ctx.transport() as any;
            const idField = (ctx.idField() as string) || 'id';
            const pageSize = ctx.pageSize() as number;
            const autoLoad = ctx.autoLoad() as boolean;
            const initialSort = ctx.sort() as any[] | null;
            const initialFilter = ctx.filter() as any[] | null;
            const params = ctx.params() as Record<string, unknown> | null;

            let transport;
            if (customTransport && typeof customTransport.read === 'function') {
                transport = customTransport;
            } else if (url) {
                transport = restTransport({ baseUrl: url, idField: idField as any });
            } else if (data && Array.isArray(data)) {
                transport = arrayTransport({ data: data as any[], idField });
            } else {
                // No source configured yet
                _ds.set(null);
                return;
            }

            const ds = createDataSource({
                transport,
                idField,
                pageSize,
                autoLoad,
                sort: initialSort ?? undefined,
                filter: initialFilter ?? undefined,
                params: params ?? undefined,
            });

            _ds.set(ds);

            // Auto-provide via Context Protocol if named
            const dsName = ctx.name() as string;
            if (dsName) {
                provide(`ds:${dsName}`, ds, ctx.el);
            }
            // Always provide as 'dataSource' for unnamed (nearest ancestor pattern)
            provide('dataSource', ds, ctx.el);
        });

        // Expose the DataSource for parent access via :ref or slot scope
        ctx.expose({
            /** The DataSource itself, as a computed: call it — `el.source()` — and it re-reads when the source is replaced. */
            source: computed(() => _ds()),
        });

        return { source: _ds };
    },
    render: (_ctx) => {
        // Non-rendering: just project children
        // The DataSource is accessible via :source binding from the parent
        return html`<slot></slot>`;
    },
});
