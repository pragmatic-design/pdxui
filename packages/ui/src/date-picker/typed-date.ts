// A date typed into pdx-date-picker's editable trigger: read in the locale's numeric
// pattern — its day/month/year order and separators, taken from Intl — or as ISO `YYYY-MM-DD`, and
// written back in the same pattern, so what the input shows is what it accepts.

import { getDaysInMonth } from '@pdxui/core';

/** Latin digits, two-digit day and month, four-digit year: the one form both sides use. */
function numericFormat(locale: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(locale || undefined, { year: 'numeric', month: '2-digit', day: '2-digit', numberingSystem: 'latn' });
}

/** Bidi marks some locales put around their separators (ar, he): invisible, and never typed. */
const BIDI = /[‎‏؜]/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The locale's numeric date as a regex: groups in the locale's order, named day, month and year. */
function localePattern(locale: string): RegExp {
    const parts = numericFormat(locale).formatToParts(new Date(2024, 11, 31));
    let src = '';
    for (const p of parts) {
        if (p.type === 'day') src += '(?<day>\\d{1,2})';
        else if (p.type === 'month') src += '(?<month>\\d{1,2})';
        else if (p.type === 'year') src += '(?<year>\\d{4})';
        else if (p.type === 'literal') {
            const lit = p.value.replace(BIDI, '').trim();
            src += lit ? `\\s*${escape(lit)}\\s*` : '\\s+';
        }
    }
    return new RegExp(`^${src}$`);
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * The ISO date `text` names, or null: the locale's numeric pattern, or ISO. The date must exist —
 * month 1-12, a day that month has.
 */
export function parseTypedDate(text: string, locale: string): string | null {
    const t = text.replace(BIDI, '').trim();
    if (!t) return null;
    let y: number, m: number, d: number;
    const iso = ISO.exec(t);
    if (iso) {
        [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    } else {
        const g = localePattern(locale).exec(t)?.groups;
        if (!g) return null;
        [y, m, d] = [Number(g.year), Number(g.month), Number(g.day)];
    }
    if (m < 1 || m > 12 || d < 1 || d > getDaysInMonth(y, m)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A time of day on the 24-hour clock. */
export interface TypedTime { hours: number; minutes: number; seconds: number }

// Match: a time at the end of the text, after a space (optionally a comma before it) or ISO's `T`:
// `14:30`, `14:30:15`, `2:30 PM`, `2:30 p.m.`. Groups: [1]=hours [2]=minutes [3]=seconds [4]=a|p
const TIME_TAIL = /(?:,?\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?$/;

/**
 * A datetime picker's text: the date, as `parseTypedDate` reads it, and the time after it if there
 * is one — 24-hour, or 12-hour with AM/PM, the forms `pdx-time-picker` shows. Null when
 * the date is not a date, or the time is not a time: a time is never dropped for being unreadable.
 */
export function parseTypedDateTime(text: string, locale: string): { date: string; time: TypedTime | null } | null {
    const t = text.replace(BIDI, '').trim();
    const tail = TIME_TAIL.exec(t);
    const date = parseTypedDate(tail ? t.slice(0, tail.index) : t, locale);
    if (!date) return null;
    if (!tail) return { date, time: null };
    let hours = Number(tail[1]);
    const minutes = Number(tail[2]);
    const seconds = tail[3] === undefined ? 0 : Number(tail[3]);
    if (minutes > 59 || seconds > 59) return null;
    if (tail[4]) {
        if (hours < 1 || hours > 12) return null;
        const pm = tail[4].toLowerCase() === 'p';
        hours = hours === 12 ? (pm ? 12 : 0) : (pm ? hours + 12 : hours);
    } else if (hours > 23) {
        return null;
    }
    return { date, time: { hours, minutes, seconds } };
}

/** `iso` in the locale's numeric pattern: what the editable input shows, and reads back. */
export function formatTypedDate(iso: string, locale: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return '';
    return numericFormat(locale).format(new Date(y, m - 1, d)).replace(BIDI, '');
}

/** Whether `iso` can be picked: within min/max (ISO, inclusive), and not a disabled date. */
export function dateAllowed(iso: string, rules: { min?: string; max?: string; disabledDates?: ((iso: string) => boolean) | null }): boolean {
    if (rules.min && iso < rules.min) return false;
    if (rules.max && iso > rules.max) return false;
    return !(rules.disabledDates && rules.disabledDates(iso));
}
