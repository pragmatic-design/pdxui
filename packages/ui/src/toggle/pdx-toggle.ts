// pdx-toggle — Toggle button with pressed state + group support.
// Single: aria-pressed (on/off action). Group: single or multiple selection.
// Uses focusGroup from core for roving tabindex in group mode.
// Distinct from Segmented: toggle = action state (0..N), segmented = exclusive selection (1).

import { component, html, prop, model } from '@pdxui/core';
import { guardDisabledClicks } from '../shared/disabled-click';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/toggle';

// ─── Single Toggle ───

/**
 * A button the user presses on and off, its state exposed with `aria-pressed`.
 *
 * @csspart root - The native `<button>`, aria-pressed (aria-checked as a group's radio); the pressed look keys by that attribute.
 *
 * @cssstate pressed - It is pressed.
 * @cssstate disabled - `disabled` is set.
 *
 * @alphaevent pdx-pressed-change
 * @alphaevent pressedchange
 * @alphadetail pressed $event.detail.value
 */
component('pdx-toggle', {
    // A click writes it (#480), and the write dispatches `pressed-change`.
    models: { pressed: model(false, { form: true }) },
    // On the host as custom states (#132); the button carries no state class.
    states: ['pressed', 'disabled'],
    parts: ['root'],
    // The axis toggle.css keys by (#286), reflected on the host; each value maps the classes that draw
    // the same look on a native button. Compound, so pdx-button's own `.pdx-ghost` is not reached.
    variants: {
        /** outline (the default), ghost or solid. */
        variant: { outline: '.pdx-toggle-btn.pdx-outline', ghost: '.pdx-toggle-btn.pdx-ghost', solid: '.pdx-toggle-btn.pdx-solid' },
    },
    props: {
        disabled: prop(false),
        value: prop(''),
        size: prop(''),
        /** The toggle's name when its content does not say it ("B" is Bold), forwarded to the inner `<button>`: `aria-label` on the host has no role to name. */
        ariaLabel: prop(''),
        /**
         * Set by a `pdx-toggle-group type="single"` on its toggles: the button is a `radio` with
         * `aria-checked` in the group's `radiogroup`, instead of a toggle button with `aria-pressed`.
         * Not for a toggle on its own: a radio belongs in a radiogroup.
         */
        radio: prop(false),
    },
    setup(ctx) {
        // Disabled: the click stops at the host, before the app's @click.
        ctx.track(() => guardDisabledClicks(ctx.el, () => !!ctx.disabled()));

        function toggle() {
            if (ctx.disabled()) return;
            // `pressed` is the live state and the model: a click writes it, so the button does not
            // depend on a parent binding the event back. In a group, the group's value then rewrites
            // every child's `pressed`.
            ctx.pressed.set(!ctx.pressed());
        }

        ctx.track(() => {
            ctx.state('pressed', !!ctx.pressed());
            ctx.state('disabled', !!ctx.disabled());
        });

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                ctx.pressed.set(false);
            },
        });

        return { toggle };
    },
    render: (ctx) => html`
        <button
            type="button"
            class="pdx-toggle-btn"
            data-part="root"
            :size="${ctx.size}"
            :role="${() => ctx.radio() ? 'radio' : null}"
            :aria-pressed="${() => ctx.radio() ? null : ctx.pressed() ? 'true' : 'false'}"
            :aria-checked="${() => ctx.radio() ? (ctx.pressed() ? 'true' : 'false') : null}"
            :aria-label="${() => (ctx.ariaLabel() as string) || null}"
            :disabled="${ctx.disabled}"
            :data-state="${() => ctx.pressed() ? 'on' : 'off'}"
            @click="${ctx.toggle}"
        >
            <slot></slot>
        </button>
    `,
});

// ─── Toggle Group ───

/**
 * A set of toggle buttons that share one value, keeping at most one pressed or any number as a
 * comma-separated value, with the arrow keys moving between them.
 *
 * @cssstate disabled - `disabled` is set; the group is aria-disabled and every toggle disabled.
 *
 * @alphaevent pdx-change
 * @alphaevent valuechange
 * @alphadetail value $event.detail.value
 * @alphadetail values $event.detail.value.split(',').filter(Boolean)
 */
