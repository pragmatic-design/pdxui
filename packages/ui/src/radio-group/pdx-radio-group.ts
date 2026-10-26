// pdx-radio-group — Manages single selection across child <pdx-radio> elements.
// Propagates name/size/disabled/error. Its model is `value` (#480): choosing a radio writes it, and
// the write dispatches `value-change`.
//
// The group follows its children. It handles the `checked-change` its CHILDREN emit, in the capture
// phase, since a model's event does not bubble, and stops it at the child (shared/child-event.ts), so a
// listener on the group hears the group's event alone.
//
// Keyboard: the radios share one `name`, so the browser's own radio group gives one tab stop and
// arrow keys that move AND check. A focusGroup() on the <pdx-radio> hosts would fight that: it finds
// no current item while focus sits on the inner input, and sends ArrowDown back to the first radio.

import { component, html, untracked, generatedId, model } from '@pdxui/core';
import { interceptChildEvent } from '../shared/child-event';
import { nameGroup, authoredName } from '../shared/group-name';

/**
 * Single selection across the `<pdx-radio>` elements it holds, with one tab stop and arrow keys that
 * move and check, and the chosen value takes part in a form.
 *
 * @cssstate invalid - `error` is set; every radio is aria-invalid.
 * @cssstate disabled - `disabled` is set; the group is aria-disabled and every radio disabled.
 *
 * @alphaevent pdx-change
 * @alphadetail value $event.detail.value
 */
component('pdx-radio-group', {
    // A form submits the chosen value, nothing with no choice as a native radio group, and resets it (#135).
    models: { value: model('', { form: true }) },
    // On the host as custom states (#132).
    states: ['invalid', 'disabled'],
    // Its layout axis (#286), reflected on the host, where forms.css draws the row; no class for it.
    variants: {
        /** vertical (the default) or horizontal: the radios in a column or a row. */
        orientation: ['vertical', 'horizontal'],
    },
    props: {
        name: { type: String, default: '' },
        size: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        /** Accessible name of the group. Without it, a <pdx-label> right before the group names it. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        const _fallbackName = generatedId('pdx-rg');

        function getRadios(): HTMLElement[] {
            return Array.from(ctx.el.querySelectorAll('pdx-radio'));
        }

        // A radio announces that it was checked; the choice is its value, or its label without one.
        function handleChange(ce: CustomEvent<{ value?: boolean }>) {
            if (ce.detail?.value !== true) return;
            const radio = ce.target as HTMLElement & { value?: string; label?: string };
            const value = String(radio.value || radio.label || '');
            if (!value || value === untracked(() => ctx.value() as string)) return;
            ctx.value.set(value);
        }
        const stopChildEvents = interceptChildEvent(ctx.el, 'checked-change',
            (t) => t.tagName === 'PDX-RADIO' && t.closest('pdx-radio-group') === ctx.el, handleChange);
        ctx.track(() => stopChildEvents);

        // The group's name: `label`, or a pdx-label right before it.
        const authored = authoredName(ctx.el);
        ctx.track(() => {
            const label = ctx.label() as string;
            if (!authored) requestAnimationFrame(() => nameGroup(ctx.el, ctx.el, label));
        });

        ctx.track(() => {
            ctx.state('invalid', !!ctx.error());
            ctx.state('disabled', !!ctx.disabled());
        });

        // Its own class only, via classList: `className =` would wipe the author's classes. The base
        // look of a choice group; the orientation is the host's attribute.
        ctx.el.classList.add('pdx-choice-group');

        ctx.track(() => {
            const size = ctx.size() as string;
            const disabled = ctx.disabled();
            const error = ctx.error();
            const val = ctx.value() as string;

            requestAnimationFrame(() => {
                const radios = getRadios();
                const groupName = (ctx.name() as string) || _fallbackName;
                for (const r of radios) {
                    r.setAttribute('name', groupName);
                    if (size) r.setAttribute('size', size); else r.removeAttribute('size');
                    if (disabled) r.setAttribute('disabled', ''); else r.removeAttribute('disabled');
                    if (error) r.setAttribute('error', ''); else r.removeAttribute('error');
                    const rv = r.getAttribute('value') || '';
                    if (val && rv === val) r.setAttribute('checked', '');
                    else r.removeAttribute('checked');
                }
            });
        });

        ctx.formValue?.(() => (ctx.value() as string) || null);

        return {};
    },
    // Its role and ARIA (#133). Written after `setup`, so its type is read.
    host: {
        role: 'radiogroup',
        ':aria-orientation': (ctx) => ctx.orientation(),
        ':aria-disabled': (ctx) => ctx.disabled() ? 'true' : null,
    },
    render: () => html`<slot></slot>`,
});
