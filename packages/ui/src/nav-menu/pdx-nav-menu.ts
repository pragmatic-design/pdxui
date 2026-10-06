// pdx-nav-menu — Vertical navigation menu for sidebars.
// Data-driven: items with nesting, icons, badges, collapsible groups, active state.
// Use inside a sidebar or standalone as vertical navigation.

import { component, html, signal, sanitizeUrl } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { sanitizeSVG } from '../shared/sanitize';
import { uiString, format, uiAttr} from '../shared/i18n';
import { createNavKeys, NAV_ENTRY } from './nav-keys';
import { createNavFlyout } from './nav-flyout';

export interface NavMenuItem {
    /** Unique key */
    key: string;
    /** Display label */
    label: string;
    /** Icon HTML (prepended) */
    icon?: string;
    /** Badge text (appended, e.g. count) */
    badge?: string;
    /** Badge variant for styling */
    badgeVariant?: 'default' | 'primary' | 'danger' | 'success';
    /** Nested children (creates collapsible group) */
    children?: NavMenuItem[];
    /** Section header (non-clickable) */
    type?: 'item' | 'header' | 'separator';
    /** Link href (renders as <a> instead of <button>) */
    href?: string;
    /** Disabled */
    disabled?: boolean;
    /** Initially expanded (for groups with children) */
    expanded?: boolean;
    /**
     * A `header` with `children` is a collapsible group heading, OPEN unless this says otherwise.
     * Toggling it emits `pdx-toggle`, for the app to keep.
     */
    collapsed?: boolean;
    /**
     * `data-*` attributes for the entry: `{ test: 'to-tickets' }` → `data-test="to-tickets"`. An
     * app's own hooks — a test's, analytics' — on a menu drawn from data. Only a valid
     * data name is written: an item must not be able to set an `href` or a handler.
     */
    data?: Record<string, string>;
}

/** A `data-*` suffix that makes a valid attribute name: lowercase, starting with a letter. */
const DATA_NAME = /^[a-z][a-z0-9-]*$/;

function applyData(el: HTMLElement, data: Record<string, string> | undefined): void {
    if (!data) return;
    for (const [name, value] of Object.entries(data)) {
        if (DATA_NAME.test(name)) el.setAttribute('data-' + name, String(value));
    }
}

/**
 * A vertical navigation menu for sidebars, with nested collapsible groups, an active entry and a
 * collapsed icon-only mode.
 *
 * @slot item - Scoped — renders one navigation entry, a group's included. Receives `{ item, level, expanded, active }`.
 * @slot actions - Scoped — controls BESIDE a leaf entry (a pin, an «open in a new tab»), in a `.pdx-nav-row` with its link, never inside it: a link may hold no interactive content. Receives `{ item, level, active }`.
 */
