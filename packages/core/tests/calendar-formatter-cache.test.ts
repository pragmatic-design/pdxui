// One Intl.DateTimeFormat per locale and options, not one per call (#894).
//
// `pdx-calendar` formats a date for every day cell it draws, through `formatWithCalendar`. A new
// formatter per call made a formatter's construction 52% of a calendar's mount: 100 calendars took
// 787 ms to draw, 200 ms with the formatters cached.

import { describe, it, expect } from 'vitest';
import { formatWithCalendar, getMonthNames, getDayNames, getDateFormatOrder, is12HourClock } from '../src/calendar/calendar-engine';

/** How many formatters `fn` constructs: the real constructor, counted. */
function constructions(fn: () => void): number {
    const Original = Intl.DateTimeFormat;
    let n = 0;
    function Counting(...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        n++;
        return new Original(...args);
    }
    Counting.prototype = Original.prototype;
    Counting.supportedLocalesOf = Original.supportedLocalesOf;
    (Intl as { DateTimeFormat: unknown }).DateTimeFormat = Counting;
    try {
        fn();
    } finally {
        (Intl as { DateTimeFormat: unknown }).DateTimeFormat = Original;
    }
    return n;
}

describe('the calendar engine builds a formatter once per locale and options', () => {
    it('formatWithCalendar, called 1000 times', () => {
        // A locale and options no other test uses, so the cache starts empty for them.
        const n = constructions(() => {
            for (let i = 0; i < 1000; i++) formatWithCalendar('2026-11-05', 'en-GB', 'gregory', { day: 'numeric', month: 'short' });
        });
        expect(n, 'a formatter was built per call').toBeLessThanOrEqual(1);
    });

    it('the others, called 100 times each', () => {
        const n = constructions(() => {
            for (let i = 0; i < 100; i++) {
                getMonthNames('en-AU', 'gregory', 'short');
                getDayNames('en-AU', 'narrow', 1);
                getDateFormatOrder('en-AU');
                is12HourClock('en-AU');
            }
        });
        expect(n, 'a formatter was built per call').toBeLessThanOrEqual(4);
    });

    it('still formats what it formatted', () => {
        expect(formatWithCalendar('2026-11-05', 'en-US', 'gregory', { dateStyle: 'medium' })).toBe('Nov 5, 2026');
        expect(formatWithCalendar('2026-11-05', 'en-US', 'gregory', { dateStyle: 'medium' })).toBe('Nov 5, 2026');
        expect(getMonthNames('en-US')[0]).toBe('January');
        expect(getDayNames('en-US', 'short', 1)[0]).toBe('Mon');
    });
});
