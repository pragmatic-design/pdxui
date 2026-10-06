// pdx-timeline — Vertical or horizontal sequence of events.
// Uses a single continuous connector line with dots overlaid.
// Supports: left/right/alternate/horizontal mode, status colors,
// icons, pending state, clickable items, connector styles.

import { component, html } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/timeline';
/** `pdx-icon` the first time an event names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

export interface TimelineItem {
    title: string;
    description?: string;
    date?: string;
    icon?: string;
    color?: string;
    status?: 'default' | 'success' | 'warning' | 'error' | 'info';
    /** What the status means here ("Completed", "Current"), read out in place of the dot's colour.
     *  Empty: the timeline.{status} component string. */
    statusLabel?: string;
}

const STATUS_CLASS: Record<string, string> = {
    success: 'pdx-tl-success',
    warning: 'pdx-tl-warning',
    error: 'pdx-tl-error',
    info: 'pdx-tl-info',
};

/**
 * A vertical or horizontal sequence of events, with status colors, icons and clickable items.
 *
 * @slot content - Scoped — renders the content of one entry. Receives `{ item, index, status }` (`status` is `'default'` when unset).
 */
component('pdx-timeline', {
    props: {
        items: { type: Array, default: [] },
        mode: { type: String, default: 'left' },
        reverse: { type: Boolean, default: false },
        pending: { type: Boolean, default: false },
        /** The pending row's text. Empty: the timeline.pending component string. */
        pendingLabel: { type: String, default: '' },
        clickable: { type: Boolean, default: false },
        connectorStyle: { type: String, default: 'solid' },
        /** Dot vertical alignment relative to content: 'start' | 'center' | 'end' */
        dotAlign: { type: String, default: 'start' },
    },
    setup(ctx) {
        let _built = false;
        let _containerEl: HTMLElement | null = null;

        /** The pending row's text: pendingLabel, else timeline.pending. */
        const pendingText = (): string => (ctx.pendingLabel() as string) || uiString('timeline', 'pending');

        function getContentSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['content'] as SlotFunction | undefined;
        }

        function renderTimeline(): void {
            if (!_containerEl) return;
            _containerEl.innerHTML = '';

            const rawItems = (ctx.items() as TimelineItem[]) || [];
            const shouldReverse = ctx.reverse() as boolean;
            const items = shouldReverse ? [...rawItems].reverse() : rawItems;
            const showPending = ctx.pending() as boolean;
            const pendingLabel = pendingText();
            const mode = ctx.mode() as string;
            const isClickable = ctx.clickable() as boolean;
            const connStyle = ctx.connectorStyle() as string;

            // Mode classes
            _containerEl.className = 'pdx-tl';
            if (mode === 'horizontal') _containerEl.classList.add('pdx-tl-horizontal');
            else if (mode === 'alternate') _containerEl.classList.add('pdx-tl-alternate');
            else if (mode === 'right') _containerEl.classList.add('pdx-tl-right');
            if (connStyle !== 'solid') _containerEl.classList.add('pdx-tl-conn-' + connStyle);
            const dotAlign = ctx.dotAlign() as string;
            if (dotAlign === 'center') _containerEl.classList.add('pdx-tl-dot-center');
            else if (dotAlign === 'end') _containerEl.classList.add('pdx-tl-dot-end');

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const isLast = i === items.length - 1 && !showPending;

                const itemEl = document.createElement('li');
                itemEl.className = 'pdx-tl-item';
                if (isLast) itemEl.classList.add('pdx-tl-item-last');

                // Status
                const statusCls = item.status ? STATUS_CLASS[item.status] : '';
                if (statusCls) itemEl.classList.add(statusCls);

                // Alternate side
                if (mode === 'alternate') {
                    itemEl.classList.add(i % 2 === 0 ? 'pdx-tl-left' : 'pdx-tl-right-item');
                }

                // Clickable
                if (isClickable) {
                    itemEl.classList.add('pdx-tl-clickable');
                    itemEl.setAttribute('tabindex', '0');
                    const idx = i;
                    const handleClick = () => ctx.emit('pdx-click', { item, index: idx });
                    itemEl.addEventListener('click', handleClick);
                    itemEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
                    });
                }

                // Track column: line + dot
                const trackEl = document.createElement('div');
                trackEl.className = 'pdx-tl-track';

                const lineEl = document.createElement('div');
                lineEl.className = 'pdx-tl-line';
                if (isLast) lineEl.classList.add('pdx-tl-line-last');
                trackEl.appendChild(lineEl);

                const dotEl = document.createElement('div');
                dotEl.className = 'pdx-tl-dot';
                if (item.color) {
                    dotEl.style.borderColor = item.color;
                    dotEl.style.background = item.color;
                }
                if (item.icon) {
                    dotEl.classList.add('pdx-tl-dot-icon');
                    loadIcon();
                    const iconEl = document.createElement('pdx-icon');
                    iconEl.setAttribute('name', item.icon);
                    iconEl.setAttribute('size', '14');
                    if (item.color) iconEl.style.color = '#fff';
                    else iconEl.style.color = 'var(--pdx-color-text)';
                    dotEl.appendChild(iconEl);
                }
                trackEl.appendChild(dotEl);
                itemEl.appendChild(trackEl);

                // Content: slot > default
                const contentEl = document.createElement('div');
                contentEl.className = 'pdx-tl-content';

                const contentSlot = getContentSlot();
                if (contentSlot) {
                    const slotContent = contentSlot({ item, index: i, status: item.status || 'default' });
                    contentEl.appendChild(slotContent instanceof DocumentFragment ? slotContent : slotContent);
                } else {
                    const titleEl = document.createElement('div');
                    titleEl.className = 'pdx-tl-title';
                    titleEl.textContent = item.title;
                    contentEl.appendChild(titleEl);

                    if (item.description) {
                        const descEl = document.createElement('div');
                        descEl.className = 'pdx-tl-desc';
                        descEl.textContent = item.description;
                        contentEl.appendChild(descEl);
                    }
                    if (item.date) {
                        const dateEl = document.createElement('div');
                        dateEl.className = 'pdx-tl-date';
                        dateEl.textContent = item.date;
                        contentEl.appendChild(dateEl);
                    }
                }

                // The status in words, not only the dot's colour and icon.
                const statusText = item.statusLabel
                    || (item.status && item.status !== 'default' ? uiString('timeline', item.status) : '');
                if (statusText) {
                    const sr = document.createElement('span');
                    sr.className = 'pdx-sr-only';
                    sr.textContent = statusText;
                    contentEl.appendChild(sr);
                }

                itemEl.appendChild(contentEl);
                _containerEl.appendChild(itemEl);
            }

            // Pending item
            if (showPending) {
                const pendEl = document.createElement('li');
                pendEl.className = 'pdx-tl-item pdx-tl-item-last';

                const trackEl = document.createElement('div');
                trackEl.className = 'pdx-tl-track';
                const lineEl = document.createElement('div');
                lineEl.className = 'pdx-tl-line pdx-tl-line-last';
                trackEl.appendChild(lineEl);
                const dotEl = document.createElement('div');
                dotEl.className = 'pdx-tl-dot pdx-tl-dot-pending';
                trackEl.appendChild(dotEl);
                pendEl.appendChild(trackEl);

                const contentEl = document.createElement('div');
                contentEl.className = 'pdx-tl-content';
                const labelEl = document.createElement('div');
                labelEl.className = 'pdx-tl-title pdx-ink-muted';
                labelEl.textContent = pendingLabel;
                contentEl.appendChild(labelEl);
                pendEl.appendChild(contentEl);
                _containerEl.appendChild(pendEl);
            }
        }

        ctx.track(() => {
            void ctx.items();
            void ctx.mode();
            void ctx.reverse();
            void ctx.pending();
            void pendingText();
            void ctx.clickable();
            void ctx.connectorStyle();
            void ctx.dotAlign();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-tl-root');
                    // An ordered list: the events are a sequence.
                    _containerEl = document.createElement('ol');
                    ctx.el.appendChild(_containerEl);
                    renderTimeline();
                });
                return;
            }
            requestAnimationFrame(() => renderTimeline());
        });

        return {};
    },
    render: () => html``,
});
