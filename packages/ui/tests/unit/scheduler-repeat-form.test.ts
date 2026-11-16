// pdx-scheduler's repetition editor (#1020, part 9b): a rule read into the editor's fields — how often,
// every how many, which weekdays, until when — and written back from them. A rule the fields cannot say
// is «custom», kept as it was written.
import { describe, it, expect } from 'vitest';
import { repeatOf, ruleOf, type RepeatForm } from '../../src/scheduler/repeat-form';

const form = (over: Partial<RepeatForm>): RepeatForm => ({ freq: 'none', interval: 1, days: '', ends: 'never', count: 1, until: '', raw: '', ...over });

describe('repeatOf', () => {
    it('no rule repeats never', () => {
        expect(repeatOf(undefined)).toEqual(form({}));
    });

    it('reads how often, every how many, the weekdays and the end', () => {
        expect(repeatOf('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')).toEqual(form({ freq: 'WEEKLY', interval: 2, days: 'MO,WE', raw: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE' }));
        expect(repeatOf('FREQ=DAILY;COUNT=5')).toEqual(form({ freq: 'DAILY', ends: 'count', count: 5, raw: 'FREQ=DAILY;COUNT=5' }));
        expect(repeatOf('RRULE:FREQ=MONTHLY;UNTIL=20261231')).toEqual(form({ freq: 'MONTHLY', ends: 'until', until: '2026-12-31', raw: 'RRULE:FREQ=MONTHLY;UNTIL=20261231' }));
    });

    it('a rule the fields cannot say is custom: ordinals, month days, months, weekdays on a daily rule, an UNTIL with a time', () => {
        for (const raw of ['FREQ=MONTHLY;BYDAY=1FR', 'FREQ=MONTHLY;BYMONTHDAY=-1', 'FREQ=YEARLY;BYMONTH=6,7', 'FREQ=DAILY;BYDAY=MO,TU', 'FREQ=DAILY;UNTIL=20261231T000000Z', 'FREQ=WEEKLY;WKST=SU', 'FREQ=HOURLY']) {
            expect(repeatOf(raw)).toEqual(expect.objectContaining({ freq: 'custom', raw }));
        }
    });
});

describe('ruleOf', () => {
    it('writes only what differs from the default: no INTERVAL=1, no BYDAY on another frequency', () => {
        expect(ruleOf(form({ freq: 'none' }))).toBeUndefined();
        expect(ruleOf(form({ freq: 'DAILY' }))).toBe('FREQ=DAILY');
        expect(ruleOf(form({ freq: 'WEEKLY', interval: 2, days: 'MO,WE' }))).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
        expect(ruleOf(form({ freq: 'MONTHLY', days: 'MO' }))).toBe('FREQ=MONTHLY');
    });

    it('writes the end: after a count, or on a date (inclusive)', () => {
        expect(ruleOf(form({ freq: 'DAILY', ends: 'count', count: 3 }))).toBe('FREQ=DAILY;COUNT=3');
        expect(ruleOf(form({ freq: 'YEARLY', ends: 'until', until: '2030-01-31' }))).toBe('FREQ=YEARLY;UNTIL=20300131');
    });

    it('a custom rule is written back as it was', () => {
        expect(ruleOf(form({ freq: 'custom', raw: 'FREQ=MONTHLY;BYDAY=-1FR' }))).toBe('FREQ=MONTHLY;BYDAY=-1FR');
    });

    it('reads back what it writes', () => {
        for (const f of [form({ freq: 'WEEKLY', interval: 3, days: 'TU,TH', ends: 'count', count: 10 }), form({ freq: 'DAILY', ends: 'until', until: '2026-12-01' })]) {
            const rule = ruleOf(f)!;
            expect(repeatOf(rule)).toEqual({ ...f, raw: rule });
        }
    });
});
