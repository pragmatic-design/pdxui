// The library's contexts are exported tokens (#495): a consumer reads a <pdx-data-source>, a
// <pdx-error-boundary> and a <pdx-data-source :token> through the token, as the library's own
// consumers do.

import { describe, it, expect, beforeEach } from 'vitest';
import { context, inject, clearProviders, isDataSource, type DataSource } from '@pdxui/core';
import { DataSourceContext } from '../../src/data-source/pdx-data-source';
import { ErrorContext } from '../../src/error-boundary/pdx-error-boundary';

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('the library contexts, read by token', () => {
    beforeEach(() => { document.body.innerHTML = ''; clearProviders(); });

    it("<pdx-data-source> provides its DataSource under DataSourceContext", async () => {
        const source = document.createElement('pdx-data-source') as HTMLElement & { data: unknown };
        source.data = [{ id: 1, name: 'Ann' }];
        const child = document.createElement('div');
        source.appendChild(child);
        document.body.appendChild(source);
        await settle();
        const ds = inject(DataSourceContext, child, null);
        expect(ds, 'nothing provided under DataSourceContext').not.toBeNull();
        expect(isDataSource(ds)).toBe(true);
    });

    it('<pdx-data-source :token> provides it under that token too, and only that one of the name', async () => {
        const Orders = context<DataSource<Record<string, unknown>>>('orders');
        const source = document.createElement('pdx-data-source') as HTMLElement & { data: unknown; token: unknown };
        source.data = [{ id: 1 }];
        source.token = Orders;
        const child = document.createElement('div');
        source.appendChild(child);
        document.body.appendChild(source);
        await settle();
        expect(inject(Orders, child, null)).toBe(inject(DataSourceContext, child, null));
        expect(inject(Orders, child, null)).not.toBeNull();
        // The control: another token of the same name finds nothing.
        expect(inject(context('orders'), child, null)).toBeNull();
    });

    it('<pdx-error-boundary> provides its ErrorContext under the ErrorContext token', async () => {
        const boundary = document.createElement('pdx-error-boundary');
        const child = document.createElement('div');
        boundary.appendChild(child);
        document.body.appendChild(boundary);
        await settle();
        const errors = inject(ErrorContext, child, null);
        expect(errors, 'nothing provided under ErrorContext').not.toBeNull();
        expect(errors!.error()).toBeNull();
        expect(typeof errors!.retry).toBe('function');
    });
});
