// pdx-banner — Inline alert/banner with variants, closable, action, auto-dismiss.
// Uses Pragmatic CSS .pdx-banner classes. Icon auto-matched to variant.

import { component, html, getFocusableElements } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/banner';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else

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
 */
component('pdx-banner', {
    props: {
        variant: { type: String, default: 'info' },
        closable: { type: Boolean, default: false },
        autoDismiss: { type: Number, default: 0 },
        showIcon: { type: Boolean, default: true },
        subtle: { type: Boolean, default: false },
    },
    setup(ctx) {
        let dismissTimer: ReturnType<typeof setTimeout> | null = null;

        function close() {
            // Focus inside the banner would fall to <body> once it hides — a keyboard user closing it
            // with Enter would be sent to the top of the page. It moves to what follows the
            // banner, or to what precedes it when nothing does.
            const hadFocus = ctx.el.contains(document.activeElement);
            const around = hadFocus
                ? getFocusableElements(document.body).filter((el) => !ctx.el.contains(el) && !el.closest('[hidden],[inert]'))
                : [];
            ctx.el.style.display = 'none';
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
            ctx.el.style.display = '';
            startDismissTimer();
        }

        // Imperative API — no prop named dismiss/show/isVisible, so no shadowing.
        ctx.expose({
            /** Hide the banner and emit `pdx-close`, moving focus out of it first. */
            dismiss: close,
            show,
            get isVisible() { return ctx.el.style.display !== 'none'; },
        });

        function bannerClass(): string {
            const v = ctx.variant() as string;
            let cls = 'pdx-banner pdx-banner-' + (v === 'error' ? 'danger' : v);
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
        <div :class="${ctx.bannerClass}" role="${() => (ctx.variant() as string) === 'danger' || (ctx.variant() as string) === 'error' ? 'alert' : 'status'}">
            ${() => ctx.showIcon() ? html`<pdx-icon :name="${ctx.iconName}" size="sm" class="pdx-banner-icon"></pdx-icon>` : ''}
            <span class="pdx-banner-text"><slot></slot></span>
            ${() => ctx.closable() ? html`
                <button class="pdx-banner-close" type="button" :aria-label="${() => uiString('banner', 'close')}">\u00d7</button>
            ` : ''}
        </div>
    `,
});
