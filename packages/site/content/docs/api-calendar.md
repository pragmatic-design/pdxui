---
title: Calendar API
description: "Date arithmetic, month grids, week, quarter and fiscal ranges, ISO dates: the engine behind the date components."
order: 24
parent: api
---

# Calendar API

Date arithmetic, month grids, week, quarter and fiscal ranges, ISO dates: the engine behind the date components. 30 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `addDays`

```ts
import { addDays } from '@pdxui/core';

function addDays(iso: string, days: number): string
```

Shift an ISO date (`YYYY-MM-DD`) by whole days. Negative goes backwards.

Goes through the Julian day number rather than `Date`, so it has no time component, no timezone
and no DST: adding 1 to a date the day before a clock change still gives the next calendar day.

## `addMonths`

```ts
import { addMonths } from '@pdxui/core';

function addMonths(iso: string, months: number): string
```

Shift an ISO date by whole months, clamping the day to the target month's length.

2026-01-31 plus one month is 2026-02-28, not 2026-03-03. That clamping is the reason this exists
rather than adding 30 days: month arithmetic is what a date picker's next/previous does, and users
expect the day of the month to stay put where it can.

## `addYears`

```ts
import { addYears } from '@pdxui/core';

function addYears(iso: string, years: number): string
```

Shift an ISO date by whole years, clamping the day the same way {@link addMonths} does.

2024-02-29 plus one year is 2025-02-28: the only date where this is visible, and the only reason
this is not `addMonths(iso, years * 12)`.

## `clampDate`

```ts
import { clampDate } from '@pdxui/core';

function clampDate(iso: string, min?: string, max?: string): string
```

Pull an ISO date inside `[min, max]`, returning the nearest bound when it falls outside. Either
bound may be omitted.

What a date input does with typed input before accepting it, so the value it emits is always
inside the range the component advertises.

## `compareDates`

```ts
import { compareDates } from '@pdxui/core';

function compareDates(a: string, b: string): number
```

Order two ISO dates: negative if `a` is earlier, 0 if equal, positive if later — the shape
`Array.prototype.sort` wants.

A plain string comparison, which is correct because `YYYY-MM-DD` is fixed-width and zero-padded:
lexicographic order IS chronological order. Reach for this rather than `new Date(a) - new Date(b)`,
which parses, allocates and drags a timezone in.

## `dayOfWeek`

```ts
import { dayOfWeek } from '@pdxui/core';

function dayOfWeek(year: number, month: number, day: number): number
```

0=Sun, 1=Mon ... 6=Sat

## `formatWithCalendar`

```ts
import { formatWithCalendar } from '@pdxui/core';

function formatWithCalendar(iso: string, locale: string = 'en', calendar: CalendarSystem = 'gregory', options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string
```

Format a date using a specific calendar system.

## `generateMonthGrid`

```ts
import { generateMonthGrid } from '@pdxui/core';

function generateMonthGrid(year: number, month: number, options: MonthGridOptions = {}): CalendarGrid
```

Build the grid a month view renders: the weeks of one month, padded with the neighbouring days
that fill the first and last rows.

This is the calendar's whole layout decision in one pure function — which day the week starts on,
which cells are outside the month, which are disabled or selected — so a component can render it
without doing date arithmetic of its own.

## `getDateFormatOrder`

```ts
import { getDateFormatOrder } from '@pdxui/core';

function getDateFormatOrder(locale: string = 'en'): Array<'day' | 'month' | 'year' | 'literal'>
```

Get the date format order for a locale (e.g. ['day', 'month', 'year']).

## `getDayNames`

```ts
import { getDayNames } from '@pdxui/core';

function getDayNames(locale: string = 'en', format: 'narrow' | 'short' | 'long' = 'short', firstDay: number = 0): string[]
```

Get localized day-of-week names starting from firstDay.

## `getDaysInMonth`

```ts
import { getDaysInMonth } from '@pdxui/core';

function getDaysInMonth(year: number, month: number): number
```

How many days a month has, leap years included. `month` is 1-12, not 0-11.

Used to clamp a day-of-month when arithmetic lands it past the end: adding a month to 31 January
gives 28 or 29 February, never 3 March.

## `getFirstDayOfWeek`

```ts
import { getFirstDayOfWeek } from '@pdxui/core';

function getFirstDayOfWeek(locale: string): number
```

Get the first day of week for a locale. 0=Sun, 1=Mon ... 6=Sat.

## `getFiscalQuarter`

```ts
import { getFiscalQuarter } from '@pdxui/core';

function getFiscalQuarter(month: number, fiscalStartMonth: number): number
```

Get fiscal quarter (1-4). fiscalStartMonth: 1-12.

## `getFiscalYear`

