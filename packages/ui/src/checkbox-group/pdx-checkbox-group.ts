// pdx-checkbox-group — Manages multiple selection across child <pdx-checkbox> elements.
// Propagates size/disabled. Uses createSelection() for state management. Its model is `value`, the
// comma-separated selection (#480): a user change writes it, and the write dispatches `value-change`.
//
// The group follows its children. It handles the `checked-change` its CHILDREN emit, in the capture
// phase, since a model's event does not bubble, and stops it at the child, so a listener on the group
// hears the group's event alone. The value track reads the selection untracked — subscribed to it, the
// track would re-run on every click and put the selection back to the stale prop. Its own classes go
// through classList, so the author's classes survive.

import { component, html, createSelection, untracked, DEV, model } from '@pdxui/core';
import { interceptChildEvent } from '../shared/child-event';
import { nameGroup, authoredName } from '../shared/group-name';
import '../checkbox/pdx-checkbox'; // rendered by this component, and registered by nobody else

/**
 * A multi-selection across child `pdx-checkbox` elements, with one value for the form.
 *
 * @cssstate invalid - `error` is set; every checkbox is aria-invalid.
 * @cssstate disabled - `disabled` is set; the group is aria-disabled and every checkbox disabled.
 *
 * @alphaevent pdx-change
 * @alphadetail value $event.detail.value
 * @alphadetail values $event.detail.value.split(',').filter(Boolean)
 */
component('pdx-checkbox-group', {
    models: {
        /** Comma-separated selected values. A form submits one entry per value, and resets it (#135). */
        value: model('', { form: true }),
    },
    // On the host as custom states (#132).
    states: ['invalid', 'disabled'],
    // Its layout axis (#286), reflected on the host, where forms.css draws the row; no class for it.
    variants: {
        /** vertical (the default) or horizontal: the checkboxes in a column or a row. */
        orientation: ['vertical', 'horizontal'],
    },
    props: {
        size: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        /** Accessible name of the group. Without it, a <pdx-label> right before the group names it. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        let _syncing = false; // a value set from outside is applied without emitting
        let _reflected: string | null = null; // the last value this group wrote to the host

        function parseValue(val: string): Set<string> {
            if (!val) return new Set();
            return new Set(val.split(',').map(v => v.trim()).filter(Boolean));
        }

        const selection = createSelection<string>({
            mode: 'multiple',
            behavior: 'toggle',
            defaultSelected: parseValue(ctx.value() as string),
            onSelectionChange: (selected) => {
                if (_syncing) return;
                const value = Array.from(selected).join(',');
                _reflected = value;
                ctx.value.set(value);
            },
        });

        function getCheckboxes(): HTMLElement[] {
            return Array.from(ctx.el.querySelectorAll('pdx-checkbox'));
        }

        let _warnedNoValue = false;
        // A box announces its `checked`; which choice it is is its value, or its label without one.
        function handleChange(ce: CustomEvent<{ value?: boolean }>) {
            if (!ce.detail) return;
            const box = ce.target as HTMLElement & { value?: string; label?: string };
            const checked = ce.detail.value === true;
            const cbValue = String(box.value || box.label || '');
            if (!cbValue) {
                if (DEV && !_warnedNoValue) {
                    _warnedNoValue = true;
                    console.warn('[pdx-checkbox-group] a child <pdx-checkbox> has no value and no label: '
                        + 'give it value="…" so the group can report it.');
                }
                return;
            }
            // Set, not toggle: the child says what it is now, so a repeated event cannot flip it.
            const has = untracked(() => selection.selected()).has(cbValue);
            if (checked && !has) selection.select(cbValue);
            else if (!checked && has) selection.deselect(cbValue);
        }
        // The child's checked-change is handled and stopped at the child, so a listener on the group
        // hears only the group's (shared/child-event.ts).
        const stopChildEvents = interceptChildEvent(ctx.el, 'checked-change',
            (t) => t.tagName === 'PDX-CHECKBOX' && t.closest('pdx-checkbox-group') === ctx.el, handleChange);
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

        // Its own class only, via classList: the author's classes survive. The base look of a choice
        // group; the orientation is the host's attribute.
        ctx.el.classList.add('pdx-choice-group');

        // A value set from outside.
        ctx.track(() => {
            const propVal = ctx.value() as string;
            if (propVal !== undefined && propVal !== null && propVal !== _reflected) {
                const propSet = parseValue(propVal);
                const current = untracked(() => selection.selected());
                if (propSet.size !== current.size || ![...propSet].every(v => current.has(v))) {
                    _syncing = true;
                    selection.clear();
                    if (propSet.size > 0) selection.selectAll(Array.from(propSet));
                    _syncing = false;
                }
            }
        });

        // Children follow the selection and the shared props.
        ctx.track(() => {
            const selected = selection.selected();
            const size = ctx.size() as string;
            const disabled = ctx.disabled();
            const error = ctx.error();

            requestAnimationFrame(() => {
                for (const cb of getCheckboxes()) {
                    if (size) cb.setAttribute('size', size); else cb.removeAttribute('size');
                    if (disabled) cb.setAttribute('disabled', ''); else cb.removeAttribute('disabled');
                    if (error) cb.setAttribute('error', ''); else cb.removeAttribute('error');
                    const cbVal = cb.getAttribute('value') || '';
                    if (cbVal && selected.has(cbVal)) cb.setAttribute('checked', '');
                    else if (cbVal) cb.removeAttribute('checked');
                }
            });
        });

        ctx.formValue?.(() => Array.from(selection.selected()));

        return {};
    },
    // Its role and ARIA (#133). No aria-orientation: a `group` may not carry it (axe's
    // aria-allowed-attr), unlike the radio group's `radiogroup`. Written after `setup`, so its type is read.
    host: {
        role: 'group',
        ':aria-disabled': (ctx) => ctx.disabled() ? 'true' : null,
    },
    render: () => html`<slot></slot>`,
});
