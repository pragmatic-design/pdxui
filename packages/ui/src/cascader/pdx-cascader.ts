// pdx-cascader — Multi-level drill-down selector.
// Each selection opens the next column of children (Country → Region → City).
// Supports lazy loading, search, disabled nodes, clearable.

import { component, html, signal } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { registerComponentStrings, getComponentString, registerFormControl, usePopover } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/cascader';

// Unique ids for the panel (aria-controls from the combobox trigger).
let _csSeq = 0;

registerComponentStrings('cascader', {
    placeholder: 'Select...',
    search: 'Search...',
    noData: 'No data',
    noMatch: 'No match',
    loading: 'Loading...',
});

registerFormControl('pdx-cascader', {
    valueEvent: 'pdx-change',
    valueProp: 'value',
});

export interface CascaderNode {
    value: string;
    label: string;
    children?: CascaderNode[];
    /** Lazy load: true = has children but not loaded yet */
    isLeaf?: boolean;
    disabled?: boolean;
}

/**
 * A multi-level drill-down selector: each choice opens the next column of children, as in Country,
 * then Region, then City.
 *
 * @fires pdx-load-error - Fired when `loadChildren` rejects; the branch stays askable and can be clicked again.
 * @slot option - Scoped — renders one option in a column. Receives `{ node, level, selected }`.
 */
