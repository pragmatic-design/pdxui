// pdx-radio-group — Manages single selection across child <pdx-radio> elements.
// Propagates name/size/disabled/error. Emits pdx-change with the selected value.
//
// The group follows its children. It listens to the pdx-change its CHILDREN emit and ignores its
// own: the same event name bubbles from both, and taking its own event for a child's would re-emit
// it forever — one click would overflow the stack and the value would never change. The value is
// reflected on the host, and exactly one pdx-change leaves it: the child's event is stopped at the
// child (shared/child-event.ts). Not at the group with stopImmediatePropagation, which spares the
// listeners added before the group's own — a listener added before the group connects — so those
// would hear two events per click.
//
// Keyboard: the radios share one `name`, so the browser's own radio group gives one tab stop and
// arrow keys that move AND check. A focusGroup() on the <pdx-radio> hosts would fight that: it finds
// no current item while focus sits on the inner input, and sends ArrowDown back to the first radio.

import { component, html, useFormAssociated, untracked } from '@pdxui/core';
import { interceptChildEvent } from '../shared/child-event';
import { nameGroup, authoredName } from '../shared/group-name';

/** Counts unnamed groups: two sharing a radio `name` would be one radio group to the browser (#68). */
let _rgCounter = 0;

/**
 * Single selection across the `<pdx-radio>` elements it holds, with one tab stop and arrow keys that
 * move and check, and the chosen value takes part in a form.
 */
component('pdx-radio-group', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        name: { type: String, default: '' },
        orientation: { type: String, default: 'vertical' },
        size: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        /** Accessible name of the group. Without it, a <pdx-label> right before the group names it. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        const _fallbackName = 'pdx-rg-' + (++_rgCounter);

        function getRadios(): HTMLElement[] {
            return Array.from(ctx.el.querySelectorAll('pdx-radio'));
        }

        function handleChange(ce: CustomEvent<{ value?: string }>) {
            if (ce.detail?.value == null) return;
            const value = String(ce.detail.value);
            if (value === untracked(() => ctx.value() as string)) return;
            (ctx.el as unknown as { value: string }).value = value;
            ctx.emit('pdx-change', { value });
        }
        const stopChildEvents = interceptChildEvent(ctx.el, 'pdx-change',
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
