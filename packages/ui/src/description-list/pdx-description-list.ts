// pdx-description-list — Key-value pair display component.
// Supports: horizontal/vertical layout, multi-column grid, bordered,
// striped rows, sizes (sm/md/lg), icons, colon after labels.
// Slot: "value" — custom value template (priority: slot > renderValue > default)
//
// Usage:
//   <pdx-description-list :items="${items}" columns="2">
//     <slot name="value" let:item let:index>
//       <a :href="${item.href}">${item.value}</a>
//     </slot>
//   </pdx-description-list>

import { component, html, repeatWithSlot } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/description-list';
/** `pdx-icon` the first time a term names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

export interface DescriptionListItem {
    label: string;
    value: string | HTMLElement;
    span?: number;
    icon?: string;
}

/**
 * Key-value pairs in a structured layout, horizontal or vertical and in one or more columns, with
 * values as plain text or custom HTML.
 *
 * @slot value - Scoped — renders the value of one entry. Receives `{ item, label, value, index }`.
 */
component('pdx-description-list', {
    props: {
        items: { type: Array, default: null },
        columns: { type: Number, default: 1 },
        layout: { type: String, default: 'horizontal' },
        bordered: { type: Boolean, default: false },
        striped: { type: Boolean, default: false },
        size: { type: String, default: 'md' },
        labelWidth: { type: String, default: 'auto' },
        colon: { type: Boolean, default: true },
        renderValue: { type: Object, default: null },
    },
    setup(ctx) {
        let built = false;
        let listEl: HTMLElement | null = null;

        // Read slot lazily (_projectSlots runs after setup)
        function getValueSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['value'] as SlotFunction | undefined;
        }

        function getItems(): DescriptionListItem[] {
            return (ctx.items() as DescriptionListItem[] | null) || [];
        }

        function defaultRenderItem(item: unknown, index: number): Node {
            const dlItem = item as DescriptionListItem;
            const layout = ctx.layout() as string;
            const size = ctx.size() as string;
            const labelW = ctx.labelWidth() as string;
            const renderValueFn = ctx.renderValue() as ((item: DescriptionListItem) => HTMLElement | null) | null;

            const itemEl = document.createElement('div');
            itemEl.className = 'pdx-dl-item';
            if (dlItem.span && dlItem.span > 1) {
                itemEl.style.gridColumn = `span ${dlItem.span}`;
            }

            // Label (dt)
            const dt = document.createElement('dt');
            dt.className = 'pdx-dl-label';
            if (layout === 'horizontal' && labelW !== 'auto') {
                dt.style.width = labelW;
                dt.style.minWidth = labelW;
            }
            if (dlItem.icon) {
                loadIcon();
                const iconEl = document.createElement('pdx-icon');
                iconEl.setAttribute('name', dlItem.icon);
                iconEl.setAttribute('size', size === 'sm' ? '14' : size === 'lg' ? '18' : '16');
                iconEl.className = 'pdx-dl-icon';
                dt.appendChild(iconEl);
            }
            const labelText = document.createElement('span');
            labelText.textContent = dlItem.label;
            dt.appendChild(labelText);
            itemEl.appendChild(dt);

            // Value (dd)
            const dd = document.createElement('dd');
            dd.className = 'pdx-dl-value';

            const valueSlot = getValueSlot();
            if (valueSlot) {
                const content = valueSlot({ item: dlItem, label: dlItem.label, value: dlItem.value, index });
                dd.appendChild(content instanceof DocumentFragment ? content : content);
            } else if (renderValueFn) {
                const customEl = renderValueFn(dlItem);
                if (customEl instanceof HTMLElement) {
                    dd.appendChild(customEl);
                } else {
                    dd.textContent = String(dlItem.value ?? '');
                }
            } else if (typeof dlItem.value === 'string') {
                dd.textContent = dlItem.value;
            } else if (dlItem.value instanceof HTMLElement) {
                dd.appendChild(dlItem.value);
            } else {
                dd.textContent = String(dlItem.value ?? '');
            }

            itemEl.appendChild(dd);
            return itemEl;
        }

        function buildList(): void {
            if (!listEl) return;

            const layout = ctx.layout() as string;
            const cols = ctx.columns() as number;
            const isBordered = ctx.bordered() as boolean;
            const isStriped = ctx.striped() as boolean;
            const size = ctx.size() as string;
            const showColon = ctx.colon() as boolean;

            listEl.className = 'pdx-dl';
            listEl.classList.add(`pdx-dl-${layout}`);
            listEl.classList.add(`pdx-dl-${size}`);
            if (isBordered) listEl.classList.add('pdx-dl-bordered');
            if (isStriped) listEl.classList.add('pdx-dl-striped');
            if (showColon) listEl.classList.add('pdx-dl-colon');
            listEl.style.setProperty('--pdx-dl-columns', String(cols));

            // Clear and rebuild with repeatWithSlot
            listEl.innerHTML = '';
            const frag = repeatWithSlot(
                () => getItems(),
                (item) => (item as DescriptionListItem).label,
                null,                   // slot handled in defaultRenderItem
                null,                   // no callback (handled in defaultRenderItem)
                defaultRenderItem,
            );
            listEl.appendChild(frag);
        }

        ctx.track(() => {
            void ctx.items();
            void ctx.columns();
            void ctx.layout();
            void ctx.bordered();
            void ctx.striped();
            void ctx.size();
            void ctx.labelWidth();
            void ctx.colon();
            void ctx.renderValue();

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-dl-root');
                    listEl = document.createElement('dl');
                    listEl.className = 'pdx-dl';
                    ctx.el.appendChild(listEl);
                    buildList();
                });
                return;
            }

            requestAnimationFrame(() => buildList());
        });

        return {};
    },
    render: () => html``,
});
