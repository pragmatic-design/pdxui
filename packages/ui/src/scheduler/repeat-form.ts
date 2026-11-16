// pdx-scheduler's repetition editor (#1020, part 9b), without the DOM: a rule read into the fields the
// built-in editor shows, and written back from them. The fields say how often (never, every day, week,
// month or year), every how many, on which weekdays for a weekly rule, and until when (never, after a
// number of times, on a date). That is what the editor writes; a rule it reads that says more — an
// ordinal, month days, months, weekdays on another frequency, an UNTIL with a time, another week start —
// is «custom», shown as such and written back exactly as it was. Never a string typed by hand.

import { parseRRule } from './recurrence';

export interface RepeatForm {
    freq: 'none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'custom';
    /** Every how many days, weeks, months or years. */
    interval: number;
    /** A weekly rule's weekdays, `MO,WE`: the toggle group's own value. */
    days: string;
    ends: 'never' | 'count' | 'until';
    count: number;
    /** The last day, `YYYY-MM-DD`, inclusive. */
    until: string;
    /** The rule as it was read: a custom one is written back as this. */
    raw: string;
}

const BLANK: RepeatForm = { freq: 'none', interval: 1, days: '', ends: 'never', count: 1, until: '', raw: '' };
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** The fields of rule `rrule`; no rule repeats never. */
export function repeatOf(rrule: string | undefined): RepeatForm {
    if (!rrule) return { ...BLANK };
    const { rule, unsupported } = parseRRule(rrule);
    const custom = { ...BLANK, freq: 'custom' as const, raw: rrule };
    if (!rule || unsupported.length) return custom;
    const ordinal = rule.byDay.some((d) => d.n !== null);
    const sayable = rule.byMonthDay.length === 0 && rule.byMonth.length === 0 && !ordinal && rule.wkst === 1
        && (rule.freq === 'WEEKLY' || rule.byDay.length === 0)
        && (rule.until === null || !rule.until.includes('T'));
    if (!sayable) return custom;
    const until = rule.until ? `${rule.until.slice(0, 4)}-${rule.until.slice(4, 6)}-${rule.until.slice(6, 8)}` : '';
    return {
        freq: rule.freq,
        interval: rule.interval,
        days: rule.byDay.map((d) => WEEKDAYS[d.day]).join(','),
        ends: rule.count !== null ? 'count' : rule.until ? 'until' : 'never',
        count: rule.count ?? 1,
        until,
        raw: rrule,
    };
}

/** The rule the fields make; undefined for one that repeats never. */
export function ruleOf(f: RepeatForm): string | undefined {
    if (f.freq === 'none') return undefined;
    if (f.freq === 'custom') return f.raw;
    const parts = [`FREQ=${f.freq}`];
    if (f.interval > 1) parts.push(`INTERVAL=${Math.floor(f.interval)}`);
    if (f.freq === 'WEEKLY' && f.days) parts.push(`BYDAY=${f.days}`);
    if (f.ends === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(f.count))}`);
    else if (f.ends === 'until' && f.until) parts.push(`UNTIL=${f.until.replace(/-/g, '')}`);
    return parts.join(';');
}
