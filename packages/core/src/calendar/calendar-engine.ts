// CalendarEngine — Pure math utilities for date/calendar operations.
// Zero DOM dependencies, tree-shakeable. All internal math in Gregorian/JDN.
// Multi-calendar display via Intl.DateTimeFormat({ calendar }).

// ─── Types ────────────────────────────────────────────────────

export interface CalendarDate {
    year: number;
    month: number; // 1-12
    day: number;   // 1-31
}

export interface CalendarCell {
    /** ISO date string YYYY-MM-DD */
    iso: string;
    year: number;
    month: number;
    day: number;
    /** Day is outside the displayed month */
    outside: boolean;
    /** Day is today */
    today: boolean;
    /** ISO week number (1-53) */
    weekNumber?: number;
}

export interface CalendarGrid {
    year: number;
    month: number;
    /** 6 rows × 7 columns */
    weeks: CalendarCell[][];
    /** Day name headers (length 7) */
    dayNames: string[];
    /** Week numbers for each row (if requested) */
    weekNumbers?: number[];
}

export interface MonthGridOptions {
    /** First day of week: 0=Sun, 1=Mon ... 6=Sat. Auto-detected from locale if omitted. */
    firstDay?: number;
    /** Always render 6 rows (42 cells). Default: true */
    fixedWeeks?: boolean;
    /** Include ISO week numbers. Default: false */
    weekNumbers?: boolean;
    /** Locale for day name headers. Default: 'en' */
    locale?: string;
    /** Day name format. Default: 'short' */
    dayNameFormat?: 'narrow' | 'short' | 'long';
}

export interface DateRange {
    start: string; // ISO
    end: string;   // ISO
}

export type CalendarSystem =
    | 'gregory' | 'buddhist' | 'chinese' | 'coptic' | 'ethiopic'
    | 'hebrew' | 'indian' | 'islamic-civil' | 'islamic-tbla'
    | 'islamic-umalqura' | 'japanese' | 'persian' | 'roc';

// ─── Julian Day Number ────────────────────────────────────────

/** Convert Gregorian date to Julian Day Number. */
export function gregorianToJD(y: number, m: number, d: number): number {
    // Algorithm from Meeus, Astronomical Algorithms (1991)
    const a = Math.floor((14 - m) / 12);
    const y1 = y + 4800 - a;
    const m1 = m + 12 * a - 3;
    return d + Math.floor((153 * m1 + 2) / 5) + 365 * y1
        + Math.floor(y1 / 4) - Math.floor(y1 / 100) + Math.floor(y1 / 400) - 32045;
}

/** Convert Julian Day Number to Gregorian date. */
export function jdToGregorian(jd: number): CalendarDate {
    const a = jd + 32044;
    const b = Math.floor((4 * a + 3) / 146097);
    const c = a - Math.floor(146097 * b / 4);
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor(1461 * d / 4);
    const m = Math.floor((5 * e + 2) / 153);
    return {
        day: e - Math.floor((153 * m + 2) / 5) + 1,
        month: m + 3 - 12 * Math.floor(m / 10),
        year: 100 * b + d - 4800 + Math.floor(m / 10),
    };
}

// ─── Date Arithmetic ──────────────────────────────────────────

/**
 * How many days a month has, leap years included. `month` is 1-12, not 0-11.
 *
 * Used to clamp a day-of-month when arithmetic lands it past the end: adding a month to 31 January
 * gives 28 or 29 February, never 3 March.
 */
export function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

/**
 * Shift an ISO date (`YYYY-MM-DD`) by whole days. Negative goes backwards.
 *
 * Goes through the Julian day number rather than `Date`, so it has no time component, no timezone
 * and no DST: adding 1 to a date the day before a clock change still gives the next calendar day.
 */
export function addDays(iso: string, days: number): string {
    const d = parseISO(iso);
    const jd = gregorianToJD(d.year, d.month, d.day) + days;
    return toISO(jdToGregorian(jd));
}

/**
 * Shift an ISO date by whole months, clamping the day to the target month's length.
 *
 * 2026-01-31 plus one month is 2026-02-28, not 2026-03-03. That clamping is the reason this exists
 * rather than adding 30 days: month arithmetic is what a date picker's next/previous does, and users
 * expect the day of the month to stay put where it can.
 */
export function addMonths(iso: string, months: number): string {
    const d = parseISO(iso);
    let m = d.month + months;
    let y = d.year;
    y += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    const maxDay = getDaysInMonth(y, m);
    return toISO({ year: y, month: m, day: Math.min(d.day, maxDay) });
}

/**
 * Shift an ISO date by whole years, clamping the day the same way {@link addMonths} does.
 *
 * 2024-02-29 plus one year is 2025-02-28: the only date where this is visible, and the only reason
 * this is not `addMonths(iso, years * 12)`.
 */
