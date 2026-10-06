// pdx-chip — Selectable, removable tag/chip component.
// Maps to .pdx-chip CSS classes. Supports: variants (outline, tonal),
// removable with value context, selectable toggle, avatar slot, disabled.
//
// Interactive parts only. A plain chip is text: no role, no tab stop, no ARIA. A
// selectable chip is a toggle button — role="button", aria-pressed, Enter and Space toggle it and
// write `selected` before pdx-toggle. A removable chip's one tab stop is its ×, named "Remove {label}".
// Selectable + removable: the toggle is the .pdx-chip-body and the × its sibling, inside a
// non-interactive pill, so no button nests in a button. Disabled goes where it is read: on the
// toggle, and as `disabled` on the ×. After a removal the app owns focus.

import { component, html, signal } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/chip';

/**
 * A small tag that can be selectable or removable, with variants, an avatar and group support.
 *
 * @slot icon - An icon shown before the chip's label.
 */
component('pdx-chip', {
    props: {
        label: { type: String, default: '' },
        variant: { type: String, default: '' },
        size: { type: String, default: '' },
        /**
         * Shows a × button — the chip's tab stop — named "Remove {label}", which emits pdx-remove. The
         * chip does not remove itself: the app removes it and owns focus afterwards (move it to the
         * next chip's ×, or the previous one), or a keyboard user is left on <body>.
         */
        removable: { type: Boolean, default: false },
        /** A toggle button (role="button", aria-pressed): click, Enter or Space flips `selected` and emits pdx-toggle. */
        selectable: { type: Boolean, default: false },
        /** Selected state. A user toggle writes it before pdx-toggle; a parent that sets it afterwards wins. */
        selected: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        /** Value passed in remove/toggle event detail for identification. */
        value: { type: String, default: '' },
        /** Avatar URL — renders a small circle image before the label. */
        avatar: { type: String, default: '' },
    },
    setup(ctx) {
        function cssClass(): string {
            let cls = 'pdx-chip';
            const v = ctx.variant() as string;
            if (v) cls += ' pdx-chip-' + v;
            const s = ctx.size() as string;
            if (s) cls += ' pdx-chip-' + s;
            if (ctx.selected()) cls += ' selected';
            if (ctx.disabled()) cls += ' disabled';
            return cls;
        }

        function onRemove(e: Event) {
            e.stopPropagation();
            if (ctx.disabled()) return;
            const val = ctx.value() || ctx.label() || '';
            ctx.emit('pdx-remove', { value: val, label: ctx.label() });
        }

        function toggle() {
            if (ctx.disabled() || !ctx.selectable()) return;
            const next = !ctx.selected();
            setOwnProp(ctx.el, 'selected', next);
            const val = ctx.value() || ctx.label() || '';
            ctx.emit('pdx-toggle', { selected: next, value: val }, { bubbles: false });
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

        return { cssClass, onRemove, toggle, onKeydown, toggleOnPill, toggleOnBody, removeName };
    },
    render: (ctx) => html`
        <span
            :class="${ctx.cssClass}"
            @click="${ctx.toggle}"
            @keydown="${ctx.onKeydown}"
            :role="${() => ctx.toggleOnPill() ? 'button' : null}"
            :tabindex="${() => ctx.toggleOnPill() ? (ctx.disabled() ? '-1' : '0') : null}"
            :aria-pressed="${() => ctx.toggleOnPill() ? String(!!ctx.selected()) : null}"
            :aria-disabled="${() => ctx.toggleOnPill() && ctx.disabled() ? 'true' : null}"
        >
            <span
                class="pdx-chip-body"
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
                ? html`<button type="button" class="pdx-chip-remove" :disabled="${ctx.disabled}" :aria-label="${ctx.removeName}" @click="${ctx.onRemove}">\u00d7</button>`
                : ''}
        </span>
    `,
});
