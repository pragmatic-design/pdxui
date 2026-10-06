// pdx-tree-select — Select with tree dropdown.
// Renders a hierarchical tree inside the dropdown panel.
// Supports single/multi select, search filter, lazy children, checkboxes.

import { component, html, signal } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { registerComponentStrings, getComponentString, registerFormControl, usePopover } from '@pdxui/core';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/tree-select';

// Unique ids for the tree (aria-controls from the combobox trigger).
let _tsSeq = 0;

registerComponentStrings('tree-select', {
    placeholder: 'Select...',
    search: 'Search...',
    noData: 'No data',
    noMatch: 'No match',
});

registerFormControl('pdx-tree-select', {
    valueEvent: 'pdx-change',
    valueProp: 'value',
});

export interface TreeSelectNode {
    value: string;
    label: string;
    children?: TreeSelectNode[];
    disabled?: boolean;
    isLeaf?: boolean;
}

/**
 * A select whose dropdown is a tree the user can search and expand, picking one node or several,
 * with children loaded lazily.
 *
 * @fires pdx-load-error - Fired when `loadChildren` rejects; the branch stays askable and can be reopened.
 * @slot node - Scoped — renders one node's label. Receives `{ node, level, expanded }`.
 */
component('pdx-tree-select', {
    formAssociated: true,
    props: {
        /** Tree of options */
        options: { type: Array, default: [] },
        /** Selected value(s) — string for single, string[] for multiple */
        value: { type: Object, default: null },
        /** Allow multiple selection */
        multiple: { type: Boolean, default: false },
        /** Placeholder */
        placeholder: { type: String, default: '' },
        /** Accessible name (aria-label) for the trigger; falls back to placeholder */
        label: { type: String, default: '' },
        /** Show search filter */
        searchable: { type: Boolean, default: false },
        /** Clearable */
        clearable: { type: Boolean, default: true },
        /** Disabled */
        disabled: { type: Boolean, default: false },
        /** Expand all nodes initially */
        expandAll: { type: Boolean, default: false },
        /** Lazy load: (node) => Promise<TreeSelectNode[]> */
        loadChildren: { type: Function, default: null },
        /** Size */
        size: { type: String, default: '' },
        /** Form field name */
        name: { type: String, default: '' },
    },
    setup(ctx) {
        const _open = signal(false);
        const _search = signal('');
        const _expanded = signal<Set<string>>(new Set());
        const _domReady = signal(false);
        // Internal value: string for single, string[] for multiple
        const _internalValue = signal<string | string[] | null>(null);

        const _treeId = 'pdx-tree-select-tree-' + (++_tsSeq);
        let _triggerEl: HTMLElement | null = null;
        let _textEl: HTMLElement | null = null;
        let _panelEl: HTMLElement | null = null;
        function getNodeSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['node'] as SlotFunction | undefined;
        }
        let _treeContainerEl: HTMLElement | null = null;
        let _searchInputEl: HTMLInputElement | null = null;
        let _clearEl: HTMLButtonElement | null = null;
        let _hiddenEl: HTMLInputElement | null = null;
        let _popover: ReturnType<typeof usePopover> | null = null;
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;

        // ─── Keyboard: the APG tree, driven from the trigger ──────
        // Focus stays on the trigger (or the search field), and aria-activedescendant names the
        // highlighted node. Once open, the tree takes every key the APG tree defines, not only
        // Enter/Space/Escape, and Enter selects the highlighted node.
        interface VisibleRow {
            node: TreeSelectNode; depth: number; parent: TreeSelectNode | null;
            row: HTMLElement; expandable: boolean; expanded: boolean;
        }
        /** The rows the tree shows, in order, as of its last render. */
        let _rows: VisibleRow[] = [];
        /** The highlighted node's value; null until a key moves into the tree. */
        let _activeValue: string | null = null;
        const _rowIds = new Map<string, string>();
        const rowId = (value: string): string => {
            let id = _rowIds.get(value);
            if (!id) { id = `${_treeId}-n${_rowIds.size + 1}`; _rowIds.set(value, id); }
            return id;
        };
        let _typeBuffer = '';
        let _typeTimer: ReturnType<typeof setTimeout> | null = null;
        /** Opened by ↓/↑: the first render highlights the entry row. */
        let _pendingEntry: 'first' | 'last' | null = null;

        function getOptions(): TreeSelectNode[] {
            return (ctx.options() as TreeSelectNode[]) || [];
        }

        function getSelectedValues(): Set<string> {
            const v = _internalValue();
            if (!v) return new Set();
            if (Array.isArray(v)) return new Set(v as string[]);
            return new Set([String(v)]);
        }

        function isMultiple(): boolean {
            return ctx.multiple() as boolean;
        }

        function findNode(value: string, nodes?: TreeSelectNode[]): TreeSelectNode | null {
            for (const n of (nodes || getOptions())) {
                if (n.value === value) return n;
                if (n.children) {
                    const found = findNode(value, n.children);
                    if (found) return found;
                }
            }
            return null;
        }

        function displayText(): string {
            const selected = getSelectedValues();
            if (selected.size === 0) return '';
            const labels: string[] = [];
            for (const v of selected) {
                const node = findNode(v);
                if (node) labels.push(node.label);
            }
            return labels.join(', ');
        }

        function openPopover(): void {
            if (ctx.disabled()) return;
            _open.set(true);
            if (ctx.expandAll()) {
                const all = new Set<string>();
                function walk(nodes: TreeSelectNode[]) {
                    for (const n of nodes) {
                        if (n.children && n.children.length > 0) {
                            all.add(n.value);
                            walk(n.children);
                        }
                    }
                }
                walk(getOptions());
                _expanded.set(all);
            }
            // Close on click outside (guard: a destroy is possible inside the timeout's window)
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

        // Teardown on destroy: without it, an unmount with the popover open would leave the
        // mousedown on document orphaned forever.
        ctx.track(() => () => {
            if (_outsideHandler) {
                document.removeEventListener('mousedown', _outsideHandler);
                _outsideHandler = null;
            }
            // Its scroll/resize listeners and ResizeObserver go with the component.
            _popover?.dispose();
            _popover = null;
            if (_typeTimer) { clearTimeout(_typeTimer); _typeTimer = null; }
        });

        function closePopover(): void {
            _open.set(false);
            _search.set('');
            if (_searchInputEl) _searchInputEl.value = '';
            if (_outsideHandler) {
                document.removeEventListener('mousedown', _outsideHandler);
                _outsideHandler = null;
            }
            _activeValue = null;
            applyActive();
            // The search field goes away with the panel: focus back on the trigger, not <body>.
            if (_panelEl && _panelEl.contains(document.activeElement)) _triggerEl?.focus();
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        /** Mark the highlighted row, and point aria-activedescendant at it while the tree is open. */
        function applyActive(scroll = false): void {
            const entry = _rows.find(r => r.node.value === _activeValue) ?? null;
            for (const r of _rows) r.row.classList.toggle('active', r === entry);
            const id = _open.peek() && entry ? entry.row.id : null;
            for (const owner of [_triggerEl, _searchInputEl]) {
                if (!owner) continue;
                if (id) owner.setAttribute('aria-activedescendant', id);
                else owner.removeAttribute('aria-activedescendant');
            }
            if (scroll && entry) entry.row.scrollIntoView?.({ block: 'nearest' });
        }

        function moveTo(index: number): void {
            if (_rows.length === 0) return;
            const i = Math.max(0, Math.min(index, _rows.length - 1));
            _activeValue = _rows[i].node.value;
            applyActive(true);
        }

        /** Where the first move lands: the selected node if it is showing, else the first (or last). */
        function entryIndex(fromEnd: boolean): number {
            const selected = getSelectedValues();
            const at = _rows.findIndex(r => selected.has(r.node.value));
            return at >= 0 ? at : (fromEnd ? _rows.length - 1 : 0);
        }

        /** Next row whose label starts with what was typed, cycling on a repeated letter (APG). */
        function typeAhead(char: string): void {
            _typeBuffer += char.toLowerCase();
            if (_typeTimer) clearTimeout(_typeTimer);
            _typeTimer = setTimeout(() => { _typeBuffer = ''; _typeTimer = null; }, 500);
            const from = _rows.findIndex(r => r.node.value === _activeValue);
            const find = (needle: string): number => {
                for (let k = 1; k <= _rows.length; k++) {
                    const i = (from + k + _rows.length) % _rows.length;
                    if (_rows[i].node.label.toLowerCase().startsWith(needle)) return i;
                }
                return -1;
            };
            let i = find(_typeBuffer);
            if (i < 0 && [..._typeBuffer].every(c => c === _typeBuffer[0])) i = find(_typeBuffer[0]);
            if (i >= 0) moveTo(i);
        }

        /**
         * The keys of the trigger and of the search field. Closed: ↓/↑/Enter/Space open it (↓/↑ also
         * highlight). Open: ↑/↓ move, → expands or enters the first child, ← collapses or goes to the
         * parent, Home/End, Enter (and Space on the trigger) choose, Escape closes, letters type ahead.
         * In the search field ←/→/Home/End/Space stay the field's: they edit the query.
         */
        function onKeydown(e: KeyboardEvent): void {
            const inSearch = e.target === _searchInputEl;
            if (!_open.peek()) {
                if (inSearch) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    // Set before opening: opening renders the tree synchronously.
                    _pendingEntry = e.key === 'ArrowUp' ? 'last' : 'first';
                    openPopover();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPopover();
                }
                return;
            }
            const i = _rows.findIndex(r => r.node.value === _activeValue);
            const cur = i >= 0 ? _rows[i] : null;
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    moveTo(cur ? i + 1 : entryIndex(false));
                    return;
                case 'ArrowUp':
                    e.preventDefault();
                    moveTo(cur ? i - 1 : entryIndex(true));
                    return;
                case 'Home':
                case 'End':
                    if (inSearch) return;
                    e.preventDefault();
                    moveTo(e.key === 'Home' ? 0 : _rows.length - 1);
                    return;
                case 'ArrowRight':
                    if (inSearch || !cur) return;
                    e.preventDefault();
                    if (cur.expandable && !cur.expanded) onToggle(cur.node);
                    else if (cur.expanded && _rows[i + 1]?.depth > cur.depth) moveTo(i + 1);
                    return;
                case 'ArrowLeft':
                    if (inSearch || !cur) return;
                    e.preventDefault();
                    if (cur.expandable && cur.expanded) onToggle(cur.node);
                    else if (cur.parent) { _activeValue = cur.parent.value; applyActive(true); }
                    return;
                case ' ':
                case 'Enter':
                    // Space chooses like Enter, except in the search field, where it is a space.
                    if (e.key === ' ' && inSearch) return;
                    e.preventDefault();
                    if (cur) selectNode(cur.node);
                    return;
                case 'Escape':
                    e.preventDefault();
                    closePopover();
                    _triggerEl?.focus();
                    return;
                default:
                    if (!inSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault();
                        typeAhead(e.key);
                    }
            }
        }

        function toggleExpand(value: string): void {
            const set = new Set(_expanded.peek());
            if (set.has(value)) set.delete(value); else set.add(value);
            _expanded.set(set);
        }

        // ─── Lazy children ─────────────────────────────────
        // `loadChildren` is `(node) => Promise<TreeSelectNode[]>`: a node with no `children` gets a
        // toggle that asks for its branch. The contract is `isLeaf`, on TreeSelectNode — a node that
        // declares itself a leaf is never asked.

        /** Branches that came back, by node value. A failure is deliberately NOT stored here. */
        const _loadedChildren = new Map<string, TreeSelectNode[]>();
        const _loading = signal<Set<string>>(new Set());
        /** Bumped when a branch arrives: the Map above is not reactive, and the tree must redraw. */
        const _branches = signal(0);

        function loader(): ((node: TreeSelectNode) => Promise<TreeSelectNode[]>) | null {
            return (ctx.loadChildren() as ((node: TreeSelectNode) => Promise<TreeSelectNode[]>) | null) ?? null;
        }

        /** The children of a node, declared or fetched. */
        function childrenOf(node: TreeSelectNode): TreeSelectNode[] | undefined {
            if (node.children && node.children.length > 0) return node.children;
            return _loadedChildren.get(node.value);
        }

        /** Whether the node can be opened at all — it has children, or a loader may yet find some. */
        function canExpand(node: TreeSelectNode): boolean {
            const kids = childrenOf(node);
            if (kids && kids.length > 0) return true;
            return !!loader() && node.isLeaf !== true;
        }

        async function requestChildren(node: TreeSelectNode): Promise<void> {
            const load = loader();
            if (!load || _loadedChildren.has(node.value) || _loading.peek().has(node.value)) return;
            const busy = new Set(_loading.peek());
            busy.add(node.value);
            _loading.set(busy);
            try {
                const kids = await load(node);
                _loadedChildren.set(node.value, kids ?? []);
                _branches.set(_branches.peek() + 1);
            } catch (error) {
                // Not cached, and not swallowed: an unreachable branch and an empty one look
                // identical on screen, so the failure is announced and the node stays askable.
                ctx.emit('pdx-load-error', { node, error });
            } finally {
                const done = new Set(_loading.peek());
                done.delete(node.value);
                _loading.set(done);
            }
        }

        /** Open or close a branch — and fetch it the first time, which is never a close. */
        function onToggle(node: TreeSelectNode): void {
            const kids = childrenOf(node);
            if ((!kids || kids.length === 0) && canExpand(node)) {
                const set = new Set(_expanded.peek());
                set.add(node.value);
                _expanded.set(set);
                void requestChildren(node);
                return;
            }
            toggleExpand(node.value);
        }

        function selectNode(node: TreeSelectNode): void {
            if (node.disabled) return;
            // Clicking a branch opens it rather than selecting it — including a branch that has not
            // been fetched yet, which before `loadChildren` was read could not be told from a leaf.
            if (canExpand(node) && !isMultiple()) {
                onToggle(node);
                return;
            }

            const selected = getSelectedValues();
            if (isMultiple()) {
                const newSet = new Set(selected);
                if (newSet.has(node.value)) newSet.delete(node.value);
                else newSet.add(node.value);
                const newVal = [...newSet];
                _internalValue.set(newVal);
                setOwnProp(ctx.el, 'value', [...newVal]);   // the live selection
                ctx.emit('pdx-change', { value: newVal });
            } else {
                _internalValue.set(node.value);
                setOwnProp(ctx.el, 'value', node.value);
                ctx.emit('pdx-change', { value: node.value, label: node.label });
                closePopover();
            }
        }

        function onClear(e: Event): void {
            e.stopPropagation();
            const emptyVal = isMultiple() ? [] : '';
            _internalValue.set(emptyVal);
            setOwnProp(ctx.el, 'value', emptyVal);
            ctx.emit('pdx-change', { value: emptyVal });
            ctx.emit('pdx-clear');
        }

        function matchesSearch(node: TreeSelectNode, q: string): boolean {
            if (node.label.toLowerCase().includes(q)) return true;
            if (node.children) return node.children.some(c => matchesSearch(c, q));
            return false;
        }

        // Sync external value prop → internal state
        ctx.track(() => {
            const externalVal = ctx.value();
            if (externalVal !== undefined && externalVal !== null) {
                const current = _internalValue.peek();
                const extStr = JSON.stringify(externalVal);
                const curStr = JSON.stringify(current);
                if (extStr !== curStr) {
                    _internalValue.set(Array.isArray(externalVal) ? [...externalVal as string[]] : externalVal as string);
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
            const ph = (ctx.placeholder() as string) || getComponentString('tree-select', 'placeholder')();

            _triggerEl = document.createElement('div');
            _triggerEl.className = 'pdx-cascader-trigger pdx-input-wrap' + (size ? ` pdx-input-${size}` : '') + (disabled ? ' disabled' : '');
            _triggerEl.setAttribute('role', 'combobox');
            _triggerEl.setAttribute('aria-expanded', 'false');
            _triggerEl.setAttribute('aria-haspopup', 'tree');
            // An accessible name + aria-controls pointing at the tree (role=combobox requires it).
            _triggerEl.setAttribute('aria-label', (ctx.label?.() as string) || ph);
            _triggerEl.setAttribute('aria-controls', _treeId);
            _triggerEl.setAttribute('tabindex', disabled ? '-1' : '0');
            _triggerEl.addEventListener('click', () => {
                if (_open.peek()) closePopover(); else openPopover();
            });
            _triggerEl.addEventListener('keydown', onKeydown);

            _textEl = document.createElement('span');
            _textEl.className = 'pdx-cascader-text pdx-cascader-placeholder';
            _textEl.textContent = ph;
            _triggerEl.appendChild(_textEl);

            if (clearable) {
                _clearEl = document.createElement('button') as HTMLButtonElement;
                _clearEl.type = 'button';
                _clearEl.className = 'pdx-input-clear';
                _clearEl.textContent = '×';
                _clearEl.style.display = 'none';
                _clearEl.addEventListener('click', onClear);
                _triggerEl.appendChild(_clearEl);
            }

            const icon = document.createElement('span');
            icon.className = 'pdx-cascader-icon';
            icon.textContent = '▾';
            _triggerEl.appendChild(icon);
            el.appendChild(_triggerEl);

            _panelEl = document.createElement('div');
            _panelEl.className = 'pdx-tree-select-panel';
            _panelEl.style.display = 'none';

            if (ctx.searchable()) {
                const searchWrap = document.createElement('div');
                searchWrap.className = 'pdx-tree-select-search';
                _searchInputEl = document.createElement('input');
                _searchInputEl.type = 'text';
                _searchInputEl.placeholder = getComponentString('tree-select', 'search')();
                // Named, and tied to the tree it filters: the highlight is announced from here too.
                _searchInputEl.setAttribute('aria-label', getComponentString('tree-select', 'search')());
                _searchInputEl.setAttribute('aria-controls', _treeId);
                _searchInputEl.addEventListener('input', () => _search.set(_searchInputEl!.value));
                _searchInputEl.addEventListener('keydown', onKeydown);
                searchWrap.appendChild(_searchInputEl);
                _panelEl.appendChild(searchWrap);
            }

            _treeContainerEl = document.createElement('div');
            _treeContainerEl.className = 'pdx-tree-select-tree';
            _treeContainerEl.id = _treeId;
            _treeContainerEl.setAttribute('role', 'tree');
            // The tree has the trigger's name; it had none.
            _treeContainerEl.setAttribute('aria-label', (ctx.label?.() as string) || ph);
            if (ctx.multiple()) _treeContainerEl.setAttribute('aria-multiselectable', 'true');
            _panelEl.appendChild(_treeContainerEl);

            el.appendChild(_panelEl);

            // Positioned by usePopover, `fixed` against the viewport — as pdx-select does — so a box
            // that scrolls or clips (a table, a scroll area, a card, a drawer body) cannot cut the
            // panel off. CSS `absolute` against the host would follow scroll via the containing
            // block, but it also obeys that block's overflow, and a tree inside a scrolling table
            // would be clipped.
            // Positioning ONLY: opening, closing, outside clicks and Escape stay this component's.
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

        // Reactive update
        ctx.track(() => {
            if (!_domReady()) return;
            const open = _open();
            const search = _search();
            const expanded = _expanded();
            // Read so the tree redraws when a lazy branch starts loading and when it arrives.
            void _loading();
            void _branches();
            const selected = getSelectedValues();
            const display = displayText();
            const clearable = ctx.clearable() as boolean;
            const disabled = ctx.disabled() as boolean;
            void ctx.searchable();
            const multi = isMultiple();
            const ph = (ctx.placeholder() as string) || getComponentString('tree-select', 'placeholder')();

            if (!_triggerEl) return;

            if (_textEl) {
                _textEl.textContent = display || ph;
                _textEl.className = 'pdx-cascader-text' + (display ? '' : ' pdx-cascader-placeholder');
            }
            if (_clearEl) {
                _clearEl.style.display = (clearable && display && !disabled) ? '' : 'none';
            }
            if (_triggerEl) _triggerEl.setAttribute('aria-expanded', String(open));

            if (_hiddenEl) {
                _hiddenEl.value = multi ? JSON.stringify([...selected]) : ([...selected][0] || '');
            }

            if (!_panelEl || !_treeContainerEl) return;
            _panelEl.style.display = open ? '' : 'none';
            if (open) _popover?.open(); else _popover?.close();
            const justOpened = open && !_wasOpen;
            _wasOpen = open;
            if (!open) { _rows = []; return; }

            // Focus search input when panel opens (only then: the tree redraws on every expand)
            if (_searchInputEl && justOpened) {
                setTimeout(() => _searchInputEl!.focus(), 0);
            }

            // Rebuild only the tree content (search input is persistent)
            _treeContainerEl.innerHTML = '';
            _rows = [];
            const q = search.toLowerCase();
            const opts = getOptions();
            if (opts.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'pdx-tree-select-empty';
                empty.textContent = getComponentString('tree-select', 'noData')();
                _treeContainerEl.appendChild(empty);
            } else {
                renderNodes(_treeContainerEl, opts, 0, null, expanded, selected, multi, q);
            }
            // The highlight survives the redraw; a node that is no longer showing takes it with it.
            if (_pendingEntry) {
                const fromEnd = _pendingEntry === 'last';
                _pendingEntry = null;
                if (_rows.length) _activeValue = _rows[entryIndex(fromEnd)].node.value;
            }
            if (_activeValue && !_rows.some(r => r.node.value === _activeValue)) _activeValue = null;
            applyActive(true);
        });
        let _wasOpen = false;

        function renderNodes(
            container: HTMLElement, nodes: TreeSelectNode[], depth: number, parent: TreeSelectNode | null,
            expanded: Set<string>, selected: Set<string>, multi: boolean, search: string,
        ): void {
            const shown = search ? nodes.filter(n => matchesSearch(n, search)) : nodes;
            shown.forEach((node, index) => {
                const kids = childrenOf(node);
                const hasChildren = !!kids && kids.length > 0;
                // A node whose branch has not been fetched yet still gets a toggle: that toggle is
                // the only way to ask for it.
                const expandable = hasChildren || canExpand(node);
                // A boolean: `search && hasChildren` is '' with no query, which would write
                // aria-expanded="" on every branch.
                const isExpanded = expanded.has(node.value) || (!!search && hasChildren);
                const isSelected = selected.has(node.value);

                const row = document.createElement('div');
                row.className = 'pdx-tree-node' + (isSelected ? ' selected' : '') + (node.disabled ? ' disabled' : '');
                row.style.paddingLeft = `${8 + depth * 20}px`;
                row.id = rowId(node.value);
                row.setAttribute('role', 'treeitem');
                row.setAttribute('aria-selected', String(isSelected));
                // The rows are flat siblings, indented by padding: level, set size and position say
                // what the indentation shows.
                row.setAttribute('aria-level', String(depth + 1));
                row.setAttribute('aria-setsize', String(shown.length));
                row.setAttribute('aria-posinset', String(index + 1));
                if (node.disabled) row.setAttribute('aria-disabled', 'true');
                if (expandable) row.setAttribute('aria-expanded', String(isExpanded));
                // One state, two readers: `aria-busy` for assistive technology, the toggle's `loading`
                // class for everyone else. aria-busy alone renders nothing, and the row would not say
                // the branch is coming.
                // The spinner itself is the design package's (tree-select.css).
                const isLoading = _loading.peek().has(node.value);
                if (isLoading) row.setAttribute('aria-busy', 'true');

                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'pdx-tree-toggle' + (isExpanded ? ' expanded' : '') + (expandable ? '' : ' leaf')
                    + (isLoading ? ' loading' : '');
                toggle.textContent = '›';
                toggle.setAttribute('tabindex', '-1');
                if (expandable) {
                    toggle.addEventListener('click', (e) => { e.stopPropagation(); onToggle(node); });
                }
                row.appendChild(toggle);

                if (multi) {
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = isSelected;
                    cb.disabled = !!node.disabled;
                    cb.setAttribute('tabindex', '-1');
                    cb.addEventListener('click', (e) => e.stopPropagation());
                    row.appendChild(cb);
                }

                const nodeSlot = getNodeSlot();
                if (nodeSlot) {
                    const content = nodeSlot({ node, level: depth, expanded: isExpanded });
                    row.appendChild(content instanceof DocumentFragment ? content : content);
                } else {
                    const label = document.createElement('span');
                    label.className = 'pdx-tree-node-label';
                    label.textContent = node.label;
                    row.appendChild(label);
                }

                row.addEventListener('click', () => { _activeValue = node.value; selectNode(node); });
                container.appendChild(row);
                _rows.push({ node, depth, parent, row, expandable, expanded: isExpanded });

                if (hasChildren && isExpanded) {
                    renderNodes(container, kids!, depth + 1, node, expanded, selected, multi, search);
                }
            });
        }

        // Exposes the methods on the host (the return goes only to the render context, not to the DOM element).
        (ctx.el as unknown as Record<string, unknown>).openTreeSelect = openPopover;
        (ctx.el as unknown as Record<string, unknown>).closeTreeSelect = closePopover;

        // Imperative API: el.getValue() / el.setValue(v) / el.clear()
        ctx.expose({
            /** The current selection: one key, the array of keys when `multiple`, or null. */
            getValue() { return _internalValue(); },
            /** Set the selection and emit `pdx-change`, as a click on the tree would. */
            setValue(v: string | string[] | null) { _internalValue.set(v); setOwnProp(ctx.el, 'value', v); ctx.emit('pdx-change', { value: v }); },
            clear() {
                const empty = Array.isArray(_internalValue.peek()) ? [] : null;
                _internalValue.set(empty as string[] | null);
                setOwnProp(ctx.el, 'value', empty);
                ctx.emit('pdx-change', { value: empty });
                ctx.emit('pdx-clear');
            },
        });

        return { openPopover, closePopover };
    },
    render: () => html``,
});
