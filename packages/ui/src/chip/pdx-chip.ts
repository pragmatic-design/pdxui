// pdx-chip — Selectable, removable tag/chip component.
// Maps to .pdx-chip CSS classes. Supports: variants (outline, tonal),
// removable with value context, selectable toggle, avatar slot, disabled.
//
// Interactive parts only. A plain chip is text: no role, no tab stop, no ARIA. A
// selectable chip is a toggle button — role="button", aria-pressed, Enter and Space toggle it and
// write the `selected` model, which announces `selected-change`. A removable chip's one tab stop is its ×, named "Remove {label}".
// Selectable + removable: the toggle is the .pdx-chip-body and the × its sibling, inside a
// non-interactive pill, so no button nests in a button. Disabled goes where it is read: on the
// toggle, and as `disabled` on the ×. After a removal the app owns focus.

import { component, html, signal, model, event } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/chip';

/**
 * A small tag that can be selectable or removable, with variants, an avatar and group support.
 *
 * @slot icon - An icon shown before the chip's label.
 *
 * @csspart root - The chip, the pill drawn; the variants key by it.
 * @csspart body - Its label, avatar and icon; the toggle when the chip is also removable.
 * @csspart remove - The × button, with `removable`.
 *
 * @cssstate selected - It is selected.
 * @cssstate disabled - `disabled` is set.
 *
 * @alphaevent pdx-toggle
 * @alphadetail selected $event.detail.value
 * @alphadetail value $event.currentTarget.value
 */
component('pdx-chip', {
    // A click writes it (#291): `selected-change` `{ value }`, in place of `pdx-toggle`.
    models: {
        selected: model(false),
    },
    events: {
        /** The × was pressed: the chip's value (its label when it has none) and its label. */
        'pdx-remove': event<{ value: string; label: string }>(),
    },
    // On the host as custom states (#132); the pill keeps only the CSS-only chip's class.
    states: ['selected', 'disabled'],
    parts: ['root', 'body', 'remove'],
    // The axes chip.css keys by (#630), reflected on the host; each value maps the class that draws the
    // same look on a native chip. `outline` and `md` are the base look, which no class adds to.
    variants: {
        /** outline (the default), primary, success, danger, warning, info, tonal, or tonal with a colour. */
        variant: {
            outline: '.pdx-chip-outline', primary: '.pdx-chip-primary', success: '.pdx-chip-success',
            danger: '.pdx-chip-danger', warning: '.pdx-chip-warning', info: '.pdx-chip-info', tonal: '.pdx-chip-tonal',
            'tonal-primary': '.pdx-chip-tonal-primary', 'tonal-success': '.pdx-chip-tonal-success',
            'tonal-danger': '.pdx-chip-tonal-danger', 'tonal-warning': '.pdx-chip-tonal-warning',
        },
        /** sm, md (the default) or lg. */
        size: { md: '.pdx-chip-md', sm: '.pdx-chip-sm', lg: '.pdx-chip-lg' },
    },
    props: {
        label: { type: String, default: '' },
        /**
         * Shows a × button — the chip's tab stop — named "Remove {label}", which emits pdx-remove. The
         * chip does not remove itself: the app removes it and owns focus afterwards (move it to the
         * next chip's ×, or the previous one), or a keyboard user is left on <body>.
         */
        removable: { type: Boolean, default: false },
        /** A toggle button (role="button", aria-pressed): click, Enter or Space flips the `selected` model. */
        selectable: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        /** Value passed in the remove event's detail for identification. */
        value: { type: String, default: '' },
        /** Avatar URL — renders a small circle image before the label. */
        avatar: { type: String, default: '' },
    },
    setup(ctx) {
        ctx.track(() => {
            ctx.state('selected', !!ctx.selected());
            ctx.state('disabled', !!ctx.disabled());
        });

        function onRemove(e: Event) {
            e.stopPropagation();
            if (ctx.disabled()) return;
            const label = ctx.label() as string;
            ctx.emit('pdx-remove', { value: (ctx.value() as string) || label || '', label });
        }

        // The user's write of the model: it announces `selected-change` `{ value }`.
        function toggle() {
            if (ctx.disabled() || !ctx.selectable()) return;
            ctx.selected.set(!ctx.selected());
        }

        /** Enter and Space press the toggle \u2014 whichever element carries role="button". */
        function onKeydown(e: KeyboardEvent) {
            if ((e.currentTarget as Element).getAttribute('role') !== 'button' || e.target !== e.currentTarget) return;
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggle();
        }

        // Where the toggle's role lives: on the pill when the chip is only selectable, on its body
        // when a \u00d7 sits beside it.
        const toggleOnPill = () => !!ctx.selectable() && !ctx.removable();
        const toggleOnBody = () => !!ctx.selectable() && !!ctx.removable();

        // The \u00d7 is named after what it removes: the label, else the chip's text, else its value. The
        // text is read after the slot content has been projected.
        const text = signal('');
        ctx.track(() => {
            void ctx.label();
            requestAnimationFrame(() => text.set((ctx.el.querySelector('.pdx-chip-body')?.textContent ?? '').trim()));
        });
        function removeName(): string {
            const what = (ctx.label() as string) || text() || (ctx.value() as string) || '';
            return format(uiString('chip', 'remove'), { label: what }).trim();
        }

        return { onRemove, toggle, onKeydown, toggleOnPill, toggleOnBody, removeName };
    },
    render: (ctx) => html`
        <span
            class="pdx-chip"
            data-part="root"
            @click="${ctx.toggle}"
            @keydown="${ctx.onKeydown}"
            :role="${() => ctx.toggleOnPill() ? 'button' : null}"
            :tabindex="${() => ctx.toggleOnPill() ? (ctx.disabled() ? '-1' : '0') : null}"
            :aria-pressed="${() => ctx.toggleOnPill() ? String(!!ctx.selected()) : null}"
            :aria-disabled="${() => ctx.toggleOnPill() && ctx.disabled() ? 'true' : null}"
        >
            <span
                class="pdx-chip-body"
                data-part="body"
                @keydown="${ctx.onKeydown}"
                :role="${() => ctx.toggleOnBody() ? 'button' : null}"
                :tabindex="${() => ctx.toggleOnBody() ? (ctx.disabled() ? '-1' : '0') : null}"
                :aria-pressed="${() => ctx.toggleOnBody() ? String(!!ctx.selected()) : null}"
                :aria-disabled="${() => ctx.toggleOnBody() && ctx.disabled() ? 'true' : null}"
            >
                ${() => ctx.avatar() ? html`<img class="pdx-chip-icon" src="${ctx.avatar}" alt="" />` : ''}
                <slot name="icon"></slot>
                ${() => ctx.label() || html`<slot></slot>`}
            </span>
            ${() => ctx.removable()
                ? html`<button type="button" class="pdx-chip-remove" data-part="remove" :disabled="${ctx.disabled}" :aria-label="${ctx.removeName}" @click="${ctx.onRemove}">\u00d7</button>`
                : ''}
        </span>
    `,
});
