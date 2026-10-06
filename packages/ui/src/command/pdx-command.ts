// pdx-command — Command palette (Cmd+K search dialog).
// Keyboard-driven: Ctrl/Cmd+K to open, Escape to close, arrow keys to navigate, Enter to select.
// Features: fuzzy filter, grouped items, keyboard shortcuts display, empty state, focus trap.
// Uses overlayStack for z-index coordination + Escape handling.

import { component, html, signal, computed, effect, overlayStack, focusTrap, onMount, untracked } from '@pdxui/core';
import type { Dispose, SlotFunction } from '@pdxui/core';

/** A command's icon, loading `pdx-icon` the first time one is named: a list of labels never pays for the set. */
function commandIcon(name: string) {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
    return html`<span class="pdx-command-item-icon"><pdx-icon name="${name}" size="15"></pdx-icon></span>`;
}
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/command';

export interface CommandItem {
    id: string;
    label: string;
    group?: string;
    icon?: string;
    shortcut?: string;
    action?: () => void;
    keywords?: string;   // extra search terms
    disabled?: boolean;
}

/**
 * A command palette: a modal dialog with a search combobox over a listbox of commands. Open it with
 * `show()`, close it with `close()` (or `toggle()`); `openPalette()` / `closePalette()` are
 * deprecated aliases of those two. Focus stays in the input, and the highlighted command is its
 * `aria-activedescendant`; a disabled command is shown and skipped; a `shortcut` is announced as
 * `aria-keyshortcuts`.
 * @slot item - Scoped — renders one command. Receives `{ item, active, index }`.
 * @fires pdx-select {CommandItem} - The chosen item itself, after its own `action` (if any) has run.
 */