export function addYears(iso: string, years: number): string {
    const d = parseISO(iso);
    const y = d.year + years;
    const maxDay = getDaysInMonth(y, d.month);
    return toISO({ year: y, month: d.month, day: Math.min(d.day, maxDay) });
}

// ─── Comparison ───────────────────────────────────────────────

/**
 * Order two ISO dates: negative if `a` is earlier, 0 if equal, positive if later — the shape
 * `Array.prototype.sort` wants.
 *
 * A plain string comparison, which is correct because `YYYY-MM-DD` is fixed-width and zero-padded:
 * lexicographic order IS chronological order. Reach for this rather than `new Date(a) - new Date(b)`,
 * which parses, allocates and drags a timezone in.
 */
export function compareDates(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Whether two ISO dates are the same day. String equality, for the reason above.
 *
 * It exists so calling code reads as intent rather than as a string comparison that happens to work.
 */
export function isSameDay(a: string, b: string): boolean {
    return a === b;
}

/**
 * Whether two ISO dates fall in the same month of the same year.
 *
 * What a calendar grid asks to decide whether a cell belongs to the month on display or is one of
 * the leading/trailing days from its neighbours.
 */
export function isSameMonth(a: string, b: string): boolean {
    return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * Whether an ISO date falls within `[start, end]`, both ends INCLUSIVE.
 *
 * Inclusive because that is what a date-range picker means by "from the 1st to the 5th"; a caller
 * wanting a half-open interval should pass the day before.
 */
export function isInRange(iso: string, start: string, end: string): boolean {
    return iso >= start && iso <= end;
}

/**
 * Whether an ISO date is a Saturday or Sunday.
 *
 * Saturday/Sunday specifically, not "the locale's non-working days" — those differ by country and
 * this does not know the locale. A scheduler with its own working week should not use this.
 */
export function isWeekend(iso: string): boolean {
    const d = parseISO(iso);
    const jd = gregorianToJD(d.year, d.month, d.day);
    const dow = (jd + 1) % 7; // 0=Sun, 1=Mon ... 6=Sat
    return dow === 0 || dow === 6;
}

// ─── Today ────────────────────────────────────────────────────

/**
 * Today, as `YYYY-MM-DD`, in the machine's LOCAL timezone.
 *
 * Local rather than UTC on purpose: "today" in a date picker is the user's today. That also makes it
 * the one function here that is not pure, so a test that needs a fixed date should pass one in
 * rather than call this.
 */
export function today(): string {
    const d = new Date();
    return toISO({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
}

// ─── ISO Week Number (ISO 8601) ──────────────────────────────

/**
 * The ISO 8601 week number (1-53) for a date.
 *
 * ISO weeks start on Monday and week 1 is the one containing the first Thursday of the year, so the
 * first days of January can belong to week 52 or 53 of the PREVIOUS year. That rule is why this is
 * not `Math.ceil(dayOfYear / 7)`.
 */
export function isoWeekNumber(year: number, month: number, day: number): number {
    const jd = gregorianToJD(year, month, day);
    const dow = (jd + 1) % 7; // 0=Sun...6=Sat
    // ISO day of week: Mon=1...Sun=7
    const isoDow = dow === 0 ? 7 : dow;
    // Thursday of the same ISO week
    const thuJd = jd + (4 - isoDow);
    const thuDate = jdToGregorian(thuJd);
    // Jan 4 is always in week 1
    const jan4Jd = gregorianToJD(thuDate.year, 1, 4);
    const jan4Dow = (jan4Jd + 1) % 7;
    const jan4IsoDow = jan4Dow === 0 ? 7 : jan4Dow;
    const week1MonJd = jan4Jd - jan4IsoDow + 1;
    return Math.floor((thuJd - week1MonJd) / 7) + 1;
}

// ─── Day of Week ──────────────────────────────────────────────

/** 0=Sun, 1=Mon ... 6=Sat */
export function dayOfWeek(year: number, month: number, day: number): number {
    const jd = gregorianToJD(year, month, day);
    return (jd + 1) % 7;
}

// ─── First Day of Week (locale-aware) ─────────────────────────

// Fallback map for locales where Intl.Locale.getWeekInfo() is unavailable
const FIRST_DAY_MAP: Record<string, number> = {
    // Monday-start (most of Europe, Asia, South America)
    'de': 1, 'fr': 1, 'es': 1, 'it': 1, 'pt': 1, 'nl': 1, 'ru': 1, 'pl': 1,
    'uk': 1, 'cs': 1, 'sk': 1, 'hu': 1, 'ro': 1, 'bg': 1, 'hr': 1, 'sl': 1,
    'sr': 1, 'da': 1, 'fi': 1, 'sv': 1, 'nb': 1, 'nn': 1, 'et': 1, 'lv': 1,
    'lt': 1, 'el': 1, 'tr': 1, 'vi': 1, 'zh': 1, 'ja': 1, 'ko': 1, 'th': 1,
    'id': 1, 'ms': 1, 'hi': 1, 'bn': 1, 'ta': 1,
    // Saturday-start (Middle East / North Africa)
    'ar': 6, 'fa': 6, 'ps': 6, 'ur': 6,
    // Sunday-start (US, Canada, Israel, etc.) — default
    'en': 0, 'he': 0,
};

/** Get the first day of week for a locale. 0=Sun, 1=Mon ... 6=Sat. */
export function getFirstDayOfWeek(locale: string): number {
    try {
        const loc = new Intl.Locale(locale);
        // Modern browsers: getWeekInfo() or weekInfo
        const locWithWeek = loc as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
        const info = locWithWeek.getWeekInfo?.() ?? locWithWeek.weekInfo;
        if (info?.firstDay != null) {
            // Intl returns 1=Mon...7=Sun, convert to 0=Sun...6=Sat
            return info.firstDay === 7 ? 0 : info.firstDay;
        }
    } catch { /* fallback below */ }
    const lang = locale.split('-')[0].toLowerCase();
    return FIRST_DAY_MAP[lang] ?? 0;
}

// ─── Month Grid Generation ───────────────────────────────────

/**
 * Build the grid a month view renders: the weeks of one month, padded with the neighbouring days
 * that fill the first and last rows.
 *
 * This is the calendar's whole layout decision in one pure function — which day the week starts on,
 * which cells are outside the month, which are disabled or selected — so a component can render it
 * without doing date arithmetic of its own.
 */
export function generateMonthGrid(year: number, month: number, options: MonthGridOptions = {}): CalendarGrid {
    const {
        firstDay = getFirstDayOfWeek(options.locale ?? 'en'),
        fixedWeeks = true,
        weekNumbers = false,
        locale = 'en',
        dayNameFormat = 'short',
    } = options;

    const daysInMonth = getDaysInMonth(year, month);
    const firstDow = dayOfWeek(year, month, 1);
    const todayStr = today();

    // Calculate offset: how many days from previous month to show
    const offset = (firstDow - firstDay + 7) % 7;

    // Build all cells
    const cells: CalendarCell[] = [];
    const startJd = gregorianToJD(year, month, 1) - offset;
    const totalCells = fixedWeeks ? 42 : Math.ceil((offset + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
        const g = jdToGregorian(startJd + i);
        const iso = toISO(g);
        cells.push({
            iso,
            year: g.year,
            month: g.month,
            day: g.day,
            outside: g.month !== month || g.year !== year,
            today: iso === todayStr,
            weekNumber: weekNumbers ? isoWeekNumber(g.year, g.month, g.day) : undefined,
        });
    }

    // Split into weeks (rows of 7)
    const weeks: CalendarCell[][] = [];
    const wkNums: number[] = [];
    for (let i = 0; i < cells.length; i += 7) {
        const row = cells.slice(i, i + 7);
        weeks.push(row);
        if (weekNumbers && row[0].weekNumber != null) {
            wkNums.push(row[0].weekNumber);
        }
    }

    return {
        year,
        month,
        weeks,
        dayNames: getDayNames(locale, dayNameFormat, firstDay),
        weekNumbers: weekNumbers ? wkNums : undefined,
    };
}

// ─── Fiscal Year / Quarter ────────────────────────────────────

/** Get fiscal year for a given date. fiscalStartMonth: 1-12 (e.g. 4 for April). */
export function getFiscalYear(year: number, month: number, fiscalStartMonth: number): number {
    return month >= fiscalStartMonth ? year : year - 1;
}

/** Get fiscal quarter (1-4). fiscalStartMonth: 1-12. */
export function getFiscalQuarter(month: number, fiscalStartMonth: number): number {
    const adjusted = ((month - fiscalStartMonth) % 12 + 12) % 12;
    return Math.floor(adjusted / 3) + 1;
}

// ─── Range Helpers ────────────────────────────────────────────

/**
 * The `[start, end]` ISO dates of the week containing a date. `firstDay` is 0=Sunday, 1=Monday
 * (the default, matching ISO 8601).
 *
 * One of the range helpers a "this week / this month / this quarter" filter is built from.
 */
export function getWeekRange(iso: string, firstDay: number = 1): DateRange {
    const d = parseISO(iso);
    const dow = dayOfWeek(d.year, d.month, d.day);
    const offset = ((dow - firstDay) % 7 + 7) % 7;
    const start = addDays(iso, -offset);
    const end = addDays(start, 6);
    return { start, end };
}

/** The `[first, last]` ISO dates of a month. `month` is 1-12. */
export function getMonthRange(year: number, month: number): DateRange {
    const days = getDaysInMonth(year, month);
    return {
        start: toISO({ year, month, day: 1 }),
        end: toISO({ year, month, day: days }),
    };
}

/**
 * The `[first, last]` ISO dates of a quarter (1-4), optionally on a FISCAL year that starts in
 * `fiscalStartMonth` (1-12, default January = the calendar year).
 *
 * The fiscal offset is why this takes a start month: reporting periods rarely begin in January, and
 * a quarter filter that assumes they do is wrong for most of the year.
 */
export function getQuarterRange(year: number, quarter: number, fiscalStartMonth: number = 1): DateRange {
    const startMonth = ((quarter - 1) * 3 + fiscalStartMonth - 1) % 12 + 1;
    const startYear = startMonth < fiscalStartMonth ? year + 1 : year;
    const endDate = addMonths(toISO({ year: startYear, month: startMonth, day: 1 }), 3);
    const endParsed = parseISO(addDays(endDate, -1));
    return {
        start: toISO({ year: startYear, month: startMonth, day: 1 }),
        end: toISO(endParsed),
    };
}

/** The `[first, last]` ISO dates of a calendar year. */
export function getYearRange(year: number): DateRange {
    return {
        start: toISO({ year, month: 1, day: 1 }),
        end: toISO({ year, month: 12, day: 31 }),
    };
}

// ─── Intl-based Localization ──────────────────────────────────

/** Get localized month names. */
export function getMonthNames(
    locale: string = 'en',
    calendar: CalendarSystem = 'gregory',
    format: 'long' | 'short' | 'narrow' = 'long',
): string[] {
    const fmt = new Intl.DateTimeFormat(locale, { month: format, calendar });
    const names: string[] = [];
    for (let m = 0; m < 12; m++) {
        names.push(fmt.format(new Date(2024, m, 15)));
    }
    return names;
}

/** Get localized day-of-week names starting from firstDay. */
export function getDayNames(
    locale: string = 'en',
    format: 'narrow' | 'short' | 'long' = 'short',
    firstDay: number = 0,
): string[] {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: format });
    const names: string[] = [];
    // Jan 7, 2024 is a Sunday (dow=0)
    for (let i = 0; i < 7; i++) {
        const d = new Date(2024, 0, 7 + ((firstDay + i) % 7));
        names.push(fmt.format(d));
    }
    return names;
}

/** Format a date using a specific calendar system. */
export function formatWithCalendar(
    iso: string,
    locale: string = 'en',
    calendar: CalendarSystem = 'gregory',
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
    const d = parseISO(iso);
    const date = new Date(d.year, d.month - 1, d.day);
    // dateStyle with non-Gregorian calendars + certain locales produces garbled output
    // in some browsers (e.g. Hebrew + he locale). Use explicit parts instead.
    let opts = { ...options, calendar };
    if (calendar !== 'gregory' && opts.dateStyle) {
        delete opts.dateStyle;
        delete opts.timeStyle;
        opts = { year: 'numeric', month: 'long', day: 'numeric', calendar };
    }
    const fmt = new Intl.DateTimeFormat(locale, opts);
    return fmt.format(date);
}

/** Get the date format order for a locale (e.g. ['day', 'month', 'year']). */
export function getDateFormatOrder(locale: string = 'en'): Array<'day' | 'month' | 'year' | 'literal'> {
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' });
    return fmt.formatToParts(new Date(2024, 5, 15)).map(p => {
        if (p.type === 'day') return 'day';
        if (p.type === 'month') return 'month';
        if (p.type === 'year') return 'year';
        return 'literal';
    });
}

/** Detect if a locale uses 12-hour clock. */
export function is12HourClock(locale: string): boolean {
    try {
        const resolved = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
        return resolved.hour12 === true;
    } catch {
        return false;
    }
}

// ─── Parse / Format Helpers ───────────────────────────────────

/** Parse ISO date string (YYYY-MM-DD) to CalendarDate. */
export function parseISO(iso: string): CalendarDate {
    const [y, m, d] = iso.split('-').map(Number);
    return { year: y, month: m, day: d };
}

/** Convert CalendarDate to ISO string (YYYY-MM-DD). */
export function toISO(d: CalendarDate): string {
    return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** Clamp a date string within min/max bounds. */
/**
 * Pull an ISO date inside `[min, max]`, returning the nearest bound when it falls outside. Either
 * bound may be omitted.
 *
 * What a date input does with typed input before accepting it, so the value it emits is always
 * inside the range the component advertises.
 */
export function clampDate(iso: string, min?: string, max?: string): string {
    if (min && iso < min) return min;
    if (max && iso > max) return max;
    return iso;
}
