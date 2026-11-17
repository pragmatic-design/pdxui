// A scheduler event's button shows its time and its title as two words apart, so that its accessible
// name can say them as they are seen (WCAG 2.5.3; axe 4.14's label-content-name-mismatch): run
// together, «10:30 AMCall» is a word no name holds.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/scheduler/scheduler-event.pdx';

afterEach(() => cleanup());

async function eventButton(props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement('pdx-scheduler-event');
    Object.assign(el, { item: { id: 'a', title: 'Call', start: '2026-09-22T10:30', end: '2026-09-22T11:00' }, ...props });
    document.body.appendChild(el);
    await tick();
    return el.querySelector<HTMLElement>('[data-part="eventButton"]')!;
}

describe('a scheduler event\'s text', () => {
    it('time first: the time, a space, the title', async () => {
        const b = await eventButton({ time: '10:30 AM', timeFirst: true });
        expect(b.textContent!.replace(/\s+/g, ' ').trim()).toBe('10:30 AM Call');
    });

    it('time after: the title, a space, the time', async () => {
        const b = await eventButton({ time: '10:30 AM' });
        expect(b.textContent!.replace(/\s+/g, ' ').trim()).toBe('Call 10:30 AM');
    });
});
