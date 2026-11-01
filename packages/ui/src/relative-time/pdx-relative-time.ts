// pdx-relative-time — Displays relative time ("3 hours ago", "in 2 days")
// with auto-update. Uses Intl.RelativeTimeFormat for locale-aware output.

import { component, html, signal } from '@pdxui/core';
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
 *
 * @csspart root - The `<time>`, with the machine-readable `datetime` and the full date as its title.
 */
component('pdx-relative-time', {
    parts: ['root'],
    props: {
        datetime: { type: String, default: '' },
        /** Locale of the wording. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        // Not `style`, which would replace the element's own CSSStyleDeclaration (#545).
        formatStyle: { type: String, default: 'long' },
        numeric: { type: String, default: 'auto' },
        updateInterval: { type: Number, default: 60000 },
        showTooltip: { type: Boolean, default: true },
    },
    setup(ctx) {
        let built = false;
        let spanEl: HTMLElement | null = null;
        /** The update's beat: one tick per interval. */
        const tick = signal(0);

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
            const style = ctx.formatStyle() as string;
            const numeric = ctx.numeric() as string;

            spanEl.setAttribute('datetime', date.toISOString());
            spanEl.textContent = getRelativeTime(date, locale, style, numeric);

            if (ctx.showTooltip()) {
                spanEl.title = formatAbsoluteDate(date, locale);
            } else {
                spanEl.removeAttribute('title');
            }
        }

        // The update is an effect of this component (#291; lifecycle.md: no work while frozen). Each run
        // writes the text and waits one interval, then ticks; the tick runs it again. On a frozen page the
        // scope parks the effect (#269): the tick due then writes nothing and starts no wait, and the page
        // coming back runs the effect once — the text brought up to date, then the beat again. No interval
        // of its own to pause, so none to forget; the effect's cleanup clears the wait on destroy too.
        ctx.track(() => {
            // Subscribe to all props, and to the beat
            void tick();
            void ctx.datetime();
            void ctx.locale();
            void ctx.formatStyle();
            void ctx.numeric();
            void ctx.showTooltip();
            const intervalMs = ctx.updateInterval() as number;

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    // A <time> with a machine-readable datetime: the text is relative ("2 hours ago") but
                    // the absolute time stays exposed in machine form (semantic HTML <time>).
                    spanEl = document.createElement('time');
                    spanEl.className = 'pdx-rt-root';
                    spanEl.setAttribute('data-part', 'root');
                    ctx.el.appendChild(spanEl);
                    update();
                });
            } else {
                update();
            }
            if (!(intervalMs > 0)) return;
            const id = setTimeout(() => tick.set((n) => n + 1), intervalMs);
            return () => clearTimeout(id);
        });

        return {};
    },
    render: () => html``,
});
