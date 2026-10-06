// pdx-card — Structured card with header/body/footer/media slots.
// Enhances Pragmatic CSS cards with: loading skeleton, clickable, selectable, link overlay.

import { component, html, sanitizeUrl } from '@pdxui/core';

/**
 * A structured card with header, body, footer and media slots, which can show a loading skeleton
 * and be clickable or selectable.
 */
component('pdx-card', {
    props: {
        /** Card variant: default, outline, elevated, flat */
        variant: { type: String, default: '' },
        /** Show loading skeleton state */
        loading: { type: Boolean, default: false },
        /** Make entire card clickable (emits pdx-click) */
        clickable: { type: Boolean, default: false },
        /** Hoverable elevation effect */
        hoverable: { type: Boolean, default: false },
        /** Horizontal layout (media + content side by side) */
        horizontal: { type: Boolean, default: false },
        /** Compact padding */
        compact: { type: Boolean, default: false },
        /** Selectable card (radio/checkbox style). On a clickable card, announced as pressed (`aria-pressed`). */
        selected: { type: Boolean, default: false },
        /** Disabled state */
        disabled: { type: Boolean, default: false },
        /**
         * Makes the card a link: it renders an `<a>` overlay across the card, so middle-click,
         * open-in-a-new-tab, copy-link-address and the status bar all work, and the address is in
         * the DOM. An interactive element inside the card stays clickable (it sits above the
         * overlay). The URL is sanitised before it is written.
         */
        href: { type: String, default: '' },
        /** Shadow elevation: 0 (none), 1 (sm), 2 (md), 3 (lg), 4 (xl) */
        elevation: { type: Number, default: -1 },
    },
    setup(ctx) {
        function rootClass(): string {
            let cls = 'pdx-surface pdx-surface-card';
            const v = ctx.variant() as string;
            if (v) cls += ' pdx-card-' + v;
            if (ctx.horizontal()) cls += ' pdx-card-horizontal';
            if (ctx.compact()) cls += ' pdx-card-compact';
            if (ctx.hoverable() || ctx.clickable() || ctx.href()) cls += ' pdx-card-hoverable';
            if (ctx.clickable() || ctx.href()) cls += ' pdx-card-clickable';
            if (ctx.selected()) cls += ' pdx-card-selected';
            if (ctx.disabled()) cls += ' pdx-card-disabled';
            if (ctx.loading()) cls += ' pdx-card-loading';
            const elev = ctx.elevation() as number;
            if (elev >= 0) cls += ' pdx-card-elevation-' + elev;
            return cls;
        }

        function onClick(e: Event) {
            if (ctx.disabled()) return;
            const href = ctx.href() as string;
            if (href) {
                // Don't navigate if clicking an interactive element inside
                const target = e.target as HTMLElement;
                if (target.closest('a, button, input, select, textarea')) return;
                // Never navigate to an unsafe URL (href may come from data → javascript:/data: = XSS).
                const safe = sanitizeUrl(href);
                if (safe) window.location.href = safe;
                return;
            }
            if (ctx.clickable()) {
                ctx.emit('pdx-click');
            }
        }

        /**
         * The keys go where the focus is — the host, which carries the role and the tab stop. On the
         * inner div a key on the focused host would never reach the listener, so Enter and Space would
         * do nothing, while Enter on a button inside the card would press the card too.
         * A link activates on Enter only; a button on Enter and Space.
         */
        function onKeydown(e: KeyboardEvent) {
            if (e.target !== ctx.el) return;
            if (!(ctx.clickable() || ctx.href()) || ctx.disabled()) return;
            const isLink = !!ctx.href();
            if (e.key === 'Enter' || (!isLink && e.key === ' ')) {
                e.preventDefault();
                onClick(e);
            }
        }

        /**
         * Click and keydown both live on the HOST, which is what carries the role and the tab
         * stop. On the inner div — the element a real pointer hits — `card.click()` on the host
         * would reach nothing and the card would look inert to anything driving it
         * programmatically. A pointer click still arrives: it bubbles
         * from whatever was hit up to here.
         */
        ctx.track(() => {
            const el = ctx.el;
            el.addEventListener('keydown', onKeydown);
            el.addEventListener('click', onClick);
            return () => {
                el.removeEventListener('keydown', onKeydown);
                el.removeEventListener('click', onClick);
            };
        });

        // Role, tab stop and state on the host. A disabled clickable card keeps its role and says
        // so (aria-disabled), out of the tab order; loading is aria-busy; a selected clickable card
        // is pressed.
        ctx.track(() => {
            const el = ctx.el;
            const isInteractive = !!(ctx.clickable() || ctx.href());
            const isLink = !!ctx.href();
            const disabled = !!ctx.disabled();
            const loading = !!ctx.loading();
            const selected = !!ctx.selected();
            requestAnimationFrame(() => {
                if (isInteractive) {
                    el.setAttribute('role', isLink ? 'link' : 'button');
                    if (disabled) el.removeAttribute('tabindex');
                    else el.setAttribute('tabindex', '0');
                } else {
                    el.removeAttribute('tabindex');
                    el.removeAttribute('role');
                }
                if (isInteractive && disabled) el.setAttribute('aria-disabled', 'true');
                else el.removeAttribute('aria-disabled');
                if (loading) el.setAttribute('aria-busy', 'true');
                else el.removeAttribute('aria-busy');
                if (isInteractive && !isLink && selected) el.setAttribute('aria-pressed', 'true');
                else el.removeAttribute('aria-pressed');
            });
        });

        /** The address the overlay carries, sanitised — an unsafe URL is never written to the DOM. */
        function safeHref(): string | null {
            const href = ctx.href() as string;
            return href ? sanitizeUrl(href) : null;
        }

        return { rootClass, onClick, safeHref };
    },
    render: (ctx) => html`
        <div :class="${ctx.rootClass}">
            ${() => ctx.safeHref() ? html`<a class="pdx-card-link" :href="${ctx.safeHref}" aria-hidden="true" tabindex="-1"></a>` : ''}
            ${() => ctx.loading() ? html`
                <div class="pdx-card-body">
                    <div class="pdx-skeleton" style="height:1rem;width:60%;margin-bottom:var(--pdx-space-sm)"></div>
                    <div class="pdx-skeleton" style="height:0.75rem;width:100%;margin-bottom:var(--pdx-space-xs)"></div>
                    <div class="pdx-skeleton" style="height:0.75rem;width:80%"></div>
                </div>
            ` : html`<slot></slot>`}
        </div>
    `,
});