component('pdx-nav-menu', {
    props: {
        /** Menu items */
        items: { type: Array, default: [] },
        /** Currently active item key */
        activeKey: { type: String, default: '' },
        /** Collapsed mode (show only icons, hide labels) */
        collapsed: { type: Boolean, default: false },
        /** Indent per nesting level (px) */
        indent: { type: Number, default: 36 },
        /** Icon set name (for pdx-icon set attribute) */
        iconSet: { type: String, default: '' },
        /** `sm`: a compact menu — smaller type, icons, chevrons and row padding, for a dense sidebar. */
        size: { type: String, default: 'md', enum: ['md', 'sm'] },
        /** How the current entry is marked: `fill` tints it; `border` also draws a bar on its start edge. */
        indicator: { type: String, default: 'fill', enum: ['fill', 'border'] },
        /** Where a group's chevron sits: before its icon, or at the end of its row. */
        chevron: { type: String, default: 'start', enum: ['start', 'end'] },
        /** `overlay`: the `actions` slot is laid over the row's end and shown on hover and focus, taking no width at rest. */
        actions: { type: String, default: 'inline', enum: ['inline', 'overlay'] },
    },
    setup(ctx) {
        /** Prefix of this menu's group ids, which the toggles' aria-controls point at. */
        const _uid = 'pdx-nav-' + Math.random().toString(36).slice(2, 8);
        const _expandedKeys = signal<Set<string>>(new Set());
        let _navEl: HTMLElement | null = null;
        let _built = false;
        function getItemSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['item'] as SlotFunction | undefined;
        }
        function getActionsSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['actions'] as SlotFunction | undefined;
        }

        function toggleGroup(key: string): void {
            const expanded = new Set(_expandedKeys.peek());
            if (expanded.has(key)) expanded.delete(key);
            else expanded.add(key);
            _expandedKeys.set(expanded);
            rebuildItems();
            // The component keeps nothing across a reload: the app does, from this.
            // Not bubbling, as every pdx-toggle in the library: a nav menu inside a component that
            // listens for its own pdx-toggle would otherwise fire it.
            ctx.emit('pdx-toggle', { key, expanded: expanded.has(key) }, { bubbles: false });
        }

        /** False when a `pdx-select` listener took the navigation over. */
        function onItemClick(item: NavMenuItem): boolean {
            if (item.disabled) return true;
            if (item.children?.length) {
                // Collapsed, a group's children are in its flyout; there is nothing to fold in place.
                if (ctx.collapsed() as boolean) {
                    const anchor = keys.entryByKey(item.key);
                    if (anchor) flyout.open(anchor, item);
                } else {
                    toggleGroup(item.key);
                }
                return true;
            }
            // CANCELABLE: an app under the router prevents it and navigates itself; the anchor is
            // then stopped, or it would load the whole page.
            const go = ctx.emit('pdx-select', { key: item.key, item, href: item.href }, { cancelable: true });
            // A choice made in the flyout ends it.
            flyout.close(false);
            return go;
        }

        // The keyboard and the collapsed menu's flyout, each its own
        // module: this component builds the entries, they move between them and open a group.
        const keys = createNavKeys({
            nav: () => _navEl,
            activeKey: () => ctx.activeKey() as string,
            toggleGroup,
            itemByKey: (key) => findItem(ctx.items() as NavMenuItem[], key),
            flyout: () => flyout,
        });
        const flyout = createNavFlyout({
            uid: _uid,
            build: (list, container) => buildItems(list, container, 0, true),
            entryByKey: keys.entryByKey,
            focusEntry: keys.focusEntry,
        });

        // ─── Build item DOM ──────────────────────────────────
        /** `labels`: draw every entry with its label even in a collapsed menu — the flyout's. */
        function buildItems(items: NavMenuItem[], container: HTMLElement, level: number, labels = false): void {
            const isCollapsed = !labels && (ctx.collapsed() as boolean);
            const indentPx = ctx.indent() as number;
            const activeKey = ctx.activeKey() as string;
            const iconSet = ctx.iconSet() as string;
            const expanded = _expandedKeys.peek();

            for (const item of items) {
                if (item.type === 'separator') {
                    const sep = document.createElement('hr');
                    sep.className = 'pdx-nav-separator';
                    container.appendChild(sep);
                    continue;
                }

                if (item.type === 'header') {
                    const folds = !!item.children?.length;
                    if (!folds) {
                        if (!isCollapsed) {
                            const hdr = document.createElement('div');
                            hdr.className = 'pdx-nav-heading';
                            hdr.textContent = item.label;
                            container.appendChild(hdr);
                        }
                        continue;
                    }
                    // A heading that FOLDS its group: a button, open by default. With
                    // the menu collapsed to icons the heading is text there is no room for, and its
                    // entries stay — folding a group of icons would hide the navigation.
                    const open = isCollapsed || expanded.has(item.key);
                    const section = document.createElement('div');
                    section.className = 'pdx-nav-section';
                    section.setAttribute('role', 'group');
                    section.id = `${_uid}-${item.key}`;
                    if (!isCollapsed) {
                        const hdr = document.createElement('button');
                        hdr.type = 'button';
                        hdr.className = 'pdx-nav-heading pdx-nav-heading-toggle';
                        hdr.setAttribute('data-nav-key', item.key);
                        applyData(hdr, item.data);
                        hdr.setAttribute('aria-expanded', String(open));
                        hdr.setAttribute('aria-controls', section.id);
                        const text = document.createElement('span');
                        text.textContent = item.label;
                        hdr.appendChild(text);
                        const chevron = document.createElement('span');
                        chevron.className = 'pdx-nav-chevron pdx-nav-heading-chevron' + (open ? ' expanded' : '');
                        chevron.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                        hdr.appendChild(chevron);
                        hdr.addEventListener('click', () => toggleGroup(item.key));
                        container.appendChild(hdr);
                        section.setAttribute('aria-label', item.label);
                    }
                    if (open) {
                        buildItems(item.children!, section, level, labels);
                        container.appendChild(section);
                    }
                    continue;
                }

                const hasChildren = item.children && item.children.length > 0;
                const isExpanded = expanded.has(item.key);
                const isActive = item.key === activeKey;

                // Item element
                const el = item.href && !hasChildren
                    ? document.createElement('a')
                    : document.createElement('button');

                if (item.href && el instanceof HTMLAnchorElement) {
                    const _safe = sanitizeUrl(item.href); // items may be data-driven → block javascript:
                    if (_safe) el.href = _safe;
                }
                if (el instanceof HTMLButtonElement) {
                    el.type = 'button';
                }

                el.className = 'pdx-nav-item';
                if (isActive) el.classList.add('active');
                if (hasChildren) el.classList.add('pdx-nav-group-trigger');
                if (item.disabled) {
                    el.setAttribute('aria-disabled', 'true');
                    if (el instanceof HTMLButtonElement) el.disabled = true;
                }

                el.setAttribute('data-nav-key', item.key);
                applyData(el, item.data);
                // The level the per-level properties select (`--pdx-nav-level2-size` …), 1-based, the
                // third standing for every deeper one; the indent as a property the level may replace.
                // Not an inline `padding-left`: it outranks every stylesheet rule, so a shell that wants
                // its own indent would have to reach the entry with `!important`.
                el.setAttribute('data-level', String(Math.min(level + 1, 3)));
                el.style.setProperty('--pdx-nav-pad', (level * indentPx + 8) + 'px');

                if (isActive) el.setAttribute('aria-current', 'page');
                if (hasChildren) {
                    el.setAttribute('aria-expanded', String(!!isExpanded));
                }
                // Collapsed to icons, a group opens in a FLYOUT beside it, not in place: in place
                // there are no labels to show. Hover and focus open it.
                if (hasChildren && isCollapsed) {
                    el.setAttribute('data-nav-flyout', '');
                    el.setAttribute('aria-expanded', String(flyout.isOpenFor(item.key)));
                    el.setAttribute('aria-controls', flyout.id(item.key));
                    el.addEventListener('pointerenter', () => flyout.open(el, item));
                    el.addEventListener('pointerleave', flyout.scheduleClose);
                    el.addEventListener('focus', () => { if (!flyout.returningFocus()) flyout.open(el, item); });
                }

                // Collapse chevron for groups
                if (hasChildren) {
                    const chevron = document.createElement('span');
                    chevron.className = 'pdx-nav-chevron' + (isExpanded ? ' expanded' : '');
                    chevron.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"></polyline></svg>';
                    el.appendChild(chevron);
                }

                // Content: slot > default (icon + label + badge). The slot draws a group's entry
                // too, or an app that draws its own icons has a collapsed group that shows only the
                // chevron.
                const itemSlot = getItemSlot();
                if (itemSlot) {
                    const content = itemSlot({ item, level, expanded: isExpanded, active: isActive });
                    el.appendChild(content instanceof DocumentFragment ? content : content);
                } else {
                    // Icon — always reserve space for alignment
                    if (item.icon) {
                        if (item.icon.startsWith('<')) {
                            const icon = document.createElement('span');
                            icon.className = 'pdx-nav-icon';
                            icon.innerHTML = sanitizeSVG(item.icon);
                            el.appendChild(icon);
                        } else {
                            // An icon NAME: `pdx-icon` is loaded the first time one is met, so a
                            // menu of SVG icons never pays for the icon set.
                            if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
                            const icon = document.createElement('pdx-icon');
                            icon.className = 'pdx-nav-icon';
                            icon.setAttribute('name', item.icon);
                            icon.setAttribute('size', '18');
                            if (iconSet) icon.setAttribute('set', iconSet);
                            el.appendChild(icon);
                        }
                    } else if (!hasChildren) {
                        const spacer = document.createElement('span');
                        spacer.className = 'pdx-nav-icon';
                        el.appendChild(spacer);
                    }

                    if (!isCollapsed) {
                        const label = document.createElement('span');
                        label.className = 'pdx-nav-label';
                        label.textContent = item.label;
                        el.appendChild(label);
                    }
                }

                // Badge
                if (item.badge && !isCollapsed) {
                    const badge = document.createElement('span');
                    badge.className = 'pdx-nav-badge';
                    if (item.badgeVariant && item.badgeVariant !== 'default') {
                        badge.classList.add('pdx-nav-badge-' + item.badgeVariant);
                    }
                    badge.textContent = item.badge;
                    el.appendChild(badge);
                    // A name of its own, or it reads the count glued to the label, "Inbox12".
                    // Captured for the reason `pdx-bottom-nav` gives at the same line.
                    const badgeText = item.badge;
                    uiAttr(el, 'aria-label', () => format(uiString('nav-menu', 'badge'), { label: item.label, badge: badgeText }));
                }

                // Collapsed to icons: the label is the name, and a tooltip shown on focus as well as
                // hover. `title` alone would show it to the mouse only.
                if (isCollapsed) {
                    el.setAttribute('aria-label', item.label);
                    el.setAttribute('data-tooltip', item.label);
                }

                // Click handler
                el.addEventListener('click', (e) => {
                    if (item.href && !hasChildren) {
                        // A modified click — Ctrl, Cmd, Shift, Alt, another button — is the
                        // browser's: «open in a new tab» keeps working, and it is no selection
                        // here, or the app would navigate this tab too.
                        if (e instanceof MouseEvent && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)) return;
                    } else {
                        e.preventDefault();
                    }
                    if (!onItemClick(item)) e.preventDefault();
                });

                // The app's controls for this entry sit BESIDE its link, in a row with it: inside, a
                // pin button and a second link would make the entry an <a> with interactive
                // content — invalid HTML, and one accessible name for three things. A leaf only: a
                // group's entry is itself the control that opens it.
                const actionsSlot = !hasChildren ? getActionsSlot() : undefined;
                if (actionsSlot) {
                    const row = document.createElement('div');
                    row.className = 'pdx-nav-row';
                    if (isActive) row.classList.add('active');
                    const actions = document.createElement('div');
                    actions.className = 'pdx-nav-actions';
                    actions.appendChild(actionsSlot({ item, level, active: isActive }));
                    row.append(el, actions);
                    container.appendChild(row);
                } else {
                    container.appendChild(el);
                }

                // Children (if expanded)
                if (hasChildren && isExpanded && !isCollapsed) {
                    const group = document.createElement('div');
                    group.className = 'pdx-nav-group';
                    group.setAttribute('role', 'group');
                    // The toggle says what it opens: aria-controls beside aria-expanded.
                    group.id = `${_uid}-${item.key}`;
                    el.setAttribute('aria-controls', group.id);
                    buildItems(item.children!, group, level + 1, labels);
                    container.appendChild(group);
                }
            }
        }

        /** One item by key, at any depth. */
        function findItem(list: NavMenuItem[], key: string): NavMenuItem | null {
            for (const item of list) {
                if (item.key === key) return item;
                const inner = item.children ? findItem(item.children, key) : null;
                if (inner) return inner;
            }
            return null;
        }

        function rebuildItems(): void {
            if (!_navEl) return;
            // The entries are replaced, the reader's place is not. Taken by KEY before they go:
            // `innerHTML = ''` removes the focused entry, and the focus would fall to <body>.
            const active = document.activeElement as HTMLElement | null;
            const inNav = active && _navEl.contains(active)
                ? active.closest(NAV_ENTRY)?.getAttribute('data-nav-key') ?? null
                : null;
            const inFlyout = flyout.focused();
            const flyoutWasOpenFor = inNav && flyout.isOpenFor(inNav);            // The entries are about to be replaced: a flyout would be anchored to one that is gone.
            flyout.close(false);
            _navEl.innerHTML = '';
            const items = ctx.items() as NavMenuItem[];
            buildItems(items, _navEl, 0);
            keys.applyRoving();

            if (inFlyout) {
                const anchor = keys.entryByKey(inFlyout.group);
                const group = findItem(items, inFlyout.group);
                if (anchor && group?.children?.length && (ctx.collapsed() as boolean)) {
                    flyout.open(anchor, group);
                    flyout.focusKey(inFlyout.key);                } else if (anchor) {
                    flyout.giveBack(anchor);
                }
            } else if (inNav) {
                const entry = keys.entryByKey(inNav) ?? _navEl.querySelector<HTMLElement>('[tabindex="0"]');
                if (!entry) return;
                // A trigger's focus opens its flyout: only when it was open does it open again.
                if (flyoutWasOpenFor) keys.focusEntry(entry);
                else flyout.giveBack(entry);
            }
        }

        // ─── Initial expanded keys from data ─────────────────
        function initExpanded(items: NavMenuItem[]): void {
            const expanded = new Set<string>();
            function walk(list: NavMenuItem[]) {
                for (const item of list) {
                    if (item.expanded && item.children?.length) expanded.add(item.key);
                    // A folding heading is open unless it says otherwise.
                    if (item.type === 'header' && item.children?.length && !item.collapsed) expanded.add(item.key);
                    if (item.children) walk(item.children);
                }
            }
            walk(items);
            _expandedKeys.set(expanded);
        }

        // ─── Build ───────────────────────────────────────────
        let _prevItemsRef: NavMenuItem[] | null = null;
        ctx.track(() => {
            const items = ctx.items() as NavMenuItem[];
            const collapsed = ctx.collapsed() as boolean;
            void ctx.activeKey();
            void ctx.iconSet();

            // Re-init expanded keys when items array changes (e.g. section switch)
            const itemsChanged = items !== _prevItemsRef;
            if (itemsChanged && items.length) {
                _prevItemsRef = items;
                initExpanded(items);
            }

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-nav-menu-root');
                    if (collapsed) ctx.el.classList.add('pdx-nav-collapsed');

                    _navEl = document.createElement('nav');
                    _navEl.className = 'pdx-nav';
                    _navEl.setAttribute('role', 'navigation');
                    uiAttr(_navEl, 'aria-label', () => uiString('nav-menu', 'label'));

                    buildItems(items, _navEl, 0);
                    keys.applyRoving();
                    _navEl.addEventListener('keydown', keys.onKeydown);
                    _navEl.addEventListener('focusin', keys.onFocusin);
                    ctx.el.appendChild(_navEl);
                });
                return;
            }

            // Rebuild on any prop change
            requestAnimationFrame(() => {
                if (collapsed) ctx.el.classList.add('pdx-nav-collapsed');
                else ctx.el.classList.remove('pdx-nav-collapsed');
                rebuildItems();
            });
        });

        // The looks: one host class each, for the design system's rules to hang on. A value
        // outside the list is the default, as an unknown attribute value is in HTML.
        ctx.track(() => {
            const looks: [string, string, string][] = [
                ['size', ctx.size() as string, 'sm'],
                ['indicator', ctx.indicator() as string, 'border'],
                ['chevron', ctx.chevron() as string, 'end'],
                ['actions', ctx.actions() as string, 'overlay'],
            ];
            for (const [name, value, other] of looks) ctx.el.classList.toggle(`pdx-nav-${name}-${other}`, value === other);
        });

        // Teardown on destroy only: the flyout is on <body> and would outlive the menu.
        ctx.track(() => () => flyout.close(false));

        ctx.expose({
            /** Expand or collapse one group by key. It selects nothing. */
            toggleGroup,
            /** Expand every group that has children, at any depth. */
            expandAll,
            /** Collapse every group. */
            collapseAll,
        });

        function expandAll(): void {
            const items = ctx.items() as NavMenuItem[];
            const keys = new Set<string>();
            function walk(list: NavMenuItem[]) {
                for (const item of list) {
                    if (item.children?.length) keys.add(item.key);
                    if (item.children) walk(item.children);
                }
            }
            walk(items);
            _expandedKeys.set(keys);
            rebuildItems();
        }

        function collapseAll(): void {
            _expandedKeys.set(new Set());
            rebuildItems();
        }

        return {};
    },
    render: () => html``,
});
