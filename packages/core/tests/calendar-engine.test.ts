// Tests for CalendarEngine — pure math, zero DOM.

import { describe, it, expect } from 'vitest';
import {
    gregorianToJD, jdToGregorian, getDaysInMonth, addDays, addMonths, addYears,
    compareDates, isSameDay, isSameMonth, isInRange, isWeekend,
    isoWeekNumber, dayOfWeek, getFirstDayOfWeek, generateMonthGrid,
    getFiscalYear, getFiscalQuarter, getWeekRange, getMonthRange, getQuarterRange, getYearRange,
    getMonthNames, getDayNames, formatWithCalendar, getDateFormatOrder, is12HourClock,
    parseISO, toISO, clampDate,
} from '../src/calendar/calendar-engine';

// ─── Julian Day Number ────────────────────────────────────────

describe('gregorianToJD / jdToGregorian', () => {
    it('converts known epoch dates', () => {
        // J2000.0: Jan 1.5, 2000 = JD 2451545.0 → Jan 1, 2000 = JD 2451545
        expect(gregorianToJD(2000, 1, 1)).toBe(2451545);
        // Unix epoch: Jan 1, 1970 = JD 2440588
        expect(gregorianToJD(1970, 1, 1)).toBe(2440588);
    });

    it('round-trips correctly', () => {
        const cases = [
            { y: 2024, m: 2, d: 29 }, // leap day
            { y: 1900, m: 3, d: 1 },  // non-leap century
            { y: 2000, m: 2, d: 29 }, // leap century
            { y: 2026, m: 4, d: 7 },  // today-ish
            { y: 1, m: 1, d: 1 },     // year 1
        ];
        for (const c of cases) {
            const jd = gregorianToJD(c.y, c.m, c.d);
            const back = jdToGregorian(jd);
            expect(back).toEqual({ year: c.y, month: c.m, day: c.d });
        }
    });

    it('handles sequential days', () => {
        const jd1 = gregorianToJD(2024, 12, 31);
        const jd2 = gregorianToJD(2025, 1, 1);
        expect(jd2 - jd1).toBe(1);
    });
});

// ─── Date Arithmetic ──────────────────────────────────────────

describe('getDaysInMonth', () => {
    it('returns correct days for each month', () => {
        expect(getDaysInMonth(2024, 1)).toBe(31);
        expect(getDaysInMonth(2024, 2)).toBe(29); // leap
        expect(getDaysInMonth(2023, 2)).toBe(28); // non-leap
        expect(getDaysInMonth(2024, 4)).toBe(30);
        expect(getDaysInMonth(2024, 12)).toBe(31);
    });
});

describe('addDays', () => {
    it('adds positive days', () => {
        expect(addDays('2024-01-30', 3)).toBe('2024-02-02');
    });

    it('subtracts days', () => {
        expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    });

    it('crosses year boundary', () => {
        expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    });
});

describe('addMonths', () => {
    it('adds months', () => {
        expect(addMonths('2024-01-15', 2)).toBe('2024-03-15');
    });

    it('clamps day when target month is shorter', () => {
        expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
        expect(addMonths('2023-01-31', 1)).toBe('2023-02-28'); // non-leap
    });

    it('handles negative months', () => {
        expect(addMonths('2024-03-15', -3)).toBe('2023-12-15');
    });

    it('crosses year boundary forward', () => {
        expect(addMonths('2024-11-15', 3)).toBe('2025-02-15');
    });
});

describe('addYears', () => {
    it('adds years', () => {
        expect(addYears('2024-06-15', 1)).toBe('2025-06-15');
    });

    it('clamps Feb 29 on non-leap year', () => {
        expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    });
});

// ─── Comparison ───────────────────────────────────────────────

