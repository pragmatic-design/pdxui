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

import { component, html, useFormAssociated, untracked, generatedId, model } from '@pdxui/core';
import { interceptChildEvent } from '../shared/child-event';
import { nameGroup, authoredName } from '../shared/group-name';

/**
 * Single selection across the `<pdx-radio>` elements it holds, with one tab stop and arrow keys that
 * move and check, and the chosen value takes part in a form.
 *
 * @alphaevent pdx-change
 * @alphadetail value $event.detail.value
 */
component('pdx-radio-group', {
    formAssociated: true,
    models: { value: model('') },
    props: {
        name: { type: String, default: '' },
        orientation: { type: String, default: 'vertical' },
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
            const el = ctx.el;
            const size = ctx.size() as string;
            const disabled = ctx.disabled();
            const error = ctx.error();
            const val = ctx.value() as string;
            const orient = ctx.orientation() as string;

            // Own classes only, via classList: `className =` would wipe the author's classes.
            el.classList.add('pdx-choice-group');
            el.classList.toggle('horizontal', orient === 'horizontal');
            el.setAttribute('role', 'radiogroup');
            if (orient) el.setAttribute('aria-orientation', orient);
            if (disabled) el.setAttribute('aria-disabled', 'true');
            else el.removeAttribute('aria-disabled');

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

        useFormAssociated(ctx, { getFormValue: () => { const v = ctx.value() as string; return v || null; } });

        return {};
    },
    render: () => html`<slot></slot>`,
});
