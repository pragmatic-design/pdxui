// pdx-avatar-group — Stacked avatar group with overflow counter.
// Shows up to `max` avatars overlapping, with a +N badge for the rest.

import { component, html } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/avatar-group';
import '../avatar/pdx-avatar'; // rendered by this component, and registered by nobody else

/** Make `el` a named, focusable button: a click, Enter or Space all run `activate`. */
function makeButton(el: HTMLElement, name: string, activate: () => void): void {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', name);
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        activate();
    });
}

/**
 * Stacked, overlapping avatars, up to a maximum count, with an overflow counter for the rest.
 */
component('pdx-avatar-group', {
    props: {
        items: { type: Array, default: null },
        max: { type: Number, default: 5 },
        size: { type: String, default: 'md' },
        overlap: { type: Number, default: -8 },
        direction: { type: String, default: 'row' },
        /** Avatars and the +N become buttons: a click, Enter or Space fires pdx-click / pdx-overflow-click. */
        clickable: { type: Boolean, default: false },
        bordered: { type: Boolean, default: true },
    },
    setup(ctx) {
        let _built = false;
        let _containerEl: HTMLElement | null = null;

        function renderGroup(): void {
            if (!_containerEl) return;
            _containerEl.innerHTML = '';

            const allItems = (ctx.items() as any[] | null) || [];
            const maxCount = ctx.max() as number;
            const avatarSize = ctx.size() as string;
            const overlapPx = ctx.overlap() as number;
            const isClickable = ctx.clickable() as boolean;
            const isBordered = ctx.bordered() as boolean;
            const dir = ctx.direction() as string;
            const isReverse = dir === 'row-reverse';

            _containerEl.className = 'pdx-avatar-group';
            if (isReverse) _containerEl.classList.add('pdx-avatar-group-reverse');

            const visible = allItems.slice(0, maxCount);
            const overflow = allItems.length - maxCount;

            visible.forEach((item, idx) => {
                const avatar = document.createElement('pdx-avatar');
                if (item.name) avatar.setAttribute('alt', item.name);
                if (item.src) avatar.setAttribute('src', item.src);
                if (item.color) avatar.setAttribute('color', item.color);
                avatar.setAttribute('size', avatarSize);
                avatar.className = 'pdx-avatar-group-item';
                if (isBordered) avatar.classList.add('pdx-avatar-group-bordered');
                // First avatar on top, decreasing z-index for overlap stacking
                avatar.style.zIndex = String(visible.length + 1 - idx);

                // Overlap: first item has no negative margin
                if (idx > 0) {
                    if (isReverse) {
                        avatar.style.marginRight = overlapPx + 'px';
                    } else {
                        avatar.style.marginLeft = overlapPx + 'px';
                    }
                }

                if (isClickable) {
                    avatar.classList.add('pdx-avatar-group-clickable');
                    // A button, named by its person: a bare pdx-avatar has no role and no tab
                    // stop, and would be reachable by mouse only.
                    const fire = (): void => { ctx.emit('pdx-click', { item, index: idx }); };
                    makeButton(avatar, item.name || format(uiString('avatar-group', 'member'), { n: idx + 1 }), fire);
                }

                _containerEl!.appendChild(avatar);
            });

            if (overflow > 0) {
                const badge = document.createElement('div');
                badge.className = 'pdx-avatar-group-overflow pdx-avatar-group-item';
                if (isBordered) badge.classList.add('pdx-avatar-group-bordered');
                badge.classList.add('pdx-avatar-size-' + avatarSize);
                if (isReverse) {
                    badge.style.marginRight = overlapPx + 'px';
                } else {
                    badge.style.marginLeft = overlapPx + 'px';
                }
                badge.textContent = '+' + overflow;
                // "+3" alone says nothing about what it counts: it is named "3 more" —
                // a button when the group is clickable, an image otherwise.
                const moreName = format(uiString('avatar-group', 'more'), { count: overflow });
                const fireMore = (): void => {
                    ctx.emit('pdx-overflow-click', { count: overflow, items: allItems.slice(maxCount) });
                };
                if (isClickable) {
                    makeButton(badge, moreName, fireMore);
                } else {
                    badge.setAttribute('role', 'img');
                    badge.setAttribute('aria-label', moreName);
                    badge.addEventListener('click', fireMore);
                }
                _containerEl!.appendChild(badge);
            }
        }

        ctx.track(() => {
            // Read all signals to subscribe
            void ctx.items(); void ctx.max(); void ctx.size();
            void ctx.overlap(); void ctx.direction();
            void ctx.clickable(); void ctx.bordered();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-avatar-group-root');
                    _containerEl = document.createElement('div');
                    ctx.el.appendChild(_containerEl);
                    renderGroup();
                });
                return;
            }
            requestAnimationFrame(() => renderGroup());
        });

        return {};
    },
    render: () => html``,
});