describe('comparison functions', () => {
    it('compareDates returns correct ordering', () => {
        expect(compareDates('2024-01-01', '2024-01-02')).toBe(-1);
        expect(compareDates('2024-01-02', '2024-01-01')).toBe(1);
        expect(compareDates('2024-01-01', '2024-01-01')).toBe(0);
    });

    it('isSameDay works', () => {
        expect(isSameDay('2024-06-15', '2024-06-15')).toBe(true);
        expect(isSameDay('2024-06-15', '2024-06-16')).toBe(false);
    });

    it('isSameMonth works', () => {
        expect(isSameMonth('2024-06-01', '2024-06-30')).toBe(true);
        expect(isSameMonth('2024-06-01', '2024-07-01')).toBe(false);
    });

    it('isInRange works', () => {
        expect(isInRange('2024-06-15', '2024-06-01', '2024-06-30')).toBe(true);
        expect(isInRange('2024-06-01', '2024-06-01', '2024-06-30')).toBe(true); // inclusive
        expect(isInRange('2024-06-30', '2024-06-01', '2024-06-30')).toBe(true); // inclusive
        expect(isInRange('2024-07-01', '2024-06-01', '2024-06-30')).toBe(false);
    });

    it('isWeekend detects Sat/Sun', () => {
        expect(isWeekend('2024-04-06')).toBe(true);  // Saturday
        expect(isWeekend('2024-04-07')).toBe(true);  // Sunday
        expect(isWeekend('2024-04-08')).toBe(false);  // Monday
    });
});

// ─── ISO Week Number ──────────────────────────────────────────

describe('isoWeekNumber', () => {
    it('returns correct week for known dates', () => {
        expect(isoWeekNumber(2024, 1, 1)).toBe(1);    // Mon
        expect(isoWeekNumber(2024, 12, 30)).toBe(1);   // Mon of week 1 of 2025
        expect(isoWeekNumber(2023, 1, 1)).toBe(52);    // Sun — still week 52 of 2022
    });

    it('week 1 always contains Jan 4', () => {
        for (let y = 2020; y <= 2030; y++) {
            expect(isoWeekNumber(y, 1, 4)).toBe(1);
        }
    });
});

// ─── Day of Week ──────────────────────────────────────────────

describe('dayOfWeek', () => {
    it('returns 0 for Sunday', () => {
        expect(dayOfWeek(2024, 4, 7)).toBe(0); // April 7, 2024 = Sunday
    });

    it('returns 1 for Monday', () => {
        expect(dayOfWeek(2024, 4, 8)).toBe(1);
    });

    it('returns 6 for Saturday', () => {
        expect(dayOfWeek(2024, 4, 6)).toBe(6);
    });
});

// ─── First Day of Week ───────────────────────────────────────

describe('getFirstDayOfWeek', () => {
    it('returns 0 (Sunday) for en-US', () => {
        expect(getFirstDayOfWeek('en-US')).toBe(0);
    });

    it('returns 1 (Monday) for de-DE', () => {
        expect(getFirstDayOfWeek('de-DE')).toBe(1);
    });

    it('returns 1 (Monday) for it', () => {
        expect(getFirstDayOfWeek('it')).toBe(1);
    });

    it('returns a number for unknown locale', () => {
        // Intl may resolve unknown locales to a default (often Monday=1)
        const result = getFirstDayOfWeek('xx');
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(6);
    });
});

// ─── Month Grid ───────────────────────────────────────────────