```ts
import { getFiscalYear } from '@pdxui/core';

function getFiscalYear(year: number, month: number, fiscalStartMonth: number): number
```

Get fiscal year for a given date. fiscalStartMonth: 1-12 (e.g. 4 for April).

## `getMonthNames`

```ts
import { getMonthNames } from '@pdxui/core';

function getMonthNames(locale: string = 'en', calendar: CalendarSystem = 'gregory', format: 'long' | 'short' | 'narrow' = 'long'): string[]
```

Get localized month names.

## `getMonthRange`

```ts
import { getMonthRange } from '@pdxui/core';

function getMonthRange(year: number, month: number): DateRange
```

The `[first, last]` ISO dates of a month. `month` is 1-12.

## `getQuarterRange`

```ts
import { getQuarterRange } from '@pdxui/core';

function getQuarterRange(year: number, quarter: number, fiscalStartMonth: number = 1): DateRange
```

The `[first, last]` ISO dates of a quarter (1-4), optionally on a FISCAL year that starts in
`fiscalStartMonth` (1-12, default January = the calendar year).

The fiscal offset is why this takes a start month: reporting periods rarely begin in January, and
a quarter filter that assumes they do is wrong for most of the year.

## `getWeekRange`

```ts
import { getWeekRange } from '@pdxui/core';

function getWeekRange(iso: string, firstDay: number = 1): DateRange
```

The `[start, end]` ISO dates of the week containing a date. `firstDay` is 0=Sunday, 1=Monday
(the default, matching ISO 8601).

One of the range helpers a "this week / this month / this quarter" filter is built from.

## `getYearRange`

```ts
import { getYearRange } from '@pdxui/core';

function getYearRange(year: number): DateRange
```

The `[first, last]` ISO dates of a calendar year.

## `gregorianToJD`

```ts
import { gregorianToJD } from '@pdxui/core';

function gregorianToJD(y: number, m: number, d: number): number
```

Convert Gregorian date to Julian Day Number.

## `is12HourClock`

```ts
import { is12HourClock } from '@pdxui/core';

function is12HourClock(locale: string): boolean
```

Detect if a locale uses 12-hour clock.

## `isInRange`

```ts
import { isInRange } from '@pdxui/core';

function isInRange(iso: string, start: string, end: string): boolean
```

Whether an ISO date falls within `[start, end]`, both ends INCLUSIVE.

Inclusive because that is what a date-range picker means by "from the 1st to the 5th"; a caller
wanting a half-open interval should pass the day before.

## `isoWeekNumber`

```ts
import { isoWeekNumber } from '@pdxui/core';

function isoWeekNumber(year: number, month: number, day: number): number
```

The ISO 8601 week number (1-53) for a date.

ISO weeks start on Monday and week 1 is the one containing the first Thursday of the year, so the
first days of January can belong to week 52 or 53 of the PREVIOUS year. That rule is why this is
not `Math.ceil(dayOfYear / 7)`.

## `isSameDay`

```ts
import { isSameDay } from '@pdxui/core';

function isSameDay(a: string, b: string): boolean
```

Whether two ISO dates are the same day. String equality, for the reason above.

It exists so calling code reads as intent rather than as a string comparison that happens to work.

## `isSameMonth`

```ts
import { isSameMonth } from '@pdxui/core';

function isSameMonth(a: string, b: string): boolean
```

Whether two ISO dates fall in the same month of the same year.

What a calendar grid asks to decide whether a cell belongs to the month on display or is one of
the leading/trailing days from its neighbours.

## `isWeekend`

```ts
import { isWeekend } from '@pdxui/core';

function isWeekend(iso: string): boolean
```

Whether an ISO date is a Saturday or Sunday.

Saturday/Sunday specifically, not "the locale's non-working days" — those differ by country and
this does not know the locale. A scheduler with its own working week should not use this.

## `jdToGregorian`

```ts
import { jdToGregorian } from '@pdxui/core';

function jdToGregorian(jd: number): CalendarDate
```

Convert Julian Day Number to Gregorian date.

## `parseISO`

```ts
import { parseISO } from '@pdxui/core';

function parseISO(iso: string): CalendarDate
```

Parse ISO date string (YYYY-MM-DD) to CalendarDate.

## `today`

```ts
import { today } from '@pdxui/core';

function today(): string
```

Today, as `YYYY-MM-DD`, in the machine's LOCAL timezone.

Local rather than UTC on purpose: "today" in a date picker is the user's today. That also makes it
the one function here that is not pure, so a test that needs a fixed date should pass one in
rather than call this.

## `toISO`

```ts
import { toISO } from '@pdxui/core';

function toISO(d: CalendarDate): string
```

Convert CalendarDate to ISO string (YYYY-MM-DD).
