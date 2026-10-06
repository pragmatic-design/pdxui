import { describe, it, expect } from 'vitest';
import { createDialogQueue } from '@pdxui/core';

describe('createDialogQueue()', () => {
    it('starts with empty items', () => {
        const q = createDialogQueue();
        expect(q.items()).toEqual([]);
        expect(q.count()).toBe(0);
    });

    it('push adds an item and returns a Promise', () => {
        const q = createDialogQueue();
        const p = q.push({ type: 'confirm', title: 'Test' });
        expect(p).toBeInstanceOf(Promise);
        expect(q.count()).toBe(1);
        expect(q.items()[0].title).toBe('Test');
    });

    it('close resolves the Promise with the result', async () => {
        const q = createDialogQueue();
        const p = q.push({ type: 'confirm', title: 'Test' });
        const id = q.items()[0].id;

        q.close(id, true);

        const result = await p;
        expect(result).toBe(true);
        expect(q.count()).toBe(0);
    });

    it('close with false resolves as false (cancel)', async () => {
        const q = createDialogQueue();
        const p = q.push({ type: 'confirm', title: 'Cancel test' });
        const id = q.items()[0].id;

        q.close(id, false);

        expect(await p).toBe(false);
    });

    it('closeAll resolves all with undefined', async () => {
        const q = createDialogQueue();
        const p1 = q.push({ type: 'alert', title: 'A' });
        const p2 = q.push({ type: 'alert', title: 'B' });

        q.closeAll();

        expect(await p1).toBeUndefined();
        expect(await p2).toBeUndefined();
        expect(q.count()).toBe(0);
    });

    it('generates unique IDs', () => {
        const q = createDialogQueue();
        q.push({ type: 'confirm', title: 'A' });
        q.push({ type: 'confirm', title: 'B' });
        const ids = q.items().map(i => i.id);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('assigns z-index from overlayStack', () => {
        const q = createDialogQueue();
        q.push({ type: 'confirm', title: 'Test' });
        expect(q.items()[0].zIndex).toBeGreaterThanOrEqual(1000);
    });
});