component('pdx-cascader', {
    formAssociated: true,
    props: {
        /** Tree of options */
        options: { type: Array, default: [] },
        /** Selected path — array of values from root to leaf */
        value: { type: Array, default: [] },
        /** Placeholder text */
        placeholder: { type: String, default: '' },
        /** Accessible name (aria-label) for the trigger; falls back to placeholder */
        label: { type: String, default: '' },
        /** Show search input for filtering */
        searchable: { type: Boolean, default: false },
        /** Separator for display text (default: ' / ') */
        separator: { type: String, default: ' / ' },
        /** Clearable */
        clearable: { type: Boolean, default: true },
        /** Disabled */
        disabled: { type: Boolean, default: false },
        /** Allow selecting non-leaf nodes */
        changeOnSelect: { type: Boolean, default: false },
        /** Lazy load function: (node) => Promise<CascaderNode[]> */
        loadChildren: { type: Function, default: null },
        /** Component size */
        size: { type: String, default: '' },
        /** Form field name */
        name: { type: String, default: '' },
    },
    setup(ctx) {
        const _open = signal(false);
        const _activePath = signal<string[]>([]);
        const _search = signal('');
        const _loading = signal<Set<string>>(new Set());
        const _domReady = signal(false);
        const _internalValue = signal<string[]>([]);
        /** The column the keyboard is in; its active option is `_activePath[_cursorLevel]`. */
        const _cursorLevel = signal(0);
        /** The search result the keyboard is on, -1 for none. */
        const _searchCursor = signal(-1);
        /** The keyboard is driving: only then is the active option drawn with a ring (a click is not). */
        const _kbd = signal(false);

        // DOM refs
        let _triggerEl: HTMLElement | null = null;
        let _textEl: HTMLElement | null = null;
        const _panelId = 'pdx-cascader-panel-' + (++_csSeq);
        let _panelEl: HTMLElement | null = null;
        function getOptionSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['option'] as SlotFunction | undefined;
        }
        let _panelContentEl: HTMLElement | null = null;
        let _searchInputEl: HTMLInputElement | null = null;
        let _clearEl: HTMLButtonElement | null = null;
        let _iconEl: HTMLElement | null = null;
        let _hiddenEl: HTMLInputElement | null = null;
        let _popover: ReturnType<typeof usePopover> | null = null;
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;

        function getOptions(): CascaderNode[] {
            return (ctx.options() as CascaderNode[]) || [];
        }

        function getValuePath(): string[] {
            return _internalValue();
        }

        function resolvePathNodes(path: string[]): CascaderNode[] {
            const nodes: CascaderNode[] = [];
            let current = getOptions();
            for (const val of path) {
                const found = current.find(n => n.value === val);
                if (!found) break;
                nodes.push(found);
                current = found.children || [];
            }
            return nodes;
        }

        function displayText(): string {
            const path = getValuePath();
            if (path.length === 0) return '';
            const sep = (ctx.separator() as string) || ' / ';
            const nodes = resolvePathNodes(path);
            return nodes.map(n => n.label).join(sep);
        }

        function getColumns(): { items: CascaderNode[]; activeValue: string }[] {
            const path = _activePath.peek();
            const cols: { items: CascaderNode[]; activeValue: string }[] = [];
            let current = getOptions();
            cols.push({ items: current, activeValue: path[0] || '' });
            for (let i = 0; i < path.length; i++) {
                const node = current.find(n => n.value === path[i]);
                if (!node || !node.children || node.children.length === 0) break;
                current = node.children;
                cols.push({ items: current, activeValue: path[i + 1] || '' });
            }
            return cols;
        }

        function flattenPaths(nodes: CascaderNode[], path: CascaderNode[] = []): { path: CascaderNode[]; labels: string }[] {
            const results: { path: CascaderNode[]; labels: string }[] = [];
            for (const node of nodes) {
                const current = [...path, node];
                if (node.children && node.children.length > 0) {
                    results.push(...flattenPaths(node.children, current));
                } else {
                    results.push({ path: current, labels: current.map(n => n.label).join(' / ') });
                }
            }
            return results;
        }

        /** The search results, each a path of nodes: what the search list renders and the keys walk. */
        function searchResults(): { path: CascaderNode[]; labels: string }[] {
            const q = _search.peek().toLowerCase();
            return flattenPaths(getOptions()).filter(p => p.labels.toLowerCase().includes(q));
        }

        // ─── Keyboard: APG combobox + listbox over the columns ──────
        // Focus stays on the combobox (or
        // the search input), which points at the active option with aria-activedescendant.

        const enabled = (n: CascaderNode) => !n.disabled;

        function hasChildren(node: CascaderNode): boolean {
            if (node.children && node.children.length > 0) return true;
            return !!ctx.loadChildren() && !node.children && node.isLeaf !== true;
        }

        function cursorNode(): CascaderNode | undefined {
            const level = _cursorLevel.peek();
            return getColumns()[level]?.items.find(n => n.value === _activePath.peek()[level]);
        }

        function moveInColumn(to: 1 | -1 | 'first' | 'last'): void {
            const level = _cursorLevel.peek();
            const items = (getColumns()[level]?.items ?? []).filter(enabled);
            if (items.length === 0) return;
            const at = items.findIndex(n => n.value === _activePath.peek()[level]);
            const next = to === 'first' ? 0
                : to === 'last' ? items.length - 1
                    : at < 0 ? 0 : Math.max(0, Math.min(items.length - 1, at + to));
            _activePath.set([..._activePath.peek().slice(0, level), items[next].value]);
        }

        function enterChild(): void {
            const node = cursorNode();
            if (!node || node.disabled) return;
            const level = _cursorLevel.peek();
            const first = node.children?.find(enabled);
            if (first) {
                _activePath.set([..._activePath.peek().slice(0, level + 1), first.value]);
                _cursorLevel.set(level + 1);
            } else if (hasChildren(node)) {
                void onItemClick(node, level);   // lazy: load; ArrowRight again enters
            }
        }

        function backToParent(): void {
            const level = _cursorLevel.peek();
            if (level === 0) return;
            _activePath.set(_activePath.peek().slice(0, level));
            _cursorLevel.set(level - 1);
        }

        /** Enter/Space on the active option: a leaf is selected, as a click would; a branch is entered,
         *  or selected with change-on-select. */
        function commitCursor(): void {
            const node = cursorNode();
            if (!node || node.disabled) return;
            const path = _activePath.peek().slice(0, _cursorLevel.peek() + 1);
            if (!hasChildren(node)) { selectValue(path); closePopover(); return; }
            if (ctx.changeOnSelect()) { selectValue(path); return; }
            enterChild();
        }

        function moveInResults(to: 1 | -1 | 'first' | 'last'): void {
            const results = searchResults();
            const usable = results.map((r, i) => (r.path.some(n => n.disabled) ? -1 : i)).filter(i => i >= 0);
            if (usable.length === 0) return;
            const at = usable.indexOf(_searchCursor.peek());
            const next = to === 'first' ? 0
                : to === 'last' ? usable.length - 1
                    : at < 0 ? 0 : Math.max(0, Math.min(usable.length - 1, at + to));
            _searchCursor.set(usable[next]);
        }

        /** The keys of the open panel. True when the key was handled. */
        function onOpenKey(e: KeyboardEvent): boolean {
            const inResults = !!(ctx.searchable() && _search.peek());
            if (e.key !== 'Tab' && e.key !== 'Shift') _kbd.set(true);
            switch (e.key) {
                case 'ArrowDown': inResults ? moveInResults(1) : moveInColumn(1); return true;
                case 'ArrowUp': inResults ? moveInResults(-1) : moveInColumn(-1); return true;
                case 'Home': inResults ? moveInResults('first') : moveInColumn('first'); return true;
                case 'End': inResults ? moveInResults('last') : moveInColumn('last'); return true;
                case 'ArrowRight': if (inResults) return false; enterChild(); return true;
                case 'ArrowLeft': if (inResults) return false; backToParent(); return true;
                case 'Enter': {
                    if (!inResults) { commitCursor(); return true; }
                    const hit = searchResults()[_searchCursor.peek()];
                    if (hit) onSearchSelect(hit.path);
                    return true;
                }
                case 'Escape': closePopover(); _triggerEl?.focus(); return true;
                default: return false;
            }
        }

        function openPopover(fromKeyboard = false): void {
            if (ctx.disabled()) return;
            const path = [...getValuePath()];
            // From the keyboard, an empty cascader opens on its first option, so there is one to move from.
            if (fromKeyboard && path.length === 0) {
                const first = getOptions().find(enabled);
                if (first) path.push(first.value);
            }
            _activePath.set(path);
            _cursorLevel.set(Math.max(0, path.length - 1));
            _searchCursor.set(-1);
            _kbd.set(fromKeyboard);
            _open.set(true);
            // Close on click outside (guard: the component may be destroyed
            // inside the setTimeout's window)
            setTimeout(() => {
                if (!_open.peek()) return;
                _outsideHandler = (e: MouseEvent) => {
                    const el = ctx.el;
                    if (!el.contains(e.target as Node)) closePopover();
                };
                document.addEventListener('mousedown', _outsideHandler);
            }, 0);
            ctx.emit('pdx-open', undefined, { bubbles: false });
        }

        // Teardown on destroy: otherwise an unmount with the popover open would
        // leave the mousedown on document orphaned forever.
        ctx.track(() => () => {
            if (_outsideHandler) {
                document.removeEventListener('mousedown', _outsideHandler);
                _outsideHandler = null;
            }
            // Its scroll/resize listeners and ResizeObserver go with the component.
            _popover?.dispose();
            _popover = null;
        });

        function closePopover(): void {
            _open.set(false);
            _search.set('');
            if (_searchInputEl) _searchInputEl.value = '';
            if (_outsideHandler) {
                document.removeEventListener('mousedown', _outsideHandler);
                _outsideHandler = null;
            }
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        function selectValue(path: string[]): void {
            _internalValue.set([...path]);
            setOwnProp(ctx.el, 'value', [...path]);   // the live path
            ctx.emit('pdx-change', { value: path, labels: resolvePathNodes(path).map(n => n.label) });
        }

        async function onItemClick(node: CascaderNode, level: number): Promise<void> {
            if (node.disabled) return;
            const path = _activePath.peek().slice(0, level);
            path.push(node.value);
            _activePath.set(path);

            // Lazy load children
            const loadFn = ctx.loadChildren() as ((node: CascaderNode) => Promise<CascaderNode[]>) | null;
            if (loadFn && !node.children && node.isLeaf !== true) {
                const loadingSet = new Set(_loading.peek());
                loadingSet.add(node.value);
                _loading.set(loadingSet);
                try {
                    const children = await loadFn(node);
                    node.children = children;
                } catch (error) {
                    // Not cached, and not swallowed — as pdx-tree-select does: an unreachable
                    // branch and an empty one look identical, so the failure is announced and the
                    // node stays askable. It does not escape as an unhandled rejection.
                    ctx.emit('pdx-load-error', { node, error });
                } finally {
                    const s = new Set(_loading.peek());
                    s.delete(node.value);
                    _loading.set(s);
                }
                // No active-path write here. The `_loading` change above re-renders the columns from the
                // active path as it is now, children included. Setting the path captured at the click
                // would take the user back to this branch when it settles after they have clicked
                // another one. The children stay on the node, so coming back to it lists them.
                return;
            }

            // Select if leaf or changeOnSelect
            const isLeaf = !node.children || node.children.length === 0;
            if (isLeaf || ctx.changeOnSelect()) {
                selectValue(path);
                if (isLeaf) closePopover();
            }
        }

        function onClear(e: Event): void {
            e.stopPropagation();
            _internalValue.set([]);
            setOwnProp(ctx.el, 'value', []);
            ctx.emit('pdx-change', { value: [], labels: [] });
            ctx.emit('pdx-clear');
            closePopover();
        }

        function onSearchSelect(pathNodes: CascaderNode[]): void {
            const path = pathNodes.map(n => n.value);
            selectValue(path);
            closePopover();
        }

        // Sync external value prop → internal state
        ctx.track(() => {
            const externalVal = ctx.value() as string[];
            if (externalVal && Array.isArray(externalVal) && externalVal.length > 0) {
                const current = _internalValue.peek();
                if (JSON.stringify(externalVal) !== JSON.stringify(current)) {
                    _internalValue.set([...externalVal]);
                }
            }
        });

        // Build DOM once (ctx.frame: a setup a move destroyed does not build again)
        ctx.frame(() => {
            const el = ctx.el;
            const disabled = ctx.disabled() as boolean;
            const size = ctx.size() as string;
            const name = ctx.name() as string;
            const clearable = ctx.clearable() as boolean;
            const ph = (ctx.placeholder() as string) || getComponentString('cascader', 'placeholder')();

            _triggerEl = document.createElement('div');
            _triggerEl.className = 'pdx-cascader-trigger pdx-input-wrap' + (size ? ` pdx-input-${size}` : '') + (disabled ? ' disabled' : '');
            _triggerEl.setAttribute('role', 'combobox');
            _triggerEl.setAttribute('aria-expanded', 'false');
            _triggerEl.setAttribute('aria-haspopup', 'listbox');
            // An accessible name + aria-controls pointing at the panel (role=combobox requires it).
            _triggerEl.setAttribute('aria-label', (ctx.label?.() as string) || ph);
            _triggerEl.setAttribute('aria-controls', _panelId);
            _triggerEl.setAttribute('tabindex', disabled ? '-1' : '0');
            _triggerEl.addEventListener('click', () => {
                if (_open.peek()) closePopover(); else openPopover();
            });
            _triggerEl.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.target !== _triggerEl) return;   // the clear button keeps its own keys
                if (!_open.peek()) {
                    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopover(true); }
                    return;
                }
                if (e.key === ' ') { e.preventDefault(); commitCursor(); return; }
                if (e.key === 'Tab') { closePopover(); return; }
                if (onOpenKey(e)) e.preventDefault();
            });

            _textEl = document.createElement('span');
            _textEl.className = 'pdx-cascader-text pdx-cascader-placeholder';
            _textEl.textContent = ph;
            _triggerEl.appendChild(_textEl);

            if (clearable) {
                _clearEl = document.createElement('button') as HTMLButtonElement;
                _clearEl.type = 'button';
                _clearEl.className = 'pdx-input-clear';
                _clearEl.textContent = '×';
                uiAttr(_clearEl, 'aria-label', () => uiString('cascader', 'clear'));
                _clearEl.style.display = 'none';
                _clearEl.addEventListener('click', onClear);
                _triggerEl.appendChild(_clearEl);
            }

            _iconEl = document.createElement('span');
            _iconEl.className = 'pdx-cascader-icon';
            _iconEl.textContent = '▾';
            _triggerEl.appendChild(_iconEl);

            el.appendChild(_triggerEl);

            _panelEl = document.createElement('div');
            _panelEl.className = 'pdx-cascader-panel';
            _panelEl.id = _panelId;
            _panelEl.style.display = 'none';

            if (ctx.searchable()) {
                const searchWrap = document.createElement('div');
                searchWrap.className = 'pdx-cascader-search';
                _searchInputEl = document.createElement('input');
                _searchInputEl.type = 'text';
                _searchInputEl.placeholder = getComponentString('cascader', 'search')();
                // A name, not only a placeholder; the arrows walk the results or the columns from here.
                uiAttr(_searchInputEl, 'aria-label', () => uiString('cascader', 'searchLabel'));
                _searchInputEl.setAttribute('aria-autocomplete', 'list');
                _searchInputEl.setAttribute('aria-controls', _panelId);
                _searchInputEl.addEventListener('input', () => {
                    _searchCursor.set(-1);
                    _search.set(_searchInputEl!.value);
                });
                _searchInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (onOpenKey(e)) e.preventDefault();
                });
                searchWrap.appendChild(_searchInputEl);
                _panelEl.appendChild(searchWrap);
            }

            _panelContentEl = document.createElement('div');
            _panelContentEl.className = 'pdx-cascader-content';
            _panelEl.appendChild(_panelContentEl);

            el.appendChild(_panelEl);

            // Positioned by usePopover, `fixed` against the viewport, as pdx-select and
            // pdx-tree-select do — an `absolute` panel obeys the overflow of any box it sits in and
            // gets cut. Positioning only: opening, closing and dismissal stay here.
            _popover = usePopover({
                trigger: 'manual',
                placement: 'bottom-start',
                flip: true,
                dismissOnOutside: false,
                dismissOnEscape: false,
                container: el,
            });
            _popover.setTrigger(_triggerEl);
            _popover.setContent(_panelEl);

            if (name) {
                _hiddenEl = document.createElement('input');
                _hiddenEl.type = 'hidden';
                _hiddenEl.name = name;
                el.appendChild(_hiddenEl);
            }
            _domReady.set(true);
        });

        // Reactive: update trigger text + panel
        ctx.track(() => {
            if (!_domReady()) return;
            const open = _open();
            void _activePath();
            const cursorLevel = _cursorLevel();
            const searchCursor = _searchCursor();
            const kbd = _kbd();
            const search = _search();
            const loading = _loading();
            const display = displayText();
            const valuePath = getValuePath();
            const clearable = ctx.clearable() as boolean;
            const disabled = ctx.disabled() as boolean;
            const searchable = ctx.searchable() as boolean;
            const ph = (ctx.placeholder() as string) || getComponentString('cascader', 'placeholder')();

            // Update trigger text
            if (_textEl) {
                _textEl.textContent = display || ph;
                _textEl.className = 'pdx-cascader-text' + (display ? '' : ' pdx-cascader-placeholder');
            }
            if (_clearEl) {
                _clearEl.style.display = (clearable && display && !disabled) ? '' : 'none';
            }
            if (_iconEl) {
                _iconEl.className = 'pdx-cascader-icon' + (open ? ' open' : '');
            }
            if (_triggerEl) _triggerEl.setAttribute('aria-expanded', String(open));

            if (_hiddenEl) _hiddenEl.value = valuePath.join(',');

            if (!_panelEl || !_panelContentEl) return;
            _panelEl.style.display = open ? '' : 'none';
            if (open) _popover?.open(); else _popover?.close();
            /** The combobox and the search input both point at the option the keyboard is on. */
            const pointAt = (id: string | null) => {
                for (const owner of [_triggerEl, _searchInputEl]) {
                    if (!owner) continue;
                    if (id) owner.setAttribute('aria-activedescendant', id);
                    else owner.removeAttribute('aria-activedescendant');
                }
            };
            if (!open) { pointAt(null); return; }

            // Focus search input when panel opens
            if (_searchInputEl && open) {
                setTimeout(() => _searchInputEl!.focus(), 0);
            }

            // Rebuild only the content area (search input is persistent)
            _panelContentEl.innerHTML = '';

            // Search mode: show flat results
            if (searchable && search) {
                const filtered = searchResults();

                // A listbox of options, reached with the arrows.
                const list = document.createElement('div');
                list.className = 'pdx-cascader-flat-list';
                list.setAttribute('role', 'listbox');
                uiAttr(list, 'aria-label', () => uiString('cascader', 'results'));
                let activeId: string | null = null;
                if (filtered.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'pdx-cascader-loading';
                    empty.setAttribute('role', 'status');
                    empty.textContent = getComponentString('cascader', 'noMatch')();
                    _panelContentEl.appendChild(empty);
                } else {
                    filtered.forEach((item, i) => {
                        const row = document.createElement('div');
                        const off = item.path.some(n => n.disabled);
                        row.id = `${_panelId}-r-${i}`;
                        row.className = 'pdx-cascader-flat-item' + (i === searchCursor && kbd ? ' focus' : '');
                        row.setAttribute('role', 'option');
                        row.setAttribute('aria-selected', 'false');
                        if (off) row.setAttribute('aria-disabled', 'true');
                        if (i === searchCursor) activeId = row.id;
                        row.textContent = item.labels;
                        if (!off) row.addEventListener('click', () => onSearchSelect(item.path));
                        list.appendChild(row);
                    });
                    _panelContentEl.appendChild(list);
                }
                pointAt(activeId);
                return;
            }

            // Column mode
            const columnsWrap = document.createElement('div');
            columnsWrap.style.display = 'flex';
            const columns = getColumns();
            let activeId: string | null = null;
            for (let level = 0; level < columns.length; level++) {
                const col = columns[level];
                const colEl = document.createElement('div');
                colEl.className = 'pdx-cascader-column';
                colEl.setAttribute('role', 'listbox');
                // The column's accessible name (role=listbox requires it — axe aria-input-field-name).
                uiAttr(colEl, 'aria-label', () => format(uiString('cascader', 'level'), { n: level + 1 }));

                col.items.forEach((node, index) => {
                    const item = document.createElement('div');
                    const isActive = node.value === col.activeValue;
                    const hasChildren = (node.children && node.children.length > 0) || (node.isLeaf === false);
                    const isLoading = loading.has(node.value);
                    const isCursor = isActive && level === cursorLevel;
                    item.id = `${_panelId}-o-${level}-${index}`;
                    item.className = 'pdx-cascader-item' + (isActive ? ' active' : '') + (isCursor && kbd ? ' focus' : '') + (node.disabled ? ' disabled' : '');
                    item.setAttribute('role', 'option');
                    item.setAttribute('aria-selected', String(isActive));
                    // A class alone would offer disabled options as normal ones.
                    if (node.disabled) item.setAttribute('aria-disabled', 'true');
                    if (isLoading) item.setAttribute('aria-busy', 'true');
                    if (isCursor) activeId = item.id;

                    const optSlot = getOptionSlot();
                    if (optSlot) {
                        const content = optSlot({ node, level, selected: isActive });
                        item.appendChild(content instanceof DocumentFragment ? content : content);
                    } else {
                        const label = document.createElement('span');
                        label.className = 'pdx-cascader-item-label';
                        label.textContent = node.label;
                        item.appendChild(label);
                    }

                    if (hasChildren) {
                        const arrow = document.createElement('span');
                        arrow.className = 'pdx-cascader-item-arrow';
                        arrow.textContent = isLoading ? '⋯' : '›';
                        item.appendChild(arrow);
                    }

                    item.addEventListener('click', () => { _kbd.set(false); _cursorLevel.set(level); void onItemClick(node, level); });
                    colEl.appendChild(item);
                });
                columnsWrap.appendChild(colEl);
            }
            pointAt(activeId);

            // A branch being fetched: the column its children will fill says so, in words, with
            // the spinner, not only with the arrow turning «⋯». The busy state is on the option (above), not on this
            // column: a busy region may hold back its announcements until it is no longer busy,
            // which here is when the row is gone. The text is written a frame after the status
            // row is inserted, so the live region announces it (as pdx-block-ui).
            const lastCol = columns[columns.length - 1];
            if (lastCol && loading.has(lastCol.activeValue)) {
                const loadingText = getComponentString('cascader', 'loading')();
                const colEl = document.createElement('div');
                colEl.className = 'pdx-cascader-column pdx-cascader-column-loading';
                const row = document.createElement('div');
                row.className = 'pdx-cascader-loading';
                row.setAttribute('role', 'status');
                const spinner = document.createElement('span');
                spinner.className = 'pdx-cascader-spinner';
                spinner.setAttribute('aria-hidden', 'true');
                const text = document.createElement('span');
                row.append(spinner, text);
                colEl.appendChild(row);
                columnsWrap.appendChild(colEl);
                requestAnimationFrame(() => { text.textContent = loadingText; });
            }
            _panelContentEl.appendChild(columnsWrap);
        });

        // Exposes the methods on the host (the return goes only to the render context, not to the DOM element).
        (ctx.el as unknown as Record<string, unknown>).openCascader = openPopover;
        (ctx.el as unknown as Record<string, unknown>).closeCascader = closePopover;

        // Imperative API: el.getValue() / el.setValue(path) / el.clear()
        ctx.expose({
            /** The current path, as the keys from the root down. */
            getValue() { return _internalValue(); },
            /** Set the path and emit `pdx-change`. The event carries the keys only — its `labels` is empty. */
            setValue(v: string[]) { _internalValue.set(Array.isArray(v) ? v : []); setOwnProp(ctx.el, 'value', [..._internalValue.peek()]); ctx.emit('pdx-change', { value: _internalValue.peek(), labels: [] }); },
            clear() { _internalValue.set([]); setOwnProp(ctx.el, 'value', []); ctx.emit('pdx-change', { value: [], labels: [] }); ctx.emit('pdx-clear'); },
        });

        return { openPopover, closePopover };
    },
    render: () => html``,
});
