// pdx-relative-time — Displays relative time ("3 hours ago", "in 2 days")
// with auto-update. Uses Intl.RelativeTimeFormat for locale-aware output.

import { component, html, onDestroy } from '@pdxui/core';
import { resolveLocale } from '../shared/locale';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/relative-time';

/**
 * Each unit, its length, and how many of the unit below it round up into it. Not a hard floor —
 * `absDiff >= 1 day` — which reads the same distance differently each way: 24 h ahead, measured a
 * few milliseconds later, falls just short and says "in 24 hours", while 24 h ago says
 * "yesterday". Rounding thresholds, as moment.js and Day.js use, are symmetric: 45 s →
 * a minute, 45 min → an hour, 22 h → a day, 6.5 days → a week, 26 days → a month, 11 months → a year.
 */
const UNITS: [Intl.RelativeTimeFormatUnit, number, number][] = [
    ['second', 1000, 45],
    ['minute', 60_000, 45],
    ['hour', 3_600_000, 22],
    ['day', 86_400_000, 6.5],
    ['week', 604_800_000, 26 / 7],
    ['month', 2_592_000_000, 11],
    ['year', 31_536_000_000, Infinity],
];

function getRelativeTime(
    date: Date,
    locale: string,
    style: string,
    numeric: string,
): string {
    const diff = date.getTime() - Date.now();

    let unit: Intl.RelativeTimeFormatUnit = 'second';
    let value = Math.round(diff / 1000);
    for (const [name, ms, upTo] of UNITS) {
        unit = name;
        value = Math.round(diff / ms);
        if (Math.abs(diff / ms) < upTo) break;
    }

    const rtf = new Intl.RelativeTimeFormat(locale || undefined, {
        style: style as Intl.RelativeTimeFormatStyle,
        numeric: numeric as 'always' | 'auto',
    });
    return rtf.format(value, unit);
}

function formatAbsoluteDate(date: Date, locale: string): string {
    const dtf = new Intl.DateTimeFormat(locale || undefined, {
        dateStyle: 'full',
        timeStyle: 'medium',
    });
    return dtf.format(date);
}

/**
 * Shows a time relative to now ("3 hours ago", "in 2 days"), locale-aware and kept up to date.
 */
component('pdx-relative-time', {
    props: {
        datetime: { type: String, default: '' },
        /** Locale of the wording. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        style: { type: String, default: 'long' },
        numeric: { type: String, default: 'auto' },
        updateInterval: { type: Number, default: 60000 },
        showTooltip: { type: Boolean, default: true },
    },
    setup(ctx) {
        let built = false;
        let spanEl: HTMLElement | null = null;
        let timer: ReturnType<typeof setInterval> | null = null;

        function update(): void {
            if (!spanEl) return;
            const dtStr = ctx.datetime() as string;
            if (!dtStr) {
                spanEl.textContent = '';
                spanEl.removeAttribute('title');
                return;
            }
            const date = new Date(dtStr);
            if (isNaN(date.getTime())) {
                spanEl.textContent = dtStr;
                spanEl.removeAttribute('title');
                return;
            }
            // The prop, then the page's lang, then the browser.
            const locale = resolveLocale(ctx.el, ctx.locale() as string);
            const style = ctx.style() as string;
            const numeric = ctx.numeric() as string;

            spanEl.setAttribute('datetime', date.toISOString());
            spanEl.textContent = getRelativeTime(date, locale, style, numeric);

            if (ctx.showTooltip()) {
                spanEl.title = formatAbsoluteDate(date, locale);
            } else {
                spanEl.removeAttribute('title');
            }
        }

        function setupTimer(): void {
            clearTimer();
            const intervalMs = ctx.updateInterval() as number;
            if (intervalMs > 0) {
                timer = setInterval(() => update(), intervalMs);
            }
        }

        function clearTimer(): void {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        }

        ctx.track(() => {
            // Subscribe to all props
            void ctx.datetime();
            void ctx.locale();
            void ctx.style();
            void ctx.numeric();
            void ctx.updateInterval();
            void ctx.showTooltip();

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again, nor start a timer
                // its onDestroy already ran for.
                ctx.frame(() => {
                    // A <time> with a machine-readable datetime: the text is relative ("2 hours ago") but
                    // the absolute time stays exposed in machine form (semantic HTML <time>).
                    spanEl = document.createElement('time');
                    spanEl.className = 'pdx-rt-root';
                    ctx.el.appendChild(spanEl);
                    update();
                    setupTimer();
                });
                return;
            }
            requestAnimationFrame(() => {
                update();
                setupTimer();
            });
        });

        // core's onDestroy: `ctx.onDestroy` does not exist, and an optional call would hide that the
        // interval outlives the element.
        onDestroy(() => { clearTimer(); });

        return {};
    },
    render: () => html``,
});
