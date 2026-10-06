import { describe, it, expect, vi } from 'vitest';
import { createToastQueue } from '@pdxui/core';

describe('createToastQueue()', () => {
    it('starts empty', () => {
        const q = createToastQueue();
        expect(q.items()).toEqual([]);
        expect(q.count()).toBe(0);
    });

    it('add() returns ID and adds to queue', () => {
        const q = createToastQueue();
        const id = q.add({ message: 'Hello' });
        expect(typeof id).toBe('string');
        expect(q.count()).toBe(1);
        expect(q.items()[0].message).toBe('Hello');
    });

    it('type shortcuts set correct type', () => {
        const q = createToastQueue();
        q.success('ok');
        q.error('fail');
        q.warning('warn');
        q.info('info');
        expect(q.items().map(t => t.type)).toEqual(['success', 'error', 'warning', 'info']);
    });

    it('dismiss removes from queue', () => {
        const q = createToastQueue();
        const id = q.add({ message: 'Bye' });
        q.dismiss(id);
        expect(q.count()).toBe(0);
    });

    it('clear removes all', () => {
        const q = createToastQueue();
        q.add({ message: 'A' });
        q.add({ message: 'B' });
        q.clear();
        expect(q.count()).toBe(0);
    });

    it('respects maxVisible and evicts oldest', () => {
        const q = createToastQueue({ maxVisible: 2 });
        q.add({ message: 'A' });
        q.add({ message: 'B' });
        q.add({ message: 'C' });
        expect(q.count()).toBe(2);
        expect(q.items().map(t => t.message)).toEqual(['B', 'C']);
    });

    it('auto-dismiss fires after duration', async () => {
        vi.useFakeTimers();
        const q = createToastQueue({ defaultDuration: 100 });
        q.add({ message: 'Auto' });
        expect(q.count()).toBe(1);
        vi.advanceTimersByTime(150);
        expect(q.count()).toBe(0);
        vi.useRealTimers();
    });

    it('pause stops auto-dismiss, resume continues from remaining', async () => {
        vi.useFakeTimers();
        const q = createToastQueue({ defaultDuration: 1000 });
        const id = q.add({ message: 'Pausable' });

        // Advance 400ms, then pause
        vi.advanceTimersByTime(400);
        q.pause(id);

        // Advance 2s while paused — should NOT dismiss
        vi.advanceTimersByTime(2000);
        expect(q.count()).toBe(1);

        // Resume — should dismiss after ~600ms remaining
        q.resume(id);
        vi.advanceTimersByTime(500);
        expect(q.count()).toBe(1); // not yet
        vi.advanceTimersByTime(200);
        expect(q.count()).toBe(0); // now dismissed

        vi.useRealTimers();
    });

    it('update changes message and type', () => {
        const q = createToastQueue();
        const id = q.add({ message: 'Loading...', type: 'info', duration: 0 });
        q.update(id, { message: 'Done!', type: 'success', duration: 3000 });

        const t = q.items()[0];
        expect(t.message).toBe('Done!');
        expect(t.type).toBe('success');
    });

    it('promise() shows loading then success', async () => {
        const q = createToastQueue();
        const result = q.promise(
            Promise.resolve(42),
            { loading: 'Working...', success: 'Done', error: 'Failed' },
        );

        expect(q.items()[0].message).toBe('Working...');
        expect(q.items()[0].type).toBe('info');

        const val = await result;
        expect(val).toBe(42);
        // After resolve, toast should be updated to success
        expect(q.items()[0].message).toBe('Done');
        expect(q.items()[0].type).toBe('success');
    });

    it('promise() shows error on rejection', async () => {
        const q = createToastQueue();
        const p = q.promise(
            Promise.reject(new Error('oops')),
            { loading: 'Working...', success: 'Done', error: 'Failed' },
        );

        await expect(p).rejects.toThrow('oops');
        expect(q.items()[0].message).toBe('Failed');
        expect(q.items()[0].type).toBe('error');
    });
});
