// pdx-statistic — Display numeric KPI values with labels, trends, icons.
// Useful for dashboard cards, analytics summaries, stat panels.

import { component, html } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/statistic';
/** `pdx-icon` the first time the statistic has an icon or a trend to draw: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

/**
 * Displays a numeric KPI value with its label, trend and icon, for dashboard cards and stat panels.
 */
component('pdx-statistic', {
    props: {
        /** Label text above the value */
        title: { type: String, default: '' },
        /** Main display value */
        value: { type: String, default: '0' },
        /** Text/symbol before value (e.g. '$') */
        prefix: { type: String, default: '' },
        /** Text/symbol after value (e.g. '%') */
        suffix: { type: String, default: '' },
        /** Icon name (left of title) */
        icon: { type: String, default: '' },
        /** Trend direction: 'up' | 'down' | 'flat' | '' */
        trend: { type: String, default: '' },
        /** Trend text e.g. '+12.5%' */
        trendValue: { type: String, default: '' },
        /** Auto-color trend (green up, red down) */
        trendColor: { type: Boolean, default: true },
        /** Size variant: 'sm' | 'md' | 'lg' */
        size: { type: String, default: 'md' },
        /** Show skeleton placeholder */
        loading: { type: Boolean, default: false },
        /** Decimal places for formatting (-1 = no format) */
        precision: { type: Number, default: -1 },
        /** Thousands separator */
        groupSeparator: { type: String, default: ',' },
        /** Comparison/previous value (shown muted below main value) */
        compareValue: { type: String, default: '' },
        /** Compare label (e.g. "vs last month") */
        compareLabel: { type: String, default: '' },
        /** Description text below value */
        description: { type: String, default: '' },
    },
    setup(ctx) {
        let _built = false;

        function formatValue(val: string, prec: number, sep: string): string {
            if (prec < 0) return val;
            const num = parseFloat(val);
            if (isNaN(num)) return val;
            const fixed = num.toFixed(prec);
            const [intPart, decPart] = fixed.split('.');
            const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
            return decPart ? grouped + '.' + decPart : grouped;
        }

        function getTrendIcon(t: string): string {
            if (t === 'up') return 'trending-up';
            if (t === 'down') return 'trending-down';
            if (t === 'flat') return 'minus';
            return '';
        }

        function render(): void {
            const el = ctx.el;
            const isLoading = ctx.loading() as boolean;
            const titleText = ctx.title() as string;
            const valueText = ctx.value() as string;
            const prefixText = ctx.prefix() as string;
            const suffixText = ctx.suffix() as string;
            const iconName = ctx.icon() as string;
            const trendDir = ctx.trend() as string;
            const trendVal = ctx.trendValue() as string;
            const autoColor = ctx.trendColor() as boolean;
            const size = ctx.size() as string;
            const prec = ctx.precision() as number;
            const sep = ctx.groupSeparator() as string;
            const compareVal = ctx.compareValue() as string;
            const compareLbl = ctx.compareLabel() as string;
            const descText = ctx.description() as string;

            el.innerHTML = '';

            // Own classes only, via classList: `className =` would wipe the author's classes.
            el.classList.add('pdx-statistic-root');
            el.classList.toggle('pdx-statistic-sm', size === 'sm');
            el.classList.toggle('pdx-statistic-lg', size === 'lg');
            el.classList.toggle('pdx-statistic-loading', !!isLoading);

            if (isLoading) {
                // Skeleton placeholders
                const skelTitle = document.createElement('div');
                skelTitle.className = 'pdx-statistic-skeleton pdx-statistic-skeleton-title';
                el.appendChild(skelTitle);
                const skelValue = document.createElement('div');
                skelValue.className = 'pdx-statistic-skeleton pdx-statistic-skeleton-value';
                el.appendChild(skelValue);
                const skelTrend = document.createElement('div');
                skelTrend.className = 'pdx-statistic-skeleton pdx-statistic-skeleton-trend';
                el.appendChild(skelTrend);
                return;
            }

            // Icon (optional)
            if (iconName) {
                loadIcon();
                const iconEl = document.createElement('pdx-icon');
                iconEl.className = 'pdx-statistic-icon';
                iconEl.setAttribute('name', iconName);
                iconEl.setAttribute('size', size === 'sm' ? '20' : size === 'lg' ? '32' : '24');
                iconEl.setAttribute('aria-hidden', 'true');   // decorative: the title says it
                el.appendChild(iconEl);
            }

            // Title
            if (titleText) {
                const titleEl = document.createElement('div');
                titleEl.className = 'pdx-statistic-title';
                titleEl.textContent = titleText;
                el.appendChild(titleEl);
            }

            // Value wrap: prefix + value + suffix
            const valueWrap = document.createElement('div');
            valueWrap.className = 'pdx-statistic-value-wrap';

            if (prefixText) {
                const preEl = document.createElement('span');
                preEl.className = 'pdx-statistic-prefix';
                preEl.textContent = prefixText;
                valueWrap.appendChild(preEl);
            }

            const valEl = document.createElement('span');
            valEl.className = 'pdx-statistic-value';
            valEl.textContent = formatValue(valueText, prec, sep);
            valueWrap.appendChild(valEl);

            if (suffixText) {
                const sufEl = document.createElement('span');
                sufEl.className = 'pdx-statistic-suffix';
                sufEl.textContent = suffixText;
                valueWrap.appendChild(sufEl);
            }

            el.appendChild(valueWrap);

            // Trend line (optional)
            if (trendDir || trendVal) {
                const trendEl = document.createElement('div');
                let trendClass = 'pdx-statistic-trend';
                if (autoColor && trendDir === 'up') trendClass += ' pdx-statistic-trend-up';
                else if (autoColor && trendDir === 'down') trendClass += ' pdx-statistic-trend-down';
                else if (trendDir === 'flat') trendClass += ' pdx-statistic-trend-flat';
                trendEl.className = trendClass;

                const trendIconName = getTrendIcon(trendDir);
                if (trendIconName) {
                    loadIcon();
                    const trendIcon = document.createElement('pdx-icon');
                    trendIcon.setAttribute('name', trendIconName);
                    trendIcon.setAttribute('size', '14');
                    // The sign is in the text (+12.5%): the arrow would be read as well.
                    trendIcon.setAttribute('aria-hidden', 'true');
                    trendEl.appendChild(trendIcon);
                }

                if (trendVal) {
                    const trendText = document.createElement('span');
                    trendText.textContent = trendVal;
                    trendEl.appendChild(trendText);
                }

                el.appendChild(trendEl);
            }

            // Description
            if (descText) {
                const descEl = document.createElement('div');
                descEl.className = 'pdx-statistic-desc';
                descEl.textContent = descText;
                el.appendChild(descEl);
            }

            // Compare value
            if (compareVal) {
                const cmpEl = document.createElement('div');
                cmpEl.className = 'pdx-statistic-compare';
                cmpEl.textContent = (compareLbl ? compareLbl + ' ' : '') + formatValue(compareVal, prec, sep);
                el.appendChild(cmpEl);
            }
        }

        ctx.track(() => {
            // Read all signals to establish subscriptions
            void ctx.title();
            void ctx.value();
            void ctx.prefix();
            void ctx.suffix();
            void ctx.icon();
            void ctx.trend();
            void ctx.trendValue();
            void ctx.trendColor();
            void ctx.size();
            void ctx.loading();
            void ctx.precision();
            void ctx.groupSeparator();
            void ctx.compareValue();
            void ctx.compareLabel();
            void ctx.description();

            if (!_built) {
                _built = true;
                requestAnimationFrame(() => render());
                return;
            }
            requestAnimationFrame(() => render());
        });

        return {};
    },
    render: () => html``,
});
