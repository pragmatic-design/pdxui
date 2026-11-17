// A month's event shows its time before its title («10:30 AM Call»): its accessible name has to say
// what it shows, in that order, before the rest (WCAG 2.5.3, label in name; axe 4.14's
// label-content-name-mismatch). It read «Call, 10:30 AM, …»: the words a speech user sees were not
// in the name in the order seen. An all-day bar shows its title alone, and its name starts with it.
import { describe, it, expect } from 'vitest';
import { monthEventName } from '../../src/scheduler/event-state';
import { clockLabel } from '../../src/scheduler/labels';

const call = { id: 'a', title: 'Call', start: '2026-09-22T10:30', end: '2026-09-22T11:00' };
const days = ['2026-09-21', '2026-09-22', '2026-09-23'];

describe('a month event\'s name', () => {
    it('a timed one starts with what it shows: its time, then its title', () => {
        const name = monthEventName(call, 630, days, 1, 1, 'en-US', []);
        const shown = `${clockLabel(630, 'en-US')} Call`;
        expect(name.startsWith(shown), name).toBe(true);
        expect(name).toContain('September 22, 2026');
    });

    it('an all-day bar starts with its title, then says it is all day', () => {
        const name = monthEventName({ ...call, start: '2026-09-22', end: '2026-09-23' }, null, days, 1, 1, 'en-US', []);
        expect(name.startsWith('Call, All day'), name).toBe(true);
    });
});
