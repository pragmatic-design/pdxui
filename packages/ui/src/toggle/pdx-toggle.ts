// pdx-toggle — Toggle button with pressed state + group support.
// Single: aria-pressed (on/off action). Group: single or multiple selection.
// Uses focusGroup from core for roving tabindex in group mode.
// Distinct from Segmented: toggle = action state (0..N), segmented = exclusive selection (1).

import { component, html, useFormAssociated } from '@pdxui/core';
import { guardDisabledClicks } from '../shared/disabled-click';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/toggle';

// ─── Single Toggle ───

/**
 * A button the user presses on and off, its state exposed with `aria-pressed`.
 */
component('pdx-toggle', {
    formAssociated: true,
    props: {
        pressed: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        value: { type: String, default: '' },
        variant: { type: String, default: 'outline' },
        size: { type: String, default: '' },
        /** The toggle's name when its content does not say it ("B" is Bold), forwarded to the inner `<button>`: `aria-label` on the host has no role to name. */
        ariaLabel: { type: String, default: '' },
    },
    setup(ctx) {
        // Disabled: the click stops at the host, before the app's @click.
        ctx.track(() => guardDisabledClicks(ctx.el, () => !!ctx.disabled()));

        function toggle() {
            if (ctx.disabled()) return;
            const next = !ctx.pressed();
            // `pressed` is the live state: a click writes it, so the button does not depend on a
            // parent binding the event back. In a group, the group's value then rewrites every
            // child's `pressed`.
            setOwnProp(ctx.el, 'pressed', next);
            // The event contract: the pdx- prefix. The legacy event stays as an alias.
            ctx.emit('pdx-pressed-change', { pressed: next });
            ctx.emit('pressedchange', { pressed: next });
        }

        function btnClass(): string {
            const v = ctx.variant() as string || 'outline';
            let cls = 'pdx-toggle-btn pdx-' + v;
            if (ctx.pressed()) cls += ' pdx-toggle-on';
            return cls;
        }

        useFormAssociated(ctx, { getFormValue: () => ctx.pressed() ? (ctx.value() as string || 'on') : null });

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                (ctx.el as any).pressed = false;
                ctx.emit('pdx-pressed-change', { pressed: false });
                ctx.emit('pressedchange', { pressed: false });
            },
        });

        return { toggle, btnClass };
    },
    render: (ctx: any) => html`
        <button
            type="button"
            :class="${ctx.btnClass}"
            :size="${ctx.size}"
            :aria-pressed="${() => ctx.pressed() ? 'true' : 'false'}"
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
 */
component('pdx-toggle-group', {
    props: {
        type: { type: String, default: 'single' },
        /** For single: string. For multiple: comma-separated string of values. */
        value: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        orientation: { type: String, default: 'horizontal' },
        variant: { type: String, default: 'outline' },
        size: { type: String, default: '' },
        loop: { type: Boolean, default: true },
        label: { type: String, default: '' },
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

            const nextStr = isSingle ? (nextValues[0] || '') : nextValues.join(',');
            setOwnProp(ctx.el, 'value', nextStr);
            ctx.emit('pdx-change', { value: nextStr, values: nextValues });
            ctx.emit('valuechange', { value: nextStr, values: nextValues });
        }

        // Wire child toggles
        ctx.track(() => {
            const el = ctx.el;
            const vals = getValues();
            const dis = ctx.disabled();
            const variant = ctx.variant() as string;
            const size = ctx.size() as string;

            requestAnimationFrame(() => {
                const toggles = el.querySelectorAll('pdx-toggle');
                for (const t of toggles) {
                    const tVal = t.getAttribute('value') || '';
                    // Set pressed state
                    if (vals.includes(tVal)) {
                        t.setAttribute('pressed', '');
                    } else {
                        t.removeAttribute('pressed');
                    }
                    // Propagate disabled, variant, size
                    if (dis) t.setAttribute('disabled', '');
                    if (variant) t.setAttribute('variant', variant);
                    if (size) t.setAttribute('size', size);
                }
            });
        });

        // Listen for child toggle events
        ctx.track(() => {
            const el = ctx.el;
            function onChildToggle(e: Event) {
                const toggle = (e.target as HTMLElement).closest('pdx-toggle');
                if (!toggle) return;
                const val = toggle.getAttribute('value') || '';
                if (val) {
                    e.stopPropagation();
                    handleToggle(val);
                }
            }
            el.addEventListener('pressedchange', onChildToggle);
            return () => el.removeEventListener('pressedchange', onChildToggle);
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
            }
        }

        function groupClass(): string {
            let cls = 'pdx-toggle-group';
            if (ctx.orientation() === 'vertical') cls += ' pdx-toggle-group-vertical';
            return cls;
        }

        return { groupClass, onKeydown };
    },
    render: (ctx: any) => html`
        <div
            :class="${ctx.groupClass}"
            role="group"
            :aria-label="${ctx.label}"
            :aria-orientation="${ctx.orientation}"
            :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
            @keydown="${ctx.onKeydown}"
        >
            <slot></slot>
        </div>
    `,
});