describe('generateMonthGrid', () => {
    it('generates 6 weeks by default (fixedWeeks)', () => {
        const grid = generateMonthGrid(2024, 6);
        expect(grid.weeks.length).toBe(6);
        expect(grid.weeks[0].length).toBe(7);
    });

    it('has correct year/month', () => {
        const grid = generateMonthGrid(2024, 6);
        expect(grid.year).toBe(2024);
        expect(grid.month).toBe(6);
    });

    it('first cell is correct for Monday-start', () => {
        // June 2024: starts on Saturday. Monday-start grid should start May 27.
        const grid = generateMonthGrid(2024, 6, { firstDay: 1 });
        expect(grid.weeks[0][0].iso).toBe('2024-05-27');
        expect(grid.weeks[0][0].outside).toBe(true);
    });

    it('first cell is correct for Sunday-start', () => {
        // June 2024: starts on Saturday. Sunday-start grid should start May 26.
        const grid = generateMonthGrid(2024, 6, { firstDay: 0 });
        expect(grid.weeks[0][0].iso).toBe('2024-05-26');
    });

    it('marks outside days', () => {
        const grid = generateMonthGrid(2024, 6, { firstDay: 1 });
        // May 27 is outside
        expect(grid.weeks[0][0].outside).toBe(true);
        // June 1 is inside (Saturday = index 5 in Mon-start)
        const june1 = grid.weeks.flat().find(c => c.iso === '2024-06-01');
        expect(june1?.outside).toBe(false);
    });

    it('marks today', () => {
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const grid = generateMonthGrid(d.getFullYear(), d.getMonth() + 1);
        const todayCell = grid.weeks.flat().find(c => c.iso === todayStr);
        expect(todayCell?.today).toBe(true);
    });

    it('includes week numbers when requested', () => {
        const grid = generateMonthGrid(2024, 1, { weekNumbers: true, firstDay: 1 });
        expect(grid.weekNumbers).toBeDefined();
        expect(grid.weekNumbers!.length).toBe(6);
        expect(grid.weekNumbers![0]).toBe(1); // Jan 1, 2024 is in week 1
    });

    it('has 7 day name headers', () => {
        const grid = generateMonthGrid(2024, 6);
        expect(grid.dayNames.length).toBe(7);
    });

    it('all 30 June days present', () => {
        const grid = generateMonthGrid(2024, 6);
        const juneDays = grid.weeks.flat().filter(c => !c.outside);
        expect(juneDays.length).toBe(30);
    });

    it('non-fixed weeks can have fewer rows', () => {
        // Feb 2015: starts on Sunday (0). With Sunday-start, fits in 4 weeks.
        const grid = generateMonthGrid(2015, 2, { fixedWeeks: false, firstDay: 0 });
        expect(grid.weeks.length).toBe(4);
    });
});

// ─── Fiscal Year / Quarter ────────────────────────────────────

describe('fiscal year/quarter', () => {
    it('getFiscalYear with April start', () => {
        expect(getFiscalYear(2024, 4, 4)).toBe(2024); // April = start of FY2024
        expect(getFiscalYear(2024, 3, 4)).toBe(2023); // March = still FY2023
        expect(getFiscalYear(2024, 12, 4)).toBe(2024);
    });

    it('getFiscalYear with January start (calendar year)', () => {
        expect(getFiscalYear(2024, 1, 1)).toBe(2024);
        expect(getFiscalYear(2024, 12, 1)).toBe(2024);
    });

    it('getFiscalQuarter with April start', () => {
        expect(getFiscalQuarter(4, 4)).toBe(1);  // Apr = Q1
        expect(getFiscalQuarter(7, 4)).toBe(2);  // Jul = Q2
        expect(getFiscalQuarter(10, 4)).toBe(3); // Oct = Q3
        expect(getFiscalQuarter(1, 4)).toBe(4);  // Jan = Q4
        expect(getFiscalQuarter(3, 4)).toBe(4);  // Mar = Q4
    });

    it('getFiscalQuarter with January start', () => {
        expect(getFiscalQuarter(1, 1)).toBe(1);
        expect(getFiscalQuarter(4, 1)).toBe(2);
        expect(getFiscalQuarter(7, 1)).toBe(3);
        expect(getFiscalQuarter(10, 1)).toBe(4);
    });
});

// ─── Range Helpers ────────────────────────────────────────────

