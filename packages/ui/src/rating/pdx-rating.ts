// pdx-rating — Star rating with precision, keyboard nav, form integration.
// Features: half/quarter precision (MUI), custom icons (slot), tooltips (Ant),
// threshold colors (Element+), hover preview, readonly vs disabled.
// Uses aria-valuenow/min/max on role="slider" (WAI pattern).

import { component, html, signal, effect, useFormAssociated } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/rating';

/**
 * A star rating the user sets with the pointer or the keyboard, with a hover preview, and the value
 * takes part in a form.
 */
component('pdx-rating', {
    formAssociated: true,
    props: {
        value: { type: Number, default: 0 },
        count: { type: Number, default: 5 },
        precision: { type: Number, default: 1 },
        size: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        name: { type: String, default: '' },
        color: { type: String, default: '' },
        /** Comma-separated tooltip labels, e.g. "Bad,Poor,OK,Good,Great" */
        tooltips: { type: String, default: '' },
        /** Comma-separated threshold:color pairs, e.g. "2:red,3:orange,5:green" */
        colors: { type: String, default: '' },
        /** Allow clearing to 0 by clicking current value */
        clearable: { type: Boolean, default: false },
        /** Accessible name. Empty: the rating.label component string, «Rating» in English. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        const hoverValue = signal(-1);
        const isFocused = signal(false);
        // Uncontrolled-friendly value: click/keyboard update the internal state (and still emit
        // 'change'); the `value` prop seeds it and overrides whenever the host updates it. Without
        // this the rating was purely controlled → clicking emitted but the stars never changed.
        const _value = signal((ctx.value() as number) || 0);
        effect(() => { _value.set((ctx.value() as number) || 0); });

        /** The new value, announced twice: `pdx-change`, which is this library's value event and the
         *  one a form binding listens to, and `change` after it, a deprecated alias (as
         *  pdx-segmented does). */
        function emitValue(value: number): void {
            ctx.emit('pdx-change', { value });
            ctx.emit('change', { value });
        }

        function isInteractive(): boolean {
            return !ctx.disabled() && !ctx.readonly();
        }

        function snapToPrec(v: number): number {
            const p = ctx.precision() as number || 1;
            return Math.round(v / p) * p;
        }

        function getDisplayValue(): number {
            const hv = hoverValue();
            return hv >= 0 ? hv : _value();
        }

        function getTooltips(): string[] {
            const t = ctx.tooltips() as string;
            return t ? t.split(',').map(s => s.trim()) : [];
        }

        function getColorForValue(v: number): string {
            const c = ctx.colors() as string;
            if (!c) return ctx.color() as string || '';
            const pairs = c.split(',').map(p => {
                const [threshold, color] = p.trim().split(':');
                return { threshold: parseFloat(threshold), color: color.trim() };
            }).sort((a, b) => a.threshold - b.threshold);

            for (let i = pairs.length - 1; i >= 0; i--) {
                if (v <= pairs[i].threshold) continue;
                if (i < pairs.length - 1) return pairs[i + 1].color;
            }
            return pairs.length > 0 ? pairs[0].color : '';
        }

        function starFill(index: number): 'full' | 'half' | 'empty' {
            const dv = getDisplayValue();
            const i1 = index + 1;
            if (dv >= i1) return 'full';
            if (dv > index && dv < i1) return 'half';
            return 'empty';
        }

        function halfPercent(index: number): number {
            const dv = getDisplayValue();
            const frac = dv - index;
            if (frac <= 0) return 0;
            if (frac >= 1) return 100;
            return Math.round(frac * 100);
        }

        function onStarClick(index: number, e: MouseEvent) {
            if (!isInteractive()) return;
            const prec = ctx.precision() as number || 1;
            let newVal: number;
            if (prec < 1) {
                // Calculate precise value from click position within star
                const el = (e.currentTarget as HTMLElement);
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = x / rect.width;
                newVal = snapToPrec(index + pct);
            } else {
                newVal = index + 1;
            }
            // Clearable: click on same value clears
            if (ctx.clearable() && newVal === _value()) {
                newVal = 0;
            }
            _value.set(newVal);
            setOwnProp(ctx.el, 'value', newVal);
            emitValue(newVal);
        }

        function onStarHover(index: number, e: MouseEvent) {
            if (!isInteractive()) return;
            const prec = ctx.precision() as number || 1;
            if (prec < 1) {
                const el = (e.currentTarget as HTMLElement);
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = x / rect.width;
                hoverValue.set(snapToPrec(index + pct));
            } else {
                hoverValue.set(index + 1);
            }
            ctx.emit('hover', { value: hoverValue() });
        }

        function onMouseLeave() {
            hoverValue.set(-1);
            ctx.emit('hover', { value: -1 });
        }

        function onKeydown(e: KeyboardEvent) {
            if (!isInteractive()) return;
            const prec = ctx.precision() as number || 1;
            const current = _value();
            const max = ctx.count() as number;
            let next = current;
            switch (e.key) {
                case 'ArrowRight': case 'ArrowUp':
                    next = Math.min(max, current + prec);
                    e.preventDefault();
                    break;
                case 'ArrowLeft': case 'ArrowDown':
                    next = Math.max(0, current - prec);
                    e.preventDefault();
                    break;
                case 'Home':
                    next = 0;
                    e.preventDefault();
                    break;
                case 'End':
                    next = max;
                    e.preventDefault();
                    break;
                default: return;
            }
            next = snapToPrec(next);
            if (next !== current) {
                _value.set(next);
                setOwnProp(ctx.el, 'value', next);
                emitValue(next);
            }
        }

        function rootClass(): string {
            let cls = 'pdx-rating';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-rating-' + s;
            if (ctx.disabled()) cls += ' pdx-rating-disabled';
            if (ctx.readonly()) cls += ' pdx-rating-readonly';
            if (isFocused()) cls += ' pdx-rating-focused';
            return cls;
        }

        function renderStars(): ReturnType<typeof html> {
            const cnt = ctx.count() as number;
            const tips = getTooltips();
            const stars: ReturnType<typeof html>[] = [];
            for (let i = 0; i < cnt; i++) {
                const fill = starFill(i);
                const pct = halfPercent(i);
                const tip = tips[i] || '';
                const col = getColorForValue(i + 1);
                stars.push(html`
                    <span
                        class="${'pdx-rating-star pdx-rating-star-' + fill}"
                        :title="${() => tip}"
                        :style="${() => col ? 'color:' + col : ''}"
                        @click="${(e: MouseEvent) => onStarClick(i, e)}"
                        @mousemove="${(e: MouseEvent) => onStarHover(i, e)}"
                    >
                        <svg viewBox="0 0 24 24" class="pdx-rating-icon pdx-rating-bg" aria-hidden="true">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        ${() => fill === 'half' ? html`
                            <svg viewBox="0 0 24 24" class="pdx-rating-icon pdx-rating-fill" aria-hidden="true"
                                :style="${() => 'clip-path:inset(0 ' + (100 - pct) + '% 0 0)'}">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                        ` : ''}
                    </span>
                `);
            }
            return html`${stars}`;
        }

        useFormAssociated(ctx, { getFormValue: () => { const v = _value(); return v !== undefined && v !== null ? String(v) : null; } });
        // The host is the one submitter. No hidden input carries the name, or it would send the value
        // a second time.
        reflectNameToHost(ctx);

        // Imperative API: focus/blur/clear (clear resets rating to 0)
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                _value.set(0);
                (ctx.el as any).value = 0;
                emitValue(0);
            },
        });

        return { hoverValue, isFocused, _value, getDisplayValue, rootClass, renderStars, onMouseLeave, onKeydown };
    },
    render: (ctx: any) => html`
        <div
            :class="${ctx.rootClass}"
            role="slider"
            :aria-valuenow="${() => String(ctx._value())}"
            aria-valuemin="0"
            :aria-valuemax="${() => String(ctx.count())}"
            :aria-label="${() => (ctx.label() as string) || uiString('rating', 'label')}"
            :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
            :aria-readonly="${() => ctx.readonly() ? 'true' : null}"
            :tabindex="${() => ctx.disabled() ? '-1' : '0'}"
            @mouseleave="${ctx.onMouseLeave}"
            @keydown="${ctx.onKeydown}"
            @focus="${() => ctx.isFocused.set(true)}"
            @blur="${() => ctx.isFocused.set(false)}"
        >
            ${ctx.renderStars}
        </div>
    `,
});
