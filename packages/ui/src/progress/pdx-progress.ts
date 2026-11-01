// pdx-progress — Linear and circular progress indicator.
// Determinate (value 0-100) or indeterminate (animated).
// Uses Pragmatic CSS classes + enhances with label, sizes, circular mode.

import { component, html } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/progress';

/**
 * A linear or circular progress indicator, determinate with a value or indeterminate and animated.
 *
 * @csspart root - The track: `.pdx-progress` (linear) or `.pdx-progress-circular`, with
 *   `.pdx-progress-indeterminate` while there is no value.
 * @csspart bar - The linear bar.
 * @csspart ring - The circular ring (`<svg>`), which spins while there is no value.
 * @csspart label - The percentage or `label`, with `showLabel`.
 */
component('pdx-progress', {
    parts: ['root', 'bar', 'ring', 'label'],
    // The axis progress.css keys by (#631), reflected on the host; each value maps the class that draws
    // the same track on native markup. `md` is the base look. The colour `variant` stays a prop: it is
    // passed to the bar and the ring as attributes, which progress.css draws natively.
    variants: {
        /** sm, md (the default) or lg. */
        size: { md: '.pdx-progress-md', sm: '.pdx-progress-sm', lg: '.pdx-progress-lg' },
    },
    props: {
        /** Current value (0-100). Omit or -1 for indeterminate. */
        value: { type: Number, default: -1 },
        /** Max value (default 100) */
        max: { type: Number, default: 100 },
        /** Color variant: primary (default), success, warning, danger */
        variant: { type: String, default: '' },
        /** Show percentage label */
        showLabel: { type: Boolean, default: false },
        /** Custom label text (overrides percentage). Also the value in words for assistive technology (aria-valuetext). */
        label: { type: String, default: '' },
        /** Striped animation on the bar */
        striped: { type: Boolean, default: false },
        /** Circular/ring mode instead of linear bar */
        circular: { type: Boolean, default: false },
        /** Accessible label for screen readers. Empty: the progress.label component string. */
        ariaLabel: { type: String, default: '' },
    },
    setup(ctx) {
        function percent(): number {
            const v = ctx.value() as number;
            const mx = ctx.max() as number;
            if (v < 0 || mx <= 0) return -1; // indeterminate
            return Math.max(0, Math.min(100, (v / mx) * 100));
        }

        function isIndeterminate(): boolean {
            return percent() < 0;
        }

        function rootClass(): string {
            let cls = ctx.circular() ? 'pdx-progress-circular' : 'pdx-progress';
            if (isIndeterminate()) cls += ' pdx-progress-indeterminate';
            if (ctx.striped()) cls += ' pdx-progress-striped';
            return cls;
        }

        function barStyle(): string {
            const p = percent();
            if (p < 0) return ''; // indeterminate uses CSS animation
            return `width:${p}%`;
        }

        function labelText(): string {
            const custom = ctx.label() as string;
            if (custom) return custom;
            const p = percent();
            if (p < 0) return '';
            return Math.round(p) + '%';
        }

        function circularAttrs(): { dashOffset: number; circumference: number; radius: number } {
            const radius = 40;
            const circumference = 2 * Math.PI * radius;
            const p = percent();
            const dashOffset = p < 0 ? circumference * 0.75 : circumference * (1 - p / 100);
            return { dashOffset, circumference, radius };
        }

        // Update DOM imperatively for circular mode (SVG needs dynamic attrs)
        ctx.track(() => {
            const el = ctx.el;
            const v = ctx.variant() as string;
            const p = percent();

            requestAnimationFrame(() => {
                if (ctx.circular()) {
                    const circle = el.querySelector('.pdx-progress-ring-value') as SVGCircleElement;
                    const lbl = el.querySelector('.pdx-progress-circular-label') as HTMLElement;
                    if (circle) {
                        const { dashOffset, circumference } = circularAttrs();
                        circle.style.strokeDasharray = String(circumference);
                        circle.style.strokeDashoffset = String(dashOffset);
                        if (v) circle.setAttribute('data-variant', v);
                    }
                    if (lbl && ctx.showLabel()) {
                        lbl.textContent = labelText();
                    }
                    // The ring spins from its root's `.pdx-progress-indeterminate` (progress.css), which
                    // follows the value: a class added here was never taken off, and a ring that got a
                    // value went on spinning.
                } else {
                    const bar = el.querySelector('.pdx-progress-bar') as HTMLElement;
                    if (bar) {
                        bar.style.width = p < 0 ? '' : p + '%';
                        if (v) bar.setAttribute('variant', v);
                    }
                    const lbl = el.querySelector('.pdx-progress-label') as HTMLElement;
                    if (lbl) lbl.textContent = labelText();
                }
            });
        });

        // The value on the element with role="progressbar", in its own range (valuemin 0, valuemax
        // `max`), not on the host as a percentage, where a bar reads "Progress, progress bar" with
        // no value. None while indeterminate.
        function ariaValueNow(): string | null {
            if (isIndeterminate()) return null;
            const v = ctx.value() as number;
            const mx = ctx.max() as number;
            return String(Math.max(0, Math.min(mx, v)));
        }
        /** `label` is the value in words ("3 of 5 steps"), read instead of the number. */
        function ariaValueText(): string | null {
            return isIndeterminate() ? null : ((ctx.label() as string) || null);
        }

        return { rootClass, barStyle, labelText, isIndeterminate, ariaValueNow, ariaValueText };
    },
    render: (ctx) => html`
        ${() => ctx.circular() ? html`
            <div :class="${ctx.rootClass}" data-part="root" role="progressbar" :aria-label="${() => (ctx.ariaLabel() as string) || uiString('progress', 'label')}"
                aria-valuemin="0" :aria-valuemax="${ctx.max}"
                :aria-valuenow="${ctx.ariaValueNow}" :aria-valuetext="${ctx.ariaValueText}">
                <svg class="pdx-progress-ring" data-part="ring" viewBox="0 0 100 100">
                    <circle class="pdx-progress-ring-track" cx="50" cy="50" r="40" fill="none" stroke-width="8" />
                    <circle class="pdx-progress-ring-value" cx="50" cy="50" r="40" fill="none" stroke-width="8"
                        stroke-linecap="round" />
                </svg>
                ${() => ctx.showLabel() ? html`<span class="pdx-progress-circular-label" data-part="label"></span>` : ''}
            </div>
        ` : html`
            <div role="progressbar" :aria-label="${() => (ctx.ariaLabel() as string) || uiString('progress', 'label')}"
                aria-valuemin="0" :aria-valuemax="${ctx.max}"
                :aria-valuenow="${ctx.ariaValueNow}" :aria-valuetext="${ctx.ariaValueText}" style="display:flex;align-items:center;gap:var(--pdx-space-sm);width:100%">
                <div :class="${ctx.rootClass}" data-part="root">
                    <div class="pdx-progress-bar" data-part="bar"></div>
                </div>
                ${() => ctx.showLabel() ? html`<span class="pdx-progress-label" data-part="label" style="font-size:var(--pdx-text-xs);color:var(--pdx-color-muted);white-space:nowrap;min-width:3ch;text-align:right"></span>` : ''}
            </div>
        `}
    `,
});
