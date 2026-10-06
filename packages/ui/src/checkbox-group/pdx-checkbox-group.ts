// pdx-checkbox-group — Manages multiple selection across child <pdx-checkbox> elements.
// Propagates size/disabled. Uses createSelection() for state management.
// Emits pdx-change with selected values array.
//
// The group follows its children. It handles the pdx-change its CHILDREN emit and
// ignores its own: the same event name bubbles from both, and taking its own event for a child's
// would make one click loop (the joined "a,b" toggled as a value, emitted again, forever). The child's
// event is stopped at the child, so a listener on the group — however early it was added — hears
// exactly one pdx-change per click, the group's { value, values }. After every
// user change the joined value is reflected on the host's `value`, and the value track reads the
// selection untracked — subscribed to it, the track would re-run on every click and put the selection
// back to the stale prop. Its own classes go through classList, so the author's classes survive.

import { component, html, createSelection, useFormAssociated, untracked, DEV } from '@pdxui/core';
import { interceptChildEvent } from '../shared/child-event';
import { nameGroup, authoredName } from '../shared/group-name';
import '../checkbox/pdx-checkbox'; // rendered by this component, and registered by nobody else

/**
 * A multi-selection across child `pdx-checkbox` elements, with one value for the form.
 */
component('pdx-checkbox-group', {
    formAssociated: true,
    props: {
        /** Comma-separated selected values */
        value: { type: String, default: '' },
        orientation: { type: String, default: 'vertical' },
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
                const values = Array.from(selected);
                const value = values.join(',');
                _reflected = value;
                (ctx.el as unknown as { value: string }).value = value;
                ctx.emit('pdx-change', { value, values });
            },
        });

        function getCheckboxes(): HTMLElement[] {
            return Array.from(ctx.el.querySelectorAll('pdx-checkbox'));
        }

        let _warnedNoValue = false;
        function handleChange(ce: CustomEvent<{ checked?: boolean; value?: string }>) {
            if (!ce.detail) return;
            const cbValue = String(ce.detail.value ?? '');
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
            if (ce.detail.checked && !has) selection.select(cbValue);
            else if (!ce.detail.checked && has) selection.deselect(cbValue);
        }
        // The child's pdx-change is handled and stopped at the child, so a listener on the group
        // hears only the group's (shared/child-event.ts).
        const stopChildEvents = interceptChildEvent(ctx.el, 'pdx-change',
            (t) => t.tagName === 'PDX-CHECKBOX' && t.closest('pdx-checkbox-group') === ctx.el, handleChange);
        ctx.track(() => stopChildEvents);

        // The group's name: `label`, or a pdx-label right before it.
        const authored = authoredName(ctx.el);
        ctx.track(() => {
            const label = ctx.label() as string;
            if (!authored) requestAnimationFrame(() => nameGroup(ctx.el, ctx.el, label));
        });

        // Host attributes + a value set from outside.
        ctx.track(() => {
            const el = ctx.el;
            const disabled = ctx.disabled();
            const orient = ctx.orientation() as string;

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

            el.classList.add('pdx-choice-group');
            el.classList.toggle('horizontal', orient === 'horizontal');
            el.setAttribute('role', 'group');
            if (disabled) el.setAttribute('aria-disabled', 'true');
            else el.removeAttribute('aria-disabled');
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

        useFormAssociated(ctx, { getFormValue: () => { const selected = Array.from(selection.selected()); return selected.length > 0 ? JSON.stringify(selected) : null; } });

        return {};
    },
    render: () => html`<slot></slot>`,
});
