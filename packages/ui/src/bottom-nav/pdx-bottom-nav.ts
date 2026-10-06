// pdx-bottom-nav — Mobile bottom tab bar. Fixed at bottom, 3-5 items with icons.

import { component, html } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/bottom-nav';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else

export interface BottomNavItem {
    key: string;
    label: string;
    icon: string;
    badge?: string;
    badgeVariant?: 'default' | 'primary' | 'danger';
}

/**
 * A mobile tab bar fixed at the bottom of the screen, with three to five items that carry icons and
 * optional badges.
 */
component('pdx-bottom-nav', {
    props: {
        items: { type: Array, default: [] },
        activeKey: { type: String, default: '' },
    },
    setup(ctx) {
        let _built = false;

        ctx.track(() => {
            const items = ctx.items() as BottomNavItem[];
            const activeKey = ctx.activeKey() as string;

            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    ctx.el.classList.add('pdx-bottom-nav');
                    ctx.el.setAttribute('role', 'navigation');
                    uiAttr(ctx.el, 'aria-label', () => uiString('bottom-nav', 'label'));
                    buildItems(items, activeKey);
                });
                return;
            }

            requestAnimationFrame(() => buildItems(items, activeKey));
        });

        function buildItems(items: BottomNavItem[], activeKey: string): void {
            const bar = ctx.el.querySelector('.pdx-bottom-nav-bar') || document.createElement('div');
            bar.className = 'pdx-bottom-nav-bar';
            bar.innerHTML = '';

            for (const item of items) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-bottom-nav-item';
                if (item.key === activeKey) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-current', 'page'); // the active tab, exposed to screen readers
                }
                btn.setAttribute('data-nav-key', item.key);

                // Icon
                const iconWrap = document.createElement('span');
                iconWrap.className = 'pdx-bottom-nav-icon';
                const icon = document.createElement('pdx-icon');
                icon.setAttribute('name', item.icon);
                icon.setAttribute('size', '22');
                iconWrap.appendChild(icon);

                // Badge
                if (item.badge) {
                    const badge = document.createElement('span');
                    badge.className = 'pdx-bottom-nav-badge';
                    if (item.badgeVariant && item.badgeVariant !== 'default') {
                        badge.classList.add('pdx-bottom-nav-badge-' + item.badgeVariant);
                    }
                    badge.textContent = item.badge;
                    iconWrap.appendChild(badge);
                    // A named label, or the name reads the count glued to the label, "3Messages".
                    // Captured, not read in the closure: the count this name describes is the one
                    // rendered above it, and the narrowing from `if (item.badge)` does not survive
                    // a callback that runs again on a locale change.
                    const badgeText = item.badge;
                    uiAttr(btn, 'aria-label', () => format(uiString('bottom-nav', 'badge'), { label: item.label, badge: badgeText }));
                }

                btn.appendChild(iconWrap);

                // Label
                const label = document.createElement('span');
                label.className = 'pdx-bottom-nav-label';
                label.textContent = item.label;
                btn.appendChild(label);

                btn.addEventListener('click', () => {
                    ctx.emit('pdx-select', { key: item.key, item });
                });

                bar.appendChild(btn);
            }

            if (!ctx.el.contains(bar)) ctx.el.appendChild(bar);
        }

        return {};
    },
    render: () => html``,
});
