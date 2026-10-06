// pdx-segmented — Segmented control with sliding indicator animation.
// Radio-group semantics (exactly one selected). Data-driven or compound.
// Features: sizes, full width, vertical, disabled per-item, form name,
// animated indicator (Mantine/Ark pattern), roving tabindex keyboard nav.

import { component, html, useFormAssociated, DEV } from '@pdxui/core';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
import { nameGroup } from '../shared/group-name';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/segmented';

/** An option's icon, loading `pdx-icon` the first time one is named: a control of labels never pays for the set. */
function optionIcon(opt: { icon?: string }) {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
    return html`<pdx-icon :name="${() => opt.icon}"></pdx-icon>`;
}

interface SegmentOption {
    label: string;
    value: string;
    disabled?: boolean;
    icon?: string;
}

/**
 * A radio-group style selector: the user picks one of its segments, marked by a sliding indicator.
 */
component('pdx-segmented', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        /** Options: string[] or {label,value,disabled?,icon?}[] — bound as an array, or written as a static JSON attribute. */
        options: { type: Array, default: [] },
        size: { type: String, default: '' },
        full: { type: Boolean, default: false },
        orientation: { type: String, default: 'horizontal' },
        disabled: { type: Boolean, default: false },
        name: { type: String, default: '' },
        label: { type: String, default: '' },
    },
    setup(ctx) {
        // An array, from a binding or from a JSON attribute (core parses the attribute of an Array
        // prop). Not a String read with JSON.parse in an empty catch, where `:options="choices"`
        // arrives as "[object Object],…" and renders nothing, in silence.
        let warnedUnreadable = false;
        function getOptions(): SegmentOption[] {
            const raw = ctx.options() as unknown;
            if (raw === '' || raw == null) return [];
            if (!Array.isArray(raw)) {
                if (DEV && !warnedUnreadable) {
                    warnedUnreadable = true;
                    console.warn(`[pdx-segmented] options is not an array: ${JSON.stringify(raw)}. `
                        + `Bind an array (:options="choices") or write a JSON array (options='["a","b"]').`);
                }
                return [];
            }
            return raw.map((o: string | SegmentOption) =>
                typeof o === 'string' ? { label: o, value: o } : o
            );
        }

        function selectValue(val: string) {
            if (ctx.disabled()) return;
            // The choice is written to `value` before the events, or the segment would stay
            // unselected unless a parent bound the value back from the event.
            const previousValue = ctx.value();
            setOwnProp(ctx.el, 'value', val);
            // The event contract: the pdx- prefix. The legacy event stays as an alias.
            ctx.emit('pdx-change', { value: val, previousValue });
            ctx.emit('change', { value: val, previousValue });
        }

        function onKeydown(e: KeyboardEvent) {
            if (ctx.disabled()) return;
            const isVert = ctx.orientation() === 'vertical';
            const items = ctx.el.querySelectorAll('.pdx-segmented-item:not([disabled])') as NodeListOf<HTMLElement>;
            if (!items || items.length === 0) return;

            const current = Array.from(items).findIndex(el => el.getAttribute('aria-checked') === 'true');
            let next = current;

            switch (e.key) {
                case 'ArrowRight': case 'ArrowDown':
                    if ((!isVert && e.key === 'ArrowRight') || (isVert && e.key === 'ArrowDown')) {
                        next = (current + 1) % items.length;
                        e.preventDefault();
                    }
                    break;
                case 'ArrowLeft': case 'ArrowUp':
                    if ((!isVert && e.key === 'ArrowLeft') || (isVert && e.key === 'ArrowUp')) {
                        next = (current - 1 + items.length) % items.length;
                        e.preventDefault();
                    }
                    break;
                case 'Home':
                    next = 0;
                    e.preventDefault();
                    break;
                case 'End':
                    next = items.length - 1;
                    e.preventDefault();
                    break;
                default: return;
            }
            if (next !== current) {
                items[next].focus();
                const val = items[next].dataset.value;
                if (val) selectValue(val);
            }
        }

        function rootClass(): string {
            let cls = 'pdx-segmented';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-segmented-' + s;
            if (ctx.orientation() === 'vertical') cls += ' pdx-segmented-vertical';
            return cls;
        }

        // The radiogroup's name: `label`, or a pdx-label right before the host. Not bound as
        // :aria-label, which writes aria-label="" with no label.
        ctx.track(() => {
            const label = ctx.label() as string;
            requestAnimationFrame(() => {
                const group = ctx.el.querySelector('[role="radiogroup"]');
                if (group) nameGroup(ctx.el, group, label);
            });
        });

        useFormAssociated(ctx, { getFormValue: () => (ctx.value() as string) || null });
        // The host is the one submitter. No hidden input carries the name, or it would send the value
        // a second time.
        reflectNameToHost(ctx);

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                const prev = ctx.value();
                (ctx.el as any).value = '';
                ctx.emit('pdx-change', { value: '', previousValue: prev });
                ctx.emit('change', { value: '', previousValue: prev });
            },
        });

        return { getOptions, selectValue, onKeydown, rootClass };
    },
    render: (ctx: any) => html`
        <div
            :class="${ctx.rootClass}"
            role="radiogroup"
            :aria-orientation="${ctx.orientation}"
            :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
            @keydown="${ctx.onKeydown}"
            ${() => ctx.full() ? 'full' : ''}
        >
            ${() => {
                const opts = ctx.getOptions();
                return opts.map((opt: SegmentOption) => {
                    const isActive = () => ctx.value() === opt.value;
                    const isDisabled = () => ctx.disabled() || !!opt.disabled;
                    return html`
                        <button
                            type="button"
                            class="pdx-segmented-item"
                            role="radio"
                            :aria-checked="${() => isActive() ? 'true' : 'false'}"
                            :tabindex="${() => isActive() ? '0' : '-1'}"
                            :disabled="${isDisabled}"
                            data-value="${opt.value}"
                            @click="${() => !isDisabled() && ctx.selectValue(opt.value)}"
                        >
                            ${opt.icon ? optionIcon(opt) : ''}
                            ${opt.label}
                        </button>
                    `;
                });
            }}
        </div>
    `,
});
