// Coverage (C): dialog-queue — signal-based programmatic dialog queue.

import { describe, it, expect, beforeEach } from 'vitest';
import { createDialogQueue } from '../src/component/dialog-queue';

describe('dialog queue', () => {
    let q: ReturnType<typeof createDialogQueue>;
    beforeEach(() => { q = createDialogQueue(); });

    it('starts empty', () => {
        expect(q.count()).toBe(0);
        expect(q.items()).toEqual([]);
    });

    it('push adds an instance with id + zIndex and bumps count', () => {
        q.push({ type: 'alert', title: 'Hi' });
        expect(q.count()).toBe(1);
        const item = q.items()[0];
        expect(item.id).toMatch(/^pdx-dlg-/);
        expect(item.type).toBe('alert');
        expect(typeof item.zIndex).toBe('number');
        expect(typeof item.createdAt).toBe('number');
    });

    it('honors an explicit id', () => {
        q.push({ id: 'my-dialog', type: 'dialog', title: 'X' });
        expect(q.items()[0].id).toBe('my-dialog');
    });

    it('close resolves the push promise with the result and removes the item', async () => {
        const p = q.push({ id: 'd1', type: 'confirm', title: 'Sure?' });
        q.close('d1', true);
        await expect(p).resolves.toBe(true);
        expect(q.count()).toBe(0);
    });

    it('close on an unknown id is a no-op', () => {
        q.push({ id: 'd1', type: 'alert', title: 'A' });
        q.close('nope');
        expect(q.count()).toBe(1);
    });

    it('closeAll resolves every dialog with undefined and empties the queue', async () => {
        const p1 = q.push({ id: 'a', type: 'alert', title: 'A' });
        const p2 = q.push({ id: 'b', type: 'alert', title: 'B' });
        q.closeAll();
        await expect(p1).resolves.toBeUndefined();
        await expect(p2).resolves.toBeUndefined();
        expect(q.count()).toBe(0);
    });

    it('keeps insertion order (newest last)', () => {
        q.push({ id: 'first', type: 'alert', title: '1' });
        q.push({ id: 'second', type: 'alert', title: '2' });
        expect(q.items().map(d => d.id)).toEqual(['first', 'second']);
    });
});
