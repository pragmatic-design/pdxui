// pdx-banner — Inline alert/banner with variants, closable, action, auto-dismiss.
// Uses Pragmatic CSS .pdx-banner classes. Icon auto-matched to variant.

import { component, html, getFocusableElements, event } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/banner';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else
// The icons it draws whatever its data, on the page with it rather than loaded a frame late (#47).
import { defineIcons } from '../icon/icon-map';
import iconInfo from '../icon/pragmatic/info';
import iconCheckCircle from '../icon/pragmatic/check-circle';
import iconAlertTriangle from '../icon/pragmatic/alert-triangle';
import iconAlertCircle from '../icon/pragmatic/alert-circle';
defineIcons({ info: iconInfo, 'check-circle': iconCheckCircle, 'alert-triangle': iconAlertTriangle, 'alert-circle': iconAlertCircle });

const VARIANT_ICONS: Record<string, string> = {
    info: 'info',
    success: 'check-circle',
    warning: 'alert-triangle',
    danger: 'alert-circle',
    error: 'alert-circle',
};

/**
 * An inline alert banner with an icon matched to its variant and slots for actions, which the user
 * can close or which dismisses itself.
 *
 * @cssstate dismissed - Closed, by its button, `dismiss()` or its auto-dismiss: banner.css hides it.
 * @csspart root - The banner (`role="alert"` for danger and error, `role="status"` otherwise).
 * @csspart icon - The icon matched to the variant, with `show-icon`.
 * @csspart message - The banner's text, its default slot.
 * @csspart close - The close button, with `closable`.
 */
component('pdx-banner', {
    events: {
        /** The banner was closed: by its button, `dismiss()` or its auto-dismiss. */
        'pdx-close': event<void>(),
    },
    states: ['dismissed'],
    parts: ['root', 'icon', 'message', 'close'],
    // The axis banner.css keys by (#631), reflected on the host; each value maps the class that draws
    // the same banner on native markup. `error` is `danger`'s other name, and shares its class.
    variants: {
        /** info (the default), success, warning, danger, or error (danger). */
        variant: { info: '.pdx-banner-info', success: '.pdx-banner-success', warning: '.pdx-banner-warning', danger: '.pdx-banner-danger', error: '.pdx-banner-danger' },
    },
    props: {
        closable: { type: Boolean, default: false },
        autoDismiss: { type: Number, default: 0 },
        showIcon: { type: Boolean, default: true },
        subtle: { type: Boolean, default: false },
    },
    setup(ctx) {
        let dismissTimer: ReturnType<typeof setTimeout> | null = null;
        /** Closed, and so the host's :state(dismissed). */
        let dismissed = false;

        function close() {
            // Focus inside the banner would fall to <body> once it hides — a keyboard user closing it
            // with Enter would be sent to the top of the page. It moves to what follows the
            // banner, or to what precedes it when nothing does.
            const hadFocus = ctx.el.contains(document.activeElement);
            const around = hadFocus
                ? getFocusableElements(document.body).filter((el) => !ctx.el.contains(el) && !el.closest('[hidden],[inert]'))
                : [];
            // Dismissed is the host's state (#291); banner.css hides it, and with it its alert (A4).
            dismissed = true;
            ctx.state('dismissed', true);
            // Declared, so it does not bubble; said again for the library's guard on this name.
            ctx.emit('pdx-close', undefined, { bubbles: false });
            if (!hadFocus) return;
            const follows = (el: Element) => Boolean(ctx.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
            const next = around.find(follows) ?? around.filter((el) => !follows(el)).pop();
            next?.focus();
        }

        /** Starts the auto-dismiss countdown over, when there is one. */
        function startDismissTimer() {
            if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
            const ms = ctx.autoDismiss() as number;
            if (ms > 0) dismissTimer = setTimeout(close, ms);
        }

        // Shown again, an auto-dismissing banner counts again: a timer run once, from mount, would
        // leave a banner put back with show() there for good.
        function show() {
            dismissed = false;
            ctx.state('dismissed', false);
            startDismissTimer();
        }

        // Imperative API — no prop named dismiss/show/isVisible, so no shadowing.
        ctx.expose({
            /** Hide the banner and emit `pdx-close`, moving focus out of it first. */
            dismiss: close,
            show,
            get isVisible() { return !dismissed; },
        });

        function bannerClass(): string {
            let cls = 'pdx-banner';
            if (ctx.subtle()) cls += ' pdx-banner-subtle';
            return cls;
        }

        function iconName(): string {
            const v = ctx.variant() as string;
            return VARIANT_ICONS[v] || 'info';
        }

        // Auto-dismiss + imperative close wiring
        ctx.track(() => {
            startDismissTimer();

            // Wire close button imperatively (more reliable than template @click in conditional)
            requestAnimationFrame(() => {
                const closeBtn = ctx.el.querySelector('.pdx-banner-close') as HTMLElement;
                if (closeBtn) closeBtn.onclick = close;
            });

            return () => {
                if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
            };
        });

        return { bannerClass, iconName };
    },
    render: (ctx) => html`
        <div :class="${ctx.bannerClass}" data-part="root" role="${() => (ctx.variant() as string) === 'danger' || (ctx.variant() as string) === 'error' ? 'alert' : 'status'}">
            ${() => ctx.showIcon() ? html`<pdx-icon :name="${ctx.iconName}" size="sm" class="pdx-banner-icon" data-part="icon"></pdx-icon>` : ''}
            <span class="pdx-banner-text" data-part="message"><slot></slot></span>
            ${() => ctx.closable() ? html`
                <button class="pdx-banner-close" data-part="close" type="button" :aria-label="${() => uiString('banner', 'close')}">\u00d7</button>
            ` : ''}
        </div>
    `,
});
