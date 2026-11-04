// pdx-timeline — Vertical or horizontal sequence of events.
// Uses a single continuous connector line with dots overlaid.
// Supports: left/right/alternate/horizontal mode, status colors,
// icons, pending state, clickable items, connector styles.

import { component, html, slot, declaredSnippet, event, prop } from '@pdxui/core';
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
 * @slot content - Renders the content of one entry: a snippet `content(item, index)`.
 *
 * @cssstate pending - `pending`: a last row says more is to come.
 * @cssstate clickable - `clickable`: each event is a tab stop, and a click or Enter emits `pdx-click`.
 *
 * @csspart list - The `<ol>` of events.
 * @csspart item - One event, an `<li>`.
 * @csspart track - The column of an event's line and dot.
 * @csspart line - The connector, drawn as the axis `connector-style` says.
 * @csspart dot - The event's dot, with its icon when it has one.
 * @csspart content - The event's text, or the `content` snippet.
 * @csspart title - The event's title.
 * @csspart description - The event's description.
 * @csspart date - The event's date.
 * @csspart pending - The pending row, while `pending`.
 */
component('pdx-timeline', {
    props: {
        items: prop<unknown[]>([]),
        reverse: prop(false),
        pending: prop(false),
        /** The pending row's text. Empty: the timeline.pending component string. */
        pendingLabel: prop(''),
        clickable: prop(false),
    },
    // Its looks are variant axes reflected on the host, where the design CSS draws them (#512); the two
    // of two words in kebab-case, `connector-style` and `dot-align` (#834).
    variants: {
        /** Where the events sit: beside the line, on the right of it, both sides in turn, or in a row. */
        mode: ['left', 'right', 'alternate', 'horizontal'],
        /** How the connector between the dots is drawn. */
        connectorStyle: ['solid', 'dashed', 'dotted'],
        /** Where a dot sits against its event's content. */
        dotAlign: ['start', 'center', 'end'],
    },
    events: {
        /** A clickable event was clicked, or pressed with Enter or Space. */
        'pdx-click': event<{ item: TimelineItem; index: number }>(),
    },
    states: ['pending', 'clickable'],
    parts: ['list', 'item', 'track', 'line', 'dot', 'content', 'title', 'description', 'date', 'pending'],
    // A parent's `@snippet` sets these, positional arguments; the alpha scoped slot is not read (#492).
    // The item a snippet receives is the app's, an element of `items` (#651): the editor infers `T`.
    generics: { T: { extends: '{ title: string }', from: 'items' } },
    slots: {
        content: slot<(item: T, index: number) => Node>(),
    },
    setup(ctx) {
        let _built = false;
        let _containerEl: HTMLElement | null = null;
        /** The events as rendered, reversed when `reverse` is: what the n-th row stands for. */
        let _shown: TimelineItem[] = [];

        /** The pending row's text: pendingLabel, else timeline.pending. */
        const pendingText = (): string => (ctx.pendingLabel() as string) || uiString('timeline', 'pending');

        function getContentSlot(): SlotFunction | undefined {
            return declaredSnippet(ctx, 'content', (s) => [s.item, s.index]);
        }

        function renderTimeline(): void {
            if (!_containerEl) return;
            _containerEl.innerHTML = '';

            const rawItems = (ctx.items() as TimelineItem[]) || [];
            const shouldReverse = ctx.reverse() as boolean;
            const items = shouldReverse ? [...rawItems].reverse() : rawItems;
            const showPending = ctx.pending() as boolean;
            const pendingLabel = pendingText();
            const isClickable = ctx.clickable() as boolean;
            // What a click on the n-th row stands for, read by the list's listener.
            _shown = items;

            // Its mode, connector and dot alignment are the host's variant axes, which the design CSS
            // reads: the list carries no class for them.
            _containerEl.className = 'pdx-tl';

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const isLast = i === items.length - 1 && !showPending;

                const itemEl = document.createElement('li');
                itemEl.className = 'pdx-tl-item';
                itemEl.dataset.part = 'item';
                itemEl.dataset.index = String(i);
                if (isLast) itemEl.classList.add('pdx-tl-item-last');

                // Status
                const statusCls = item.status ? STATUS_CLASS[item.status] : '';
                if (statusCls) itemEl.classList.add(statusCls);

                // A clickable event is a tab stop; its click and keys are the list's listeners.
                if (isClickable) itemEl.setAttribute('tabindex', '0');

                // Track column: line + dot
                const trackEl = document.createElement('div');
                trackEl.className = 'pdx-tl-track';
                trackEl.dataset.part = 'track';

                const lineEl = document.createElement('div');
                lineEl.className = 'pdx-tl-line';
                lineEl.dataset.part = 'line';
                if (isLast) lineEl.classList.add('pdx-tl-line-last');
                trackEl.appendChild(lineEl);

                const dotEl = document.createElement('div');
                dotEl.className = 'pdx-tl-dot';
                dotEl.dataset.part = 'dot';
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
                contentEl.dataset.part = 'content';

                const contentSlot = getContentSlot();
                if (contentSlot) {
                    const slotContent = contentSlot({ item, index: i });
                    contentEl.appendChild(slotContent instanceof DocumentFragment ? slotContent : slotContent);
                } else {
                    const titleEl = document.createElement('div');
                    titleEl.className = 'pdx-tl-title';
                    titleEl.dataset.part = 'title';
                    titleEl.textContent = item.title;
                    contentEl.appendChild(titleEl);

                    if (item.description) {
                        const descEl = document.createElement('div');
                        descEl.className = 'pdx-tl-desc';
                        descEl.dataset.part = 'description';
                        descEl.textContent = item.description;
                        contentEl.appendChild(descEl);
                    }
                    if (item.date) {
                        const dateEl = document.createElement('div');
                        dateEl.className = 'pdx-tl-date';
                        dateEl.dataset.part = 'date';
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
                pendEl.dataset.part = 'pending';

                const trackEl = document.createElement('div');
                trackEl.className = 'pdx-tl-track';
                trackEl.dataset.part = 'track';
                const lineEl = document.createElement('div');
                lineEl.className = 'pdx-tl-line pdx-tl-line-last';
                lineEl.dataset.part = 'line';
                trackEl.appendChild(lineEl);
                const dotEl = document.createElement('div');
                dotEl.className = 'pdx-tl-dot pdx-tl-dot-pending';
                dotEl.dataset.part = 'dot';
                trackEl.appendChild(dotEl);
                pendEl.appendChild(trackEl);

                const contentEl = document.createElement('div');
                contentEl.className = 'pdx-tl-content';
                contentEl.dataset.part = 'content';
                const labelEl = document.createElement('div');
                labelEl.className = 'pdx-tl-title pdx-ink-muted';
                labelEl.textContent = pendingLabel;
                contentEl.appendChild(labelEl);
                pendEl.appendChild(contentEl);
                _containerEl.appendChild(pendEl);
            }
        }

        /** The row an event of the list came from, and the item it stands for. */
        function rowOf(e: Event): { index: number; item: TimelineItem } | null {
            const row = (e.target as Element).closest?.('[data-part="item"]') as HTMLElement | null;
            if (!row || !_containerEl?.contains(row) || !ctx.clickable()) return null;
            const index = Number(row.dataset.index);
            const item = _shown[index];
            return item ? { index, item } : null;
        }

        // The conditions the host shows; its looks are the variant axes, reflected without help.
        ctx.track(() => {
            ctx.state('pending', !!ctx.pending());
            ctx.state('clickable', !!ctx.clickable());
        });

        ctx.track(() => {
            void ctx.items();
            void ctx.reverse();
            void ctx.pending();
            void pendingText();
            void ctx.clickable();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    // An ordered list: the events are a sequence.
                    _containerEl = document.createElement('ol');
                    _containerEl.dataset.part = 'list';
                    // One click and one keydown listener for every event (library.md, «Performance»).
                    _containerEl.addEventListener('click', (e) => {
                        const hit = rowOf(e);
                        if (hit) ctx.emit('pdx-click', hit);
                    });
                    _containerEl.addEventListener('keydown', (e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        const hit = rowOf(e);
                        if (!hit) return;
                        e.preventDefault();
                        ctx.emit('pdx-click', hit);
                    });
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

/** The item a snippet receives, the app's (#651): the editor infers it from `:items`. */
type T = { title: string };
