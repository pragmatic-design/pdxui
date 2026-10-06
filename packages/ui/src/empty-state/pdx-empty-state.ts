// pdx-empty-state — Placeholder for empty data views.
// Shows icon + title + description + optional action button.
// Used inside List, Table, DataGrid when data is empty.

import { component, html, onDestroy } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/empty-state';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else

/**
 * A placeholder for an empty data view: an icon, a title and a description, with an optional action
 * button.
 */
component('pdx-empty-state', {
    props: {
        /** Icon name */
        icon: { type: String, default: 'inbox' },
        /** Title text. Empty: the empty-state.title component string, «No data». */
        title: { type: String, default: '' },
        /** Description text */
        description: { type: String, default: '' },
        /** Action button label (empty = no button) */
        actionLabel: { type: String, default: '' },
        /** Icon size */
        iconSize: { type: Number, default: 48 },
        /** The title's heading level (1-6). Default 3: an empty state usually sits in a section
         *  whose own heading is level 2. */
        headingLevel: { type: Number, default: 3 },
    },
    setup(ctx) {
        let _built = false;
        // What the build appends to the host, next to the author's children. Core counts what
        // arrives there after mount as authored, so it is removed on destroy: left in place, a move
        // would put it back as children and the next mount would build a second copy beside it.
        const _own: Element[] = [];
        const own = (el: Element): void => { _own.push(el); ctx.el.appendChild(el); };
        onDestroy(() => { for (const el of _own.splice(0)) el.remove(); });

        ctx.track(() => {
            const iconName = ctx.icon() as string;
            // Read in the track, so a locale loaded later reaches it too.
            const titleText = (ctx.title() as string) || uiString('empty-state', 'title');
            const descText = ctx.description() as string;
            const actionText = ctx.actionLabel() as string;
            const iconSz = ctx.iconSize() as number;
            const level = String(Math.min(6, Math.max(1, Math.round(Number(ctx.headingLevel()) || 3))));

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-empty-state');

                    // Icon
                    if (iconName) {
                        const iconEl = document.createElement('pdx-icon');
                        iconEl.className = 'pdx-empty-state-icon';
                        iconEl.setAttribute('name', iconName);
                        iconEl.setAttribute('size', String(iconSz));
                        own(iconEl);
                    }

                    // Title. A heading: as plain text, a screen reader moving by headings would
                    // skip the one message the view has. A role, not an h*, so the
                    // theme's type styles and the page's own heading margins do not apply to it.
                    const titleEl = document.createElement('div');
                    titleEl.className = 'pdx-empty-state-title';
                    titleEl.setAttribute('role', 'heading');
                    titleEl.setAttribute('aria-level', level);
                    titleEl.textContent = titleText;
                    own(titleEl);

                    // Description
                    if (descText) {
                        const descEl = document.createElement('div');
                        descEl.className = 'pdx-empty-state-desc';
                        descEl.textContent = descText;
                        own(descEl);
                    }

                    // Action button
                    if (actionText) {
                        const btnEl = document.createElement('button');
                        btnEl.className = 'pdx-primary pdx-empty-state-action';
                        btnEl.setAttribute('size', 'sm');
                        btnEl.textContent = actionText;
                        btnEl.addEventListener('click', () => ctx.emit('pdx-action', {}));
                        own(btnEl);
                    }

                    // Slot for custom content
                    // (children passed by user are already in the element)
                });
                return;
            }

            // Update on prop changes — the icon and the action label too, or they would stay
            // inert after the mount
            requestAnimationFrame(() => {
                const titleEl = ctx.el.querySelector('.pdx-empty-state-title');
                if (titleEl) { titleEl.textContent = titleText; titleEl.setAttribute('aria-level', level); }
                const descEl = ctx.el.querySelector('.pdx-empty-state-desc');
                if (descEl) descEl.textContent = descText;
                const iconEl = ctx.el.querySelector('.pdx-empty-state-icon pdx-icon');
                if (iconEl && iconName) iconEl.setAttribute('name', iconName);
                const btnEl = ctx.el.querySelector('.pdx-empty-state-action');
                if (btnEl && actionText) btnEl.textContent = actionText;
            });
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
