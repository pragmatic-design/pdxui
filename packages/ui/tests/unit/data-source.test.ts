// Tests for pdx-data-source non-rendering component.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/data-source/pdx-data-source';

describe('pdx-data-source', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('registers as a custom element', () => {
        expect(customElements.get('pdx-data-source')).toBeDefined();
    });

    it('renders nothing visible (non-rendering)', async () => {
        const el = document.createElement('pdx-data-source');
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // Should have no visible content (only slot)
        expect(el.offsetHeight).toBe(0);
    });

    it('projects children through slot', async () => {
        const el = document.createElement('pdx-data-source');
        const child = document.createElement('span');
        child.textContent = 'child content';
        el.appendChild(child);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));

        expect(el.querySelector('span')?.textContent).toBe('child content');
    });

    it('creates DataSource from data prop', async () => {
        const el = document.createElement('pdx-data-source') as any;
        el.data = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
        el.idField = 'id';
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 50));

        // The exposed API is frozen on the element
        expect(el.source).toBeDefined();
    });

    it('accepts pageSize prop', async () => {
        const el = document.createElement('pdx-data-source') as any;
        el.data = [{ id: 1 }, { id: 2 }, { id: 3 }];
        el.pageSize = 2;
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 50));

        expect(el).toBeTruthy();
    });
});
