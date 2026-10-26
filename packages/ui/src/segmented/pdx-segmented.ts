// pdx-segmented — Segmented control with sliding indicator animation.
// Radio-group semantics (exactly one selected). Data-driven or compound.
// Features: sizes, full width, vertical, disabled per-item, form name,
// animated indicator (Mantine/Ark pattern), roving tabindex keyboard nav.

import { component, html, DEV, model } from '@pdxui/core';
import { reflectNameToHost } from '../shared/own-prop';
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
 *
 * @csspart root - The frame, the `radiogroup`.
 * @csspart item - One segment, a `radio` button; the chosen one is `aria-checked`.
 *
 * @cssstate disabled - `disabled` is set; every segment is disabled.
 *
 * @alphaevent pdx-change
 * @alphaevent change
 * @alphadetail value $event.detail.value
 */
component('pdx-segmented', {
    // A choice writes it (#480), and the write dispatches `value-change`. A form submits it, nothing
    // with no choice as a native radio group, and resets it (#135).
    models: { value: model('', { form: true }) },
    // On the host as a custom state (#132).
    states: ['disabled'],
    parts: ['root', 'item'],
    // The axes its stylesheet keys by (#629, #286), reflected on the host; each value maps the class
    // that draws the same look on native markup. `md` and `horizontal` are the base, which no class
    // adds to.
    variants: {
        /** sm, md (the default) or lg: the items' size. */
        size: { md: '.pdx-segmented-md', sm: '.pdx-segmented-sm', lg: '.pdx-segmented-lg' },
        /** horizontal (the default) or vertical: the segments in a row or a column. */
        orientation: { horizontal: '.pdx-segmented-horizontal', vertical: '.pdx-segmented-vertical' },
    },
    props: {
        /** Options: string[] or {label,value,disabled?,icon?}[] — bound as an array, or written as a static JSON attribute. */
        options: { type: Array, default: [] },
        full: { type: Boolean, default: false },
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
            // The choice is the model: written here, so the segment is selected whether or not a
            // parent binds the value back.
            ctx.value.set(val);
        }

        function onKeydown(e: KeyboardEvent) {
            if (ctx.disabled()) return;
            const isVert = ctx.orientation() === 'vertical';
            const items = ctx.el.querySelectorAll('[data-part="item"]:not([disabled])') as NodeListOf<HTMLElement>;
            if (!items || items.length === 0) return;

            // From the focused segment: with no choice made, the tab stop is the first enabled one, and
            // the arrows move on from where the focus is.
            const list = Array.from(items);
            const focused = list.indexOf(document.activeElement as HTMLElement);
            const current = focused !== -1 ? focused : list.findIndex(el => el.getAttribute('aria-checked') === 'true');
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

        /**
         * The segment that holds the tab stop: the chosen one, or the first enabled one when nothing
         * is chosen — or the radio group could not be reached with Tab at all.
         */
        function tabStop(): string | undefined {
            const opts = getOptions();
            const enabled = ctx.disabled() ? [] : opts.filter((o) => !o.disabled);
            const chosen = enabled.find((o) => o.value === ctx.value());
            return (chosen ?? enabled[0])?.value;
        }

        ctx.track(() => { ctx.state('disabled', !!ctx.disabled()); });

        // The radiogroup's name: `label`, or a pdx-label right before the host. Not bound as
        // :aria-label, which writes aria-label="" with no label.
        ctx.track(() => {
            const label = ctx.label() as string;
            requestAnimationFrame(() => {
                const group = ctx.el.querySelector('[role="radiogroup"]');
                if (group) nameGroup(ctx.el, group, label);
            });
        });

        ctx.formValue?.(() => (ctx.value() as string) || null);
        // The host is the one submitter. No hidden input carries the name, or it would send the value
        // a second time.
        reflectNameToHost(ctx);

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                ctx.value.set('');
            },
        });

        return { getOptions, selectValue, onKeydown, tabStop };
    },
    render: (ctx: any) => html`
        <div
            class="pdx-segmented"
            data-part="root"
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
                            data-part="item"
                            role="radio"
                            :aria-checked="${() => isActive() ? 'true' : 'false'}"
                            :tabindex="${() => ctx.tabStop() === opt.value ? '0' : '-1'}"
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
