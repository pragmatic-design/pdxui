// pdx-sidebar — Collapsible sidebar container. Wraps pdx-nav-menu or any content.
// Supports: expanded/collapsed/mini modes, header/footer slots, responsive.

import { component, html } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/sidebar';

/**
 * A collapsible sidebar container for a pdx-nav-menu or any content, expanded, collapsed or mini
 * (icon-only).
 */
component('pdx-sidebar', {
    // The axis sidebar.css keys by (#633), reflected on the host and drawn from it; the host is the
    // element the old `.pdx-sidebar-right` class went on, so no native class is kept.
    variants: {
        /** The edge it sits on: left (the default) or right. */
        position: ['left', 'right'],
    },
    props: {
        /** Sidebar open/expanded state */
        open: { type: Boolean, default: true },
        /** Mini mode: show only icons when collapsed */
        mini: { type: Boolean, default: false },
        /** Width when expanded (px) */
        width: { type: Number, default: 260 },
        /** Width when collapsed/mini (px) */
        collapsedWidth: { type: Number, default: 60 },
    },
    setup(ctx) {
        let _built = false;

        ctx.track(() => {
            const open = ctx.open() as boolean;
            const mini = ctx.mini() as boolean;
            const width = ctx.width() as number;
            const collapsedWidth = ctx.collapsedWidth() as number;

            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    ctx.el.classList.add('pdx-sidebar');
                    ctx.el.setAttribute('role', 'complementary');
                    uiAttr(ctx.el, 'aria-label', () => uiString('sidebar', 'label'));
                });
            }

            requestAnimationFrame(() => {
                const el = ctx.el;
                el.classList.toggle('pdx-sidebar-open', open);
                el.classList.toggle('pdx-sidebar-collapsed', !open);
                el.classList.toggle('pdx-sidebar-mini', mini && !open);

                const currentWidth = open ? width : (mini ? collapsedWidth : 0);
                el.style.width = currentWidth + 'px';
                el.style.minWidth = currentWidth + 'px';

                // Propagate collapsed to inner pdx-nav-menu
                const navMenus = el.querySelectorAll('pdx-nav-menu');
                navMenus.forEach((nm: any) => {
                    if (nm.collapsed !== undefined) nm.collapsed = !open && mini;
                });
            });
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