component('pdx-command', {
    props: {
        open: { type: Boolean, default: false },
        /** The search input's placeholder. Empty: the command.placeholder component string, «Type a command...». */
        placeholder: { type: String, default: '' },
        items: { type: Array, default: [] },
        /** The message when nothing matches. Empty: the command.empty component string, «No results found.». */
        emptyText: { type: String, default: '' },
        /** Global keyboard shortcut to open (default: Ctrl+K / Cmd+K) */
        hotkey: { type: Boolean, default: true },
    },
    setup(ctx) {
        const _open = signal(false);
        const _query = signal('');
        const _activeIndex = signal(0);

        let _trapDispose: Dispose | null = null;
        const _uid = 'pdx-cmd-' + Math.random().toString(36).slice(2, 8);

        // Filtered items — simple case-insensitive substring match. A disabled command is listed
        // (aria-disabled) and skipped by the arrows and Enter, not dropped.
        const filteredItems = computed(() => {
            const q = _query().toLowerCase().trim();
            const items = (ctx.items() as CommandItem[]) || [];
            if (!q) return items;
            return items.filter(i => {
                const haystack = (i.label + ' ' + (i.group || '') + ' ' + (i.keywords || '')).toLowerCase();
                return haystack.includes(q);
            });
        });

        /** The first enabled command of the list, or -1. */
        function firstEnabled(): number {
            return filteredItems().findIndex(i => !i.disabled);
        }
        /** Move the highlight `dir` steps, over disabled commands, wrapping. */
        function moveActive(dir: 1 | -1): void {
            const items = filteredItems();
            const n = items.length;
            let i = _activeIndex();
            for (let k = 0; k < n; k++) {
                i = (i + dir + n) % n;
                if (!items[i].disabled) { _activeIndex.set(i); return; }
            }
        }
        /** The option's id: the input points at it with aria-activedescendant. */
        const optionId = (index: number): string => `${_uid}-opt-${index}`;
        const listId = `${_uid}-list`;
        /** The highlighted, enabled option's id while open; null otherwise. */
        function activeDescendant(): string | null {
            const i = _activeIndex();
            const items = filteredItems();
            return _open() && i >= 0 && i < items.length && !items[i].disabled ? optionId(i) : null;
        }

        // Group items for rendering
        const groupedItems = computed(() => {
            const items = filteredItems();
            const groups: { name: string; items: CommandItem[] }[] = [];
            const map = new Map<string, CommandItem[]>();
            for (const item of items) {
                const g = item.group || '';
                if (!map.has(g)) map.set(g, []);
                map.get(g)!.push(item);
            }
            for (const [name, groupItems] of map) {
                groups.push({ name, items: groupItems });
            }
            return groups;
        });

        function openPalette() {
            _open.set(true);
            _query.set('');
            // Untracked: the `open` prop's track calls this, and a tracked read of the list
            // would subscribe it to the query — every key would re-open the palette and wipe what was typed.
            _activeIndex.set(untracked(firstEnabled));
            ctx.emit('pdx-open', undefined, { bubbles: false });
        }

        function closePalette() {
            _open.set(false);
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        function selectItem(item: CommandItem) {
            if (item.disabled) return;
            closePalette();
            if (item.action) item.action();
            ctx.emit('pdx-select', item);
        }

        function onInput(e: Event) {
            _query.set((e.target as HTMLInputElement).value);
            _activeIndex.set(firstEnabled());
        }

        function onKeydown(e: KeyboardEvent) {
            const items = filteredItems();

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveActive(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveActive(-1);
            } else if (e.key === 'Enter' && items[_activeIndex()]) {
                e.preventDefault();
                selectItem(items[_activeIndex()]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePalette();
            }
        }

        // Global hotkey: Ctrl/Cmd + K
        function onGlobalKeydown(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (_open()) closePalette();
                else openPalette();
            }
        }

        // Sync with the external `open` prop (controlled mode). It reads _open with peek() so as NOT to
        // subscribe to the internal signal: otherwise an uncontrolled openPalette() (setup/hotkey/API)
        // re-triggers the effect which, seeing the prop open=false, would close it again straight away.
        // This way the effect reacts ONLY to the prop's changes, leaving programmatic opening working.
        ctx.track(() => {
            if (ctx.open()) openPalette();
            else if (_open.peek()) closePalette();
        });

        // Hotkey registration
        ctx.track(() => {
            if (ctx.hotkey()) {
                document.addEventListener('keydown', onGlobalKeydown);
                return () => document.removeEventListener('keydown', onGlobalKeydown);
            }
        });

        // Overlay stack + focus trap when open
        ctx.track(() => {
            const el = ctx.el;
            if (_open()) {
                overlayStack.push(_uid, { modal: true });
                const dismissDispose = overlayStack.onDismissTop(closePalette);

                requestAnimationFrame(() => {
                    const dialog = el.querySelector('.pdx-command') as HTMLElement;
                    if (dialog) {
                        _trapDispose = focusTrap(dialog, { restoreFocus: true });
                        const input = dialog.querySelector('input');
                        if (input) input.focus();
                    }
                });

                return () => {
                    if (_trapDispose) { _trapDispose(); _trapDispose = null; }
                    dismissDispose();
                    overlayStack.pop(_uid);
                };
            }
        });

        // Scroll active item into view
        effect(() => {
            const idx = _activeIndex();
            if (!_open()) return;
            requestAnimationFrame(() => {
                const el = ctx.el.querySelector(`[data-cmd-index="${idx}"]`);
                if (el) el.scrollIntoView({ block: 'nearest' });
            });
        });

        // Slot — read lazily (_projectSlots runs after setup)
        function getItemSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['item'] as SlotFunction | undefined;
        }
        // The list first renders before the slots are projected: with items bound by a template and
        // nothing else changing, the `item` slot would not be used until the query changed. This flips once the slots are in, and the list reads it.
        const _slotsIn = signal(false);
        onMount(() => { if (getItemSlot()) _slotsIn.set(true); });

        // Exposes the methods on the host: `return {}` from the setup gives them only to the render context, NOT
        // to the DOM element. ctx.expose makes them reachable through a parent ref.
        // NOTE: `show` (not `open`): `open` is a PROP — a member of the same name shadows its setter.
        ctx.expose({
            show: openPalette,
            close: closePalette,
            toggle: () => { if (_open.peek()) closePalette(); else openPalette(); },
            get isOpen() { return _open.peek(); },
            // Deprecated aliases of show() / close(), kept for existing callers (the component's
            // JSDoc says which is the API).
            /** Open the palette, clearing the query and highlighting the first item that is not disabled. */
            openPalette,
            /** Close the palette and emit `pdx-close`. */
            closePalette,
        });

        /** "Ctrl Shift ," → "Control+Shift+,": the aria-keyshortcuts form of a displayed shortcut. */
        function keyShortcuts(shortcut: string): string {
            const names: Record<string, string> = { ctrl: 'Control', control: 'Control', cmd: 'Meta', '⌘': 'Meta', meta: 'Meta', shift: 'Shift', '⇧': 'Shift', alt: 'Alt', '⌥': 'Alt', option: 'Alt' };
            return shortcut.trim().split(/[\s+]+/).filter(Boolean).map(k => names[k.toLowerCase()] ?? (k.length === 1 ? k.toUpperCase() : k)).join('+');
        }
        /** A group's heading id: the group is labelled by it. */
        const groupId = (index: number): string => `${_uid}-group-${index}`;

        // The input's placeholder and the empty list's message, from the component strings when the
        // props are not set: English defaults here would reach every locale.
        const resolvedPlaceholder = (): string => (ctx.placeholder() as string) || uiString('command', 'placeholder');
        const resolvedEmpty = (): string => (ctx.emptyText() as string) || uiString('command', 'empty');

        return {
            _open, _query, _activeIndex, filteredItems, groupedItems,
            onInput, onKeydown, selectItem, openPalette, closePalette,
            getItemSlot, resolvedPlaceholder, resolvedEmpty, _slotsIn,
            optionId, listId, groupId, activeDescendant, keyShortcuts,
        };
    },
    render: (ctx) => html`
        <div :class="${() => 'pdx-command-backdrop' + (ctx._open() ? '' : '')}"
             :data-open="${() => ctx._open() ? '' : null}"
             @click="${ctx.closePalette}"></div>
        <div class="pdx-command"
             role="dialog"
             aria-modal="true"
             :aria-label="${() => uiString('command', 'palette')}"
             :data-open="${() => ctx._open() ? '' : null}">
            <div class="pdx-command-input">
                <span class="pdx-command-search-icon" aria-hidden="true">&#8981;</span>
                <input type="text"
                    autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                    :placeholder="${ctx.resolvedPlaceholder}"
                    :value="${ctx._query}"
                    @input="${ctx.onInput}"
                    @keydown="${ctx.onKeydown}"
                    role="combobox"
                    :aria-label="${() => (ctx.placeholder() as string) || uiString('command', 'search')}"
                    aria-expanded="true"
                    aria-autocomplete="list"
                    :aria-activedescendant="${ctx.activeDescendant}"
                    :aria-controls="${() => ctx._open() ? ctx.listId : null}" />
                <kbd class="pdx-command-kbd">ESC</kbd>
            </div>
            <!-- The live region OUTSIDE the listbox: role=status is not an allowed child of role=listbox
                 (axe aria-required-children). It stays a sibling and announces the count all the same. -->
            <span class="pdx-sr-only" role="status" aria-live="polite" aria-atomic="true">
                ${() => {
                    const n = ctx.filteredItems().filter((i: CommandItem) => !i.disabled).length;
                    return n === 0 ? uiString('command', 'noResults') : format(uiString('command', 'commandsAvailable'), { n });
                }}
            </span>
            <!-- The input is the list's one tab stop: options are divs it points at with
                 aria-activedescendant, not <button>s, which would each be a tab stop.
                 A named group is a role="group" labelled by its heading. -->
            <div class="pdx-command-list" :id="${() => ctx.listId}" role="listbox" :aria-label="${() => uiString('command', 'commands')}">
                ${() => {
                    void ctx._slotsIn();
                    const groups = ctx.groupedItems();
                    const items = ctx.filteredItems();
                    if (items.length === 0) {
                        return html`<div class="pdx-command-empty">${ctx.resolvedEmpty}</div>`;
                    }
                    let flatIdx = 0;
                    return groups.map((g, gi) => {
                        const itemsHtml = g.items.map(item => {
                            const idx = flatIdx++;
                            const isActive = () => ctx._activeIndex() === idx;
                            return html`<div class="${() => 'pdx-command-item' + (isActive() ? ' active' : '')}"
                                role="option"
                                :id="${() => ctx.optionId(idx)}"
                                :aria-selected="${() => isActive() ? 'true' : 'false'}"
                                :aria-disabled="${() => item.disabled ? 'true' : null}"
                                :aria-keyshortcuts="${() => item.shortcut ? ctx.keyShortcuts(item.shortcut) : null}"
                                :data-active="${() => isActive() ? '' : null}"
                                data-cmd-index="${() => idx}"
                                @click="${() => ctx.selectItem(item)}"
                                @mouseenter="${() => { if (!item.disabled) ctx._activeIndex.set(idx); }}">
                                ${() => {
                                    const slotFn = ctx.getItemSlot();
                                    if (slotFn) {
                                        return slotFn({ item, active: isActive(), index: idx });
                                    }
                                    return html`${() => item.icon ? commandIcon(item.icon) : ''}
                                <span class="pdx-command-item-label">${() => item.label}</span>
                                ${() => item.shortcut ? html`<span class="pdx-command-item-shortcut" aria-hidden="true">${() => item.shortcut}</span>` : ''}`;
                                }}
                            </div>`;
                        });
                        return g.name
                            ? html`<div role="group" :aria-labelledby="${() => ctx.groupId(gi)}">
                                <span class="pdx-command-group" :id="${() => ctx.groupId(gi)}" aria-hidden="true">${() => g.name}</span>
                                ${itemsHtml}
                            </div>`
                            : html`${itemsHtml}`;
                    });
                }}
            </div>
            <div class="pdx-command-footer">
                <span><kbd>↑↓</kbd> ${() => uiString('command', 'navigate')}</span>
                <span><kbd>↵</kbd> ${() => uiString('command', 'select')}</span>
                <span><kbd>ESC</kbd> ${() => uiString('command', 'close')}</span>
            </div>
        </div>
    `,
});
