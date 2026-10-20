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
import type { Context, DataSource } from '@pdxui/core';
import { DataSourceContext } from './data-source-context';

export { DataSourceContext };

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
        /**
         * A context token of your own, `context<DataSource<Order>>('orders')`, the source is provided
         * under too: a component below injects that one by it, past a nearer `<pdx-data-source>`.
         */
        token: { type: Object, default: null },
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

            // Under the token it is given, for a component that wants this source by name (#495)…
            const token = ctx.token() as Context<DataSource<Record<string, unknown>>> | null;
            if (token) provide(token, ds, ctx.el);
            // …and always under DataSourceContext: the nearest source, for the library's consumers.
            provide(DataSourceContext, ds, ctx.el);
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