describe('range helpers', () => {
    it('getWeekRange returns Mon-Sun for Monday-start', () => {
        // April 10, 2024 = Wednesday
        const range = getWeekRange('2024-04-10', 1);
        expect(range.start).toBe('2024-04-08'); // Monday
        expect(range.end).toBe('2024-04-14');   // Sunday
    });

    it('getWeekRange returns Sun-Sat for Sunday-start', () => {
        const range = getWeekRange('2024-04-10', 0);
        expect(range.start).toBe('2024-04-07'); // Sunday
        expect(range.end).toBe('2024-04-13');   // Saturday
    });

    it('getMonthRange', () => {
        const range = getMonthRange(2024, 2);
        expect(range.start).toBe('2024-02-01');
        expect(range.end).toBe('2024-02-29');
    });

    it('getQuarterRange Q1 calendar year', () => {
        const range = getQuarterRange(2024, 1, 1);
        expect(range.start).toBe('2024-01-01');
        expect(range.end).toBe('2024-03-31');
    });

    it('getQuarterRange Q1 fiscal (April start)', () => {
        const range = getQuarterRange(2024, 1, 4);
        expect(range.start).toBe('2024-04-01');
        expect(range.end).toBe('2024-06-30');
    });

    it('getYearRange', () => {
        const range = getYearRange(2024);
        expect(range.start).toBe('2024-01-01');
        expect(range.end).toBe('2024-12-31');
    });
});

// ─── Intl Localization ────────────────────────────────────────

describe('getMonthNames', () => {
    it('returns 12 month names', () => {
        const names = getMonthNames('en');
        expect(names.length).toBe(12);
        expect(names[0]).toContain('January');
        expect(names[11]).toContain('December');
    });

    it('returns short names', () => {
        const names = getMonthNames('en', 'gregory', 'short');
        expect(names[0]).toContain('Jan');
    });

    it('returns localized names', () => {
        const names = getMonthNames('it', 'gregory', 'long');
        expect(names[0].toLowerCase()).toContain('gennaio');
    });
});

describe('getDayNames', () => {
    it('returns 7 day names', () => {
        const names = getDayNames('en', 'short', 0);
        expect(names.length).toBe(7);
    });

    it('starts with correct day', () => {
        const sunStart = getDayNames('en', 'short', 0);
        expect(sunStart[0]).toContain('Sun');

        const monStart = getDayNames('en', 'short', 1);
        expect(monStart[0]).toContain('Mon');
    });
});

describe('formatWithCalendar', () => {
    it('formats with Gregorian calendar', () => {
        const result = formatWithCalendar('2024-06-15', 'en', 'gregory');
        expect(result).toContain('2024');
        expect(result).toContain('15');
    });

    it('formats with different calendar system', () => {
        // Buddhist calendar: year offset +543
        const result = formatWithCalendar('2024-06-15', 'en', 'buddhist', { year: 'numeric' });
        expect(result).toContain('2567');
    });
});

describe('getDateFormatOrder', () => {
    it('returns array with day/month/year/literal', () => {
        const order = getDateFormatOrder('en-US');
        expect(order).toContain('day');
        expect(order).toContain('month');
        expect(order).toContain('year');
    });
});

describe('is12HourClock', () => {
    it('returns true for en-US', () => {
        expect(is12HourClock('en-US')).toBe(true);
    });

    it('returns false for de-DE', () => {
        expect(is12HourClock('de-DE')).toBe(false);
    });
});

// ─── Parse / Format Helpers ───────────────────────────────────

describe('parseISO / toISO', () => {
    it('round-trips', () => {
        expect(toISO(parseISO('2024-06-15'))).toBe('2024-06-15');
        expect(toISO(parseISO('0001-01-01'))).toBe('0001-01-01');
    });

    it('pads correctly', () => {
        expect(toISO({ year: 5, month: 1, day: 3 })).toBe('0005-01-03');
    });
});

describe('clampDate', () => {
    it('clamps below min', () => {
        expect(clampDate('2024-01-01', '2024-03-01')).toBe('2024-03-01');
    });

    it('clamps above max', () => {
        expect(clampDate('2024-12-31', undefined, '2024-06-30')).toBe('2024-06-30');
    });

    it('returns date when in range', () => {
        expect(clampDate('2024-06-15', '2024-01-01', '2024-12-31')).toBe('2024-06-15');
    });
});