component('pdx-toggle-group', {
    models: {
        /** The pressed toggles' values: one for `single`, comma-separated for `multiple`. A form submits
         *  one entry per value, and resets it (#135). A press writes it, and the write dispatches
         *  `value-change`. */
        value: model('', { form: true }),
    },
    // On the host as a custom state (#132).
    states: ['disabled'],
    // Its layout axis (#286), reflected on the host, where toggle.css joins the toggles in a column;
    // no class for it.
    variants: {
        /** horizontal (the default) or vertical: the toggles joined in a row or a column. */
        orientation: ['horizontal', 'vertical'],
    },
    props: {
        type: prop('single'),
        disabled: prop(false),
        /** Passed to every toggle. */
        variant: prop('outline'),
        /** Passed to every toggle. */
        size: prop(''),
        loop: prop(true),
        label: prop(''),
    },
    setup(ctx) {
        function getValues(): string[] {
            const v = ctx.value() as string;
            if (!v) return [];
            return ctx.type() === 'multiple' ? v.split(',').filter(Boolean) : [v];
        }

        function isPressed(val: string): boolean {
            return getValues().includes(val);
        }

        function handleToggle(val: string) {
            if (ctx.disabled()) return;
            const isSingle = ctx.type() !== 'multiple';
            let nextValues: string[];

            if (isSingle) {
                // Single mode: select this value (can deselect by clicking again)
                nextValues = isPressed(val) ? [] : [val];
            } else {
                // Multiple mode: toggle this value in the set
                const current = getValues();
                nextValues = current.includes(val)
                    ? current.filter(v => v !== val)
                    : [...current, val];
            }

            ctx.value.set(isSingle ? (nextValues[0] || '') : nextValues.join(','));
        }

        // Wire child toggles. One ARIA pattern per type, in full: `single` is an APG radio group — each
        // toggle a radio (its `radio` prop), the tab stop on the checked one or else the first enabled;
        // `multiple` is a group of aria-pressed toggle buttons, each in the tab order.
        ctx.track(() => {
            const el = ctx.el;
            const vals = getValues();
            const dis = ctx.disabled();
            const variant = ctx.variant() as string;
            const size = ctx.size() as string;
            const single = ctx.type() !== 'multiple';

            requestAnimationFrame(() => {
                const toggles = Array.from(el.querySelectorAll('pdx-toggle'));
                for (const t of toggles) {
                    const tVal = t.getAttribute('value') || '';
                    // Set pressed state
                    if (vals.includes(tVal)) {
                        t.setAttribute('pressed', '');
                    } else {
                        t.removeAttribute('pressed');
                    }
                    // Propagate disabled, variant, size, and the radio role of a single group
                    if (dis) t.setAttribute('disabled', '');
                    if (variant) t.setAttribute('variant', variant);
                    if (size) t.setAttribute('size', size);
                    t.toggleAttribute('radio', single);
                }
                const enabled = toggles.filter((t) => !t.hasAttribute('disabled'));
                const stop = single ? (enabled.find((t) => vals.includes(t.getAttribute('value') || '')) ?? enabled[0]) : undefined;
                for (const t of toggles) {
                    const btn = t.querySelector('button');
                    if (!btn) continue;
                    if (single) btn.tabIndex = t === stop ? 0 : -1;
                    else btn.removeAttribute('tabindex');
                }
            });
        });

        // Listen for child toggle events: their model's, `pressed-change` (#480). A toggle's event stays
        // on it (#138), so the group hears it on the way down, in the capture phase, which passes
        // through the host whether or not it bubbles.
        ctx.track(() => {
            const el = ctx.el;
            function onChildToggle(e: Event) {
                const toggle = (e.target as HTMLElement).closest('pdx-toggle');
                if (!toggle || toggle === el) return;
                const val = toggle.getAttribute('value') || '';
                if (val) handleToggle(val);
            }
            el.addEventListener('pressed-change', onChildToggle, true);
            return () => el.removeEventListener('pressed-change', onChildToggle, true);
        });

        // Keyboard navigation (roving tabindex)
        function onKeydown(e: KeyboardEvent) {
            if (ctx.disabled()) return;
            const el = ctx.el;
            const isVert = ctx.orientation() === 'vertical';
            const items = el.querySelectorAll('pdx-toggle:not([disabled])') as NodeListOf<HTMLElement>;
            if (!items.length) return;

            const focused = el.querySelector('pdx-toggle button:focus')?.closest('pdx-toggle') as HTMLElement;
            const idx = focused ? Array.from(items).indexOf(focused) : -1;
            let next = idx;

            switch (e.key) {
                case 'ArrowRight': case 'ArrowDown':
                    if ((!isVert && e.key === 'ArrowRight') || (isVert && e.key === 'ArrowDown')) {
                        next = ctx.loop() ? (idx + 1) % items.length : Math.min(idx + 1, items.length - 1);
                        e.preventDefault();
                    }
                    break;
                case 'ArrowLeft': case 'ArrowUp':
                    if ((!isVert && e.key === 'ArrowLeft') || (isVert && e.key === 'ArrowUp')) {
                        next = ctx.loop() ? (idx - 1 + items.length) % items.length : Math.max(idx - 1, 0);
                        e.preventDefault();
                    }
                    break;
                case 'Home':
                    next = 0; e.preventDefault(); break;
                case 'End':
                    next = items.length - 1; e.preventDefault(); break;
                default: return;
            }
            if (next !== idx && items[next]) {
                const btn = items[next].querySelector('button') as HTMLElement;
                btn?.focus();
                // In a radio group the arrows select what they reach, through the path a click takes.
                // Whether it is chosen is the group's value, written now: the toggle's `pressed`
                // attribute follows it a frame later, and keys can come faster than frames.
                if (ctx.type() !== 'multiple' && !isPressed(items[next].getAttribute('value') || '')) btn?.click();
            }
        }

        ctx.track(() => { ctx.state('disabled', !!ctx.disabled()); });

        // Its own class only, via classList: the author's classes survive. The joined row; the
        // orientation is the host's attribute.
        ctx.el.classList.add('pdx-toggle-group');

        // One entry per pressed toggle, or none.
        ctx.formValue?.(() => getValues());

        return { onKeydown };
    },
    // Its role, ARIA and keys (#133): a `radiogroup` for `single`, a `group` for `multiple`.
    // aria-orientation only on the radiogroup: a `group` may not carry it (axe's aria-allowed-attr).
    // Written after `setup`, so its type is read.
    host: {
        ':role': (ctx) => ctx.type() === 'multiple' ? 'group' : 'radiogroup',
        ':aria-orientation': (ctx) => ctx.type() === 'multiple' ? null : ctx.orientation(),
        ':aria-label': (ctx) => (ctx.label() as string) || null,
        ':aria-disabled': (ctx) => ctx.disabled() ? 'true' : null,
        '@keydown': (ctx, e) => ctx.onKeydown(e as KeyboardEvent),
    },
    render: () => html`<slot></slot>`,
});
