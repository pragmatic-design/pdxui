// JSON-driven grid configuration — one JSON object creates a complete DataGrid.
// Converts FieldDefinition[] to ColumnDef[] and creates a DataSource.

import type { ColumnDef, EditMode, SelectionMode } from './data-grid-types';
import type { DataSource } from './data-source';
import { createDataSource } from './data-source';
import { restTransport } from './transport';
import type { FieldDefinition } from './field-definition';
import { toColumnDefs } from './field-definition';

// ─── Grid Config (fully JSON-serializable) ─────────────────

export interface DataGridConfig {
    /** Field definitions — drives columns, editing, filtering. */
    fields: FieldDefinition[];
    /** DataSource configuration. */
    dataSource?: {
        /** REST endpoint URL. */
        url?: string;
        /** Static data array. */
        data?: Record<string, unknown>[];
        /** Page size (0 = no pagination). */
        pageSize?: number;
        /** ID field name. Default: 'id'. */
        idField?: string;
    };
    /** Enable editing. */
    editable?: boolean;
    /** Edit mode. Default: 'cell'. */
    editMode?: EditMode;
    /** Selection mode. Default: 'none'. */
    selection?: SelectionMode;
    /** Show toolbar. */
    toolbar?: boolean;
    /** Show group bar. */
    groupBar?: boolean;
    /** Enable virtual scroll. */
    virtualScroll?: boolean;
    /** Striped rows. */
    striped?: boolean;
    /** Hover highlight. */
    hover?: boolean;
    /** Compact density. */
    compact?: boolean;
    /** Sticky header. */
    stickyHeader?: boolean;
    /** Pagination position. */
    paginationPosition?: 'bottom' | 'top' | 'both';
}

// ─── Factory ───────────────────────────────────────────────

export interface GridFromConfig {
    source: DataSource<Record<string, unknown>>;
    columns: ColumnDef[];
    props: Record<string, unknown>;
}

/** Create a DataSource + ColumnDef[] + component props from a JSON config. */
export function createGridFromConfig(config: DataGridConfig): GridFromConfig {
    const columns = toColumnDefs(config.fields);

    // Build DataSource
    const dsConfig = config.dataSource ?? {};
    let source: DataSource<Record<string, unknown>>;

    if (dsConfig.url) {
        source = createDataSource({
            transport: restTransport({ baseUrl: dsConfig.url }),
            idField: dsConfig.idField ?? 'id',
            pageSize: dsConfig.pageSize ?? 0,
        });
    } else {
        source = createDataSource({
            data: dsConfig.data ?? [],
            idField: dsConfig.idField ?? 'id',
            pageSize: dsConfig.pageSize ?? 0,
        });
    }

    // Map config to component props
    const props: Record<string, unknown> = {
        editable: config.editable ?? false,
        editMode: config.editMode ?? 'cell',
        selection: config.selection ?? 'none',
        showToolbar: config.toolbar ?? false,
        showGroupBar: config.groupBar ?? false,
        virtualScroll: config.virtualScroll ?? false,
        striped: config.striped ?? false,
        hover: config.hover ?? true,
        compact: config.compact ?? false,
        stickyHeader: config.stickyHeader ?? true,
        paginationPosition: config.paginationPosition ?? 'bottom',
    };

    return { source, columns, props };
}
