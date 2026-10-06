// pdx-transfer — Dual-list shuttle component.
// Move items between "source" (left) and "target" (right) panels.
//
// Three data models:
// 1. Simple: items[] + value[] (value = target keys)
// 2. DataSource + assignedField (boolean): single dataset, field determines panel
// 3. DataSource + assignedField + assignedValue: field === value determines panel
//
// Modes:
// - checkbox (default): checkboxes on each item, bulk move via buttons
// - simple: click to select (highlight), buttons to move selected
// - direct: click item to move it immediately (no selection step)

import { component, html, signal } from '@pdxui/core';
import { registerComponentStrings, getComponentString } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/transfer';

registerComponentStrings('transfer', {
    source: 'Source',
    target: 'Target',
    search: 'Search',
    /** A search field's name: the list it filters. */
    searchIn: 'Search {list}',
    selectAll: 'Select all',
    noData: 'No data',
    noMatch: 'No match',
    moveRight: 'Move to target',
    moveLeft: 'Move to source',
    moveAllRight: 'Move all to target',
    moveAllLeft: 'Move all to source',
});

export interface TransferItem {
    value: string;
    label: string;
    disabled?: boolean;
    /** Original data object (for DataSource mode) */
    _raw?: any;
}

/**
 * A dual-list shuttle: the user moves items between a source list and a target list, with search,
 * select-all and disabled items, and the chosen values take part in a form.
 */
component('pdx-transfer', {
    props: {
        // ── Model 1: Simple (items + value) ──
        /** All items — array of { value, label, disabled? } */
        items: { type: Array, default: [] },
        /** Values currently in the target (right) panel */
        value: { type: Array, default: [] },

        // ── Model 2/3: DataSource ──
        /** DataSource or raw array of objects */
        source: { type: Object, default: null },
        /** Field to use as item label (default: 'label') */
        labelField: { type: String, default: 'label' },
        /** Field to use as item value/id (default: 'value') */
        valueField: { type: String, default: 'value' },
        /** Field that determines left vs right panel (boolean or matched value) */
        assignedField: { type: String, default: '' },
        /** Value to match against assignedField for target panel (if omitted, treats as boolean) */
        assignedValue: { type: String, default: '' },

        // ── UI Options ──
        /** Selection mode: 'checkbox' (default) | 'simple' (click highlight) | 'direct' (click to move) */
        mode: { type: String, default: 'checkbox' },
        /** Show search input in panels */
        searchable: { type: Boolean, default: false },
        /** Left panel title */
        sourceTitle: { type: String, default: '' },
        /** Right panel title */
        targetTitle: { type: String, default: '' },
        /** Disabled state */
        disabled: { type: Boolean, default: false },
        /** Component size */
        size: { type: String, default: '' },
        /** Show "move all" buttons */
        showAllButtons: { type: Boolean, default: false },
        /** Enable drag and drop */
        draggable: { type: Boolean, default: false },
        /** Form field name */
        name: { type: String, default: '' },
    },
    setup(ctx) {
        const _sourceChecked = signal<Set<string>>(new Set());
        const _targetChecked = signal<Set<string>>(new Set());
        const _sourceSearch = signal('');
        const _targetSearch = signal('');
        const _domReady = signal(false);
        // Internal value state — updated on move, synced from prop
        const _internalValue = signal<string[]>([]);
        let _valueSyncedFromProp = false;

        // DOM refs
        let _sourceListEl: HTMLElement | null = null;
        let _targetListEl: HTMLElement | null = null;
        let _sourceCountEl: HTMLElement | null = null;
        let _targetCountEl: HTMLElement | null = null;
        let _sourceAllCb: HTMLInputElement | null = null;
        let _targetAllCb: HTMLInputElement | null = null;
        let _moveRightBtn: HTMLButtonElement | null = null;
        let _moveLeftBtn: HTMLButtonElement | null = null;
        let _moveAllRightBtn: HTMLButtonElement | null = null;
        let _moveAllLeftBtn: HTMLButtonElement | null = null;
        let _hiddenEl: HTMLInputElement | null = null;

        // Drag state
        let _dragValue: string | null = null;
        let _dragSide: 'source' | 'target' | null = null;

        // ── Data resolution: normalize all 3 models to TransferItem[] ──

        function isDataSourceMode(): boolean {
            return !!(ctx.assignedField() as string);
        }

        function resolveSourceData(): any[] {
            const src = ctx.source() as any;
            if (!src) return [];
            if (typeof src === 'object' && typeof src.data === 'function') return src.data() || [];
            if (Array.isArray(src)) return src;
            return [];
        }

        function normalizeItem(obj: any): TransferItem {
            const lf = (ctx.labelField() as string) || 'label';
            const vf = (ctx.valueField() as string) || 'value';
            return {
                value: String(obj[vf] ?? ''),
                label: String(obj[lf] ?? obj[vf] ?? ''),
                disabled: !!obj.disabled,
                _raw: obj,
            };
        }

        function isAssigned(obj: any): boolean {
            const af = ctx.assignedField() as string;
            if (!af) return false;
            const av = ctx.assignedValue() as string;
            const fieldVal = obj[af];
            if (av) return String(fieldVal) === av;
            return !!fieldVal;
        }

        function getAllItems(): TransferItem[] {
            if (isDataSourceMode()) {
                return resolveSourceData().map(normalizeItem);
            }
            return ((ctx.items() as TransferItem[]) || []).map(i => ({
                value: i.value, label: i.label, disabled: !!i.disabled,
            }));
        }

        /** Compute target values from DataSource (used for initialization) */
        function computeTargetFromSource(): string[] {
            const data = resolveSourceData();
            const vf = (ctx.valueField() as string) || 'value';
            return data.filter(isAssigned).map((o: any) => String(o[vf] ?? ''));
        }

        // Local overrides of the moves (for DataSource mode): the base partition
        // ALWAYS derives from the assigned field of the current dataset — a reload of the DS
        // repartitions the new rows correctly — and the local moves
        // not yet persisted stay applied as an overlay.
        const _localOverrides = new Map<string, boolean>();
        const _overridesVersion = signal(0);

        function getTargetValues(): Set<string> {
            if (isDataSourceMode()) {
                _overridesVersion();
                const base = new Set(computeTargetFromSource());
                for (const [v, inTarget] of _localOverrides) {
                    if (inTarget) base.add(v);
                    else base.delete(v);
                }
                return base;
            }
            return new Set(_internalValue());
        }

        function sourceItems(): TransferItem[] {
            const targetVals = getTargetValues();
            let items = getAllItems().filter(i => !targetVals.has(i.value));
            const q = _sourceSearch().trim().toLowerCase();
            if (q) items = items.filter(i => i.label.toLowerCase().includes(q));
            return items;
        }

        function targetItems(): TransferItem[] {
            const targetVals = getTargetValues();
            let items = getAllItems().filter(i => targetVals.has(i.value));
            const q = _targetSearch().trim().toLowerCase();
            if (q) items = items.filter(i => i.label.toLowerCase().includes(q));
            return items;
        }

        function getMode(): string {
            return (ctx.mode() as string) || 'checkbox';
        }

        // ── Move operations ──

        function applyMove(movedValues: string[], direction: 'right' | 'left'): void {
            const targetVals = getTargetValues();
            let newTargetSet: Set<string>;

            if (direction === 'right') {
                newTargetSet = new Set([...targetVals, ...movedValues]);
            } else {
                const removeSet = new Set(movedValues);
                newTargetSet = new Set([...targetVals].filter(v => !removeSet.has(v)));
            }
            const newTarget = [...newTargetSet];

            if (isDataSourceMode()) {
                // A local overlay + an event: NO direct mutation of the row
                // objects — mutating the original would break the computeDiff of whoever persists
                // through ds.update() (an empty diff → the PATCH never sent).
                for (const v of movedValues) _localOverrides.set(v, direction === 'right');
                _overridesVersion.set(x => x + 1);

                const af = ctx.assignedField() as string;
                const av = ctx.assignedValue() as string;
                const assignedTrue = av || true;
                const assignedFalse = av ? '' : false;
                const changes = movedValues.map(v => ({
                    value: v,
                    [af]: direction === 'right' ? assignedTrue : assignedFalse,
                }));
                ctx.emit('pdx-change', { changes, targetValues: [...getTargetValues()], direction });
            } else {
                _internalValue.set(newTarget);
                // The target list is the host's `value`. In DataSource mode above the
                // partition comes from the source and `value` is not read.
                setOwnProp(ctx.el, 'value', [...newTarget]);
                ctx.emit('pdx-change', { value: newTarget });
            }
        }

        function moveRight(): void {
            const checked = _sourceChecked.peek();
            if (checked.size === 0) return;
            const vals = [...checked].filter(v => {
                const item = getAllItems().find(i => i.value === v);
                return item && !item.disabled;
            });
            _sourceChecked.set(new Set());
            if (vals.length > 0) applyMove(vals, 'right');
        }

        function moveLeft(): void {
            const checked = _targetChecked.peek();
            if (checked.size === 0) return;
            const vals = [...checked].filter(v => {
                const item = getAllItems().find(i => i.value === v);
                return item && !item.disabled;
            });
            _targetChecked.set(new Set());
            if (vals.length > 0) applyMove(vals, 'left');
        }

        function moveAllRight(): void {
            const vals = sourceItems().filter(i => !i.disabled).map(i => i.value);
            _sourceChecked.set(new Set());
            if (vals.length > 0) applyMove(vals, 'right');
        }

        function moveAllLeft(): void {
            const vals = targetItems().filter(i => !i.disabled).map(i => i.value);
            _targetChecked.set(new Set());
            if (vals.length > 0) applyMove(vals, 'left');
        }

        function moveSingleItem(value: string, direction: 'right' | 'left'): void {
            const item = getAllItems().find(i => i.value === value);
            if (!item || item.disabled) return;
            applyMove([value], direction);
        }

        function toggleChecked(side: 'source' | 'target', value: string): void {
            if (ctx.disabled() as boolean) return;
            const mode = getMode();
            if (mode === 'direct') {
                // Click = move immediately
                moveSingleItem(value, side === 'source' ? 'right' : 'left');
                return;
            }
            const sig = side === 'source' ? _sourceChecked : _targetChecked;
            const set = new Set(sig.peek());
            if (mode === 'simple') {
                // Simple mode: toggle selection (no checkbox visual)
                if (set.has(value)) set.delete(value); else set.add(value);
            } else {
                // Checkbox mode
                if (set.has(value)) set.delete(value); else set.add(value);
            }
            sig.set(set);
        }

        function toggleAll(side: 'source' | 'target'): void {
            const items = side === 'source' ? sourceItems() : targetItems();
            const sig = side === 'source' ? _sourceChecked : _targetChecked;
            const enabled = items.filter(i => !i.disabled);
            const checked = sig.peek();
            const allChecked = enabled.length > 0 && enabled.every(i => checked.has(i.value));
            sig.set(allChecked ? new Set() : new Set(enabled.map(i => i.value)));
        }

        // ── Drag and drop ──

        function onDragStart(e: DragEvent, value: string, side: 'source' | 'target'): void {
            _dragValue = value;
            _dragSide = side;
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', value);
            }
            const target = e.currentTarget as HTMLElement;
            target.classList.add('dragging');
        }

        function onDragEnd(e: DragEvent): void {
            _dragValue = null;
            _dragSide = null;
            const target = e.currentTarget as HTMLElement;
            target.classList.remove('dragging');
        }

        function onDragOver(e: DragEvent, side: 'source' | 'target'): void {
            if (_dragSide === side) return; // same panel, ignore
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        }

        function onDrop(e: DragEvent, side: 'source' | 'target'): void {
            e.preventDefault();
            if (!_dragValue || _dragSide === side) return;
            const direction = side === 'target' ? 'right' : 'left';
            moveSingleItem(_dragValue, direction);
            _dragValue = null;
            _dragSide = null;
        }

        // (In DataSource mode the partition is derived live from
        // computeTargetFromSource + the overlay — see getTargetValues.)
        ctx.track(() => {
            if (!isDataSourceMode()) {
                const externalVal = ctx.value() as string[];
                if (externalVal && Array.isArray(externalVal)) {
                    if (!_valueSyncedFromProp) {
                        _valueSyncedFromProp = true;
                        _internalValue.set([...externalVal]);
                    } else {
                        const current = _internalValue.peek();
                        const curSet = new Set(current);
                        if (externalVal.length !== current.length || externalVal.some(v => !curSet.has(v))) {
                            _internalValue.set([...externalVal]);
                        }
                    }
                }
            }
        });

        // ── Build DOM once (a frame so render: html`` doesn't clear it; ctx.frame so a setup a move
        // destroyed does not build again) ──
        ctx.frame(() => {
            const el = ctx.el;
            const disabled = ctx.disabled() as boolean;
            const searchable = ctx.searchable() as boolean;
            const showAll = ctx.showAllButtons() as boolean;
            const size = ctx.size() as string;
            const name = ctx.name() as string;
            const mode = getMode();
            const isDraggable = ctx.draggable() as boolean;
            const srcTitle = (ctx.sourceTitle() as string) || getComponentString('transfer', 'source')();
            const tgtTitle = (ctx.targetTitle() as string) || getComponentString('transfer', 'target')();

            const root = document.createElement('div');
            root.className = 'pdx-transfer' + (size ? ` pdx-transfer-${size}` : '') + (disabled ? ' disabled' : '') + (isDraggable ? ' pdx-transfer-draggable' : '');
            root.setAttribute('role', 'group');
            uiAttr(root, 'aria-label', () => uiString('transfer', 'label'));

            // Source panel
            const srcPanel = buildPanel('source', srcTitle, searchable, mode);
            _sourceListEl = srcPanel.querySelector('.pdx-transfer-list')!;
            _sourceCountEl = srcPanel.querySelector('.pdx-transfer-count')!;
            _sourceAllCb = srcPanel.querySelector('.pdx-transfer-select-all') as HTMLInputElement;
            if (isDraggable) {
                _sourceListEl.addEventListener('dragover', (e) => onDragOver(e, 'source'));
                _sourceListEl.addEventListener('drop', (e) => onDrop(e, 'source'));
            }
            root.appendChild(srcPanel);

            // Action buttons (hide in direct mode)
            if (mode !== 'direct') {
                const actions = document.createElement('div');
                actions.className = 'pdx-transfer-actions';
                if (showAll) {
                    _moveAllRightBtn = makeBtn('»', getComponentString('transfer', 'moveAllRight')());
                    _moveAllRightBtn.addEventListener('click', moveAllRight);
                    actions.appendChild(_moveAllRightBtn);
                }
                _moveRightBtn = makeBtn('›', getComponentString('transfer', 'moveRight')());
                _moveRightBtn.addEventListener('click', moveRight);
                actions.appendChild(_moveRightBtn);
                _moveLeftBtn = makeBtn('‹', getComponentString('transfer', 'moveLeft')());
                _moveLeftBtn.addEventListener('click', moveLeft);
                actions.appendChild(_moveLeftBtn);
                if (showAll) {
                    _moveAllLeftBtn = makeBtn('«', getComponentString('transfer', 'moveAllLeft')());
                    _moveAllLeftBtn.addEventListener('click', moveAllLeft);
                    actions.appendChild(_moveAllLeftBtn);
                }
                root.appendChild(actions);
            }

            // Target panel
            const tgtPanel = buildPanel('target', tgtTitle, searchable, mode);
            _targetListEl = tgtPanel.querySelector('.pdx-transfer-list')!;
            _targetCountEl = tgtPanel.querySelector('.pdx-transfer-count')!;
            _targetAllCb = tgtPanel.querySelector('.pdx-transfer-select-all') as HTMLInputElement;
            if (isDraggable) {
                _targetListEl.addEventListener('dragover', (e) => onDragOver(e, 'target'));
                _targetListEl.addEventListener('drop', (e) => onDrop(e, 'target'));
            }
            root.appendChild(tgtPanel);

            if (name) {
                _hiddenEl = document.createElement('input');
                _hiddenEl.type = 'hidden';
                _hiddenEl.name = name;
                root.appendChild(_hiddenEl);
            }
            el.appendChild(root);
            _domReady.set(true);
        });

        // ── Reactive update ──
        ctx.track(() => {
            if (!_domReady()) return;
            const src = sourceItems();
            const tgt = targetItems();
            const srcChecked = _sourceChecked();
            const tgtChecked = _targetChecked();
            const mode = getMode();
            const isDraggable = ctx.draggable() as boolean;

            renderList(_sourceListEl!, src, srcChecked, 'source', mode, isDraggable);
            renderList(_targetListEl!, tgt, tgtChecked, 'target', mode, isDraggable);

            const allItems = getAllItems();
            const targetVals = getTargetValues();
            const allSrcCount = allItems.filter(i => !targetVals.has(i.value)).length;
            const allTgtCount = allItems.filter(i => targetVals.has(i.value)).length;
            if (_sourceCountEl) _sourceCountEl.textContent = `${srcChecked.size}/${allSrcCount}`;
            if (_targetCountEl) _targetCountEl.textContent = `${tgtChecked.size}/${allTgtCount}`;

            if (_sourceAllCb) {
                const enabled = src.filter(i => !i.disabled);
                _sourceAllCb.checked = enabled.length > 0 && enabled.every(i => srcChecked.has(i.value));
                _sourceAllCb.indeterminate = !_sourceAllCb.checked && enabled.some(i => srcChecked.has(i.value));
            }
            if (_targetAllCb) {
                const enabled = tgt.filter(i => !i.disabled);
                _targetAllCb.checked = enabled.length > 0 && enabled.every(i => tgtChecked.has(i.value));
                _targetAllCb.indeterminate = !_targetAllCb.checked && enabled.some(i => tgtChecked.has(i.value));
            }

            if (_moveRightBtn) _moveRightBtn.disabled = srcChecked.size === 0;
            if (_moveLeftBtn) _moveLeftBtn.disabled = tgtChecked.size === 0;
            if (_moveAllRightBtn) _moveAllRightBtn.disabled = allSrcCount === 0;
            if (_moveAllLeftBtn) _moveAllLeftBtn.disabled = allTgtCount === 0;

            if (_hiddenEl) _hiddenEl.value = JSON.stringify([...getTargetValues()]);
        });

        // ── DOM builders ──

        // ── One tab stop per list ──
        // Each list keeps one option in the tab order — the one used last — and a rebuild puts
        // focus back where it was: the rebuild after a click or Space destroys the focused row,
        // which would drop focus on <body>.
        const _stop: Record<'source' | 'target', string | null> = { source: null, target: null };

        /** Make `row` its list's tab stop, and optionally move focus to it. */
        function takeStop(container: HTMLElement, side: 'source' | 'target', row: HTMLElement, focus: boolean): void {
            for (const r of container.querySelectorAll<HTMLElement>('.pdx-transfer-item:not(.disabled)')) {
                r.tabIndex = r === row ? 0 : -1;
            }
            _stop[side] = row.dataset.value ?? null;
            if (focus) row.focus();
        }

        function renderList(
            container: HTMLElement, items: TransferItem[], checked: Set<string>,
            side: 'source' | 'target', mode: string, isDraggable: boolean,
        ): void {
            // Where focus was, so the rebuild can put it back: on the same option, or — when that
            // option has moved to the other list — on the one that took its place.
            const focused = container.contains(document.activeElement)
                ? (document.activeElement as HTMLElement).closest<HTMLElement>('.pdx-transfer-item') : null;
            const focusedValue = focused?.dataset.value ?? null;
            const focusedIndex = focused
                ? Array.from(container.querySelectorAll('.pdx-transfer-item:not(.disabled)')).indexOf(focused) : -1;
            container.innerHTML = '';
            if (items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'pdx-transfer-empty';
                const q = side === 'source' ? _sourceSearch.peek() : _targetSearch.peek();
                empty.textContent = q ? getComponentString('transfer', 'noMatch')() : getComponentString('transfer', 'noData')();
                container.appendChild(empty);
                return;
            }
            for (const item of items) {
                const isChecked = checked.has(item.value);
                const row = document.createElement('div');
                row.className = 'pdx-transfer-item'
                    + (isChecked ? ' checked' : '')
                    + (item.disabled ? ' disabled' : '')
                    + (mode === 'direct' ? ' clickable' : '');
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', isChecked ? 'true' : 'false');
                // Disabled options expose aria-disabled (the presentational check is a <span>, so the
                // disabled state must be programmatic for assistive tech, not just the .disabled class).
                if (item.disabled) row.setAttribute('aria-disabled', 'true');

                // Checkbox only in checkbox mode
                if (mode === 'checkbox') {
                    // A PRESENTATIONAL checkbox (a span, not an <input>): an interactive control inside a
                    // role=option violates WAI-ARIA (axe nested-interactive). The state is already on the option's
                    // aria-selected + the row's .checked class (the CSS draws the tick). The toggle stays
                    // on the row's click. aria-hidden: outside the a11y tree.
                    const cb = document.createElement('span');
                    cb.className = 'pdx-transfer-check';
                    cb.setAttribute('aria-hidden', 'true');
                    row.appendChild(cb);
                }

                const label = document.createElement('span');
                label.className = 'pdx-transfer-item-label';
                label.textContent = item.label;
                row.appendChild(label);

                // Drag support
                if (isDraggable && !item.disabled) {
                    row.draggable = true;
                    row.addEventListener('dragstart', (e) => onDragStart(e, item.value, side));
                    row.addEventListener('dragend', onDragEnd);
                }

                if (!item.disabled) {
                    // A click focuses the option too (Chromium does, with a tabindex); the rebuild the
                    // click triggers then puts focus back on it — see the end of this function.
                    row.addEventListener('click', () => { _stop[side] = item.value; toggleChecked(side, item.value); });
                    // Keyboard nav, so the component is usable from the
                    // keyboard: Space/Enter toggle, the arrows move the focus,
                    // Home/End to the first/last.
                    row.tabIndex = -1;
                    row.dataset.value = item.value;
                    row.addEventListener('focus', () => takeStop(container, side, row, false));
                    row.addEventListener('keydown', (e: KeyboardEvent) => {
                        const focusables = () => Array.from(
                            container.querySelectorAll<HTMLElement>('.pdx-transfer-item:not(.disabled)'));
                        const go = (to: HTMLElement | undefined): void => { if (to) takeStop(container, side, to, true); };
                        if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            _stop[side] = row.dataset.value!;
                            toggleChecked(side, row.dataset.value!);
                        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            const rows = focusables();
                            const idx = rows.indexOf(row);
                            go(e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1]);
                        } else if (e.key === 'Home') {
                            e.preventDefault();
                            go(focusables()[0]);
                        } else if (e.key === 'End') {
                            e.preventDefault();
                            const rows = focusables();
                            go(rows[rows.length - 1]);
                        }
                    });
                }
                container.appendChild(row);
            }

            // Exactly one tab stop: the option used last, else the one now in its place, else the first.
            const rows = Array.from(container.querySelectorAll<HTMLElement>('.pdx-transfer-item:not(.disabled)'));
            if (rows.length === 0) return;
            const byValue = (v: string | null): HTMLElement | undefined => (v ? rows.find(r => r.dataset.value === v) : undefined);
            const stop = byValue(focusedValue) ?? byValue(_stop[side])
                ?? (focusedIndex >= 0 ? rows[Math.min(focusedIndex, rows.length - 1)] : rows[0]);
            takeStop(container, side, stop, focused !== null);
        }

        function buildPanel(side: 'source' | 'target', title: string, searchable: boolean, mode: string): HTMLElement {
            const panel = document.createElement('div');
            panel.className = 'pdx-transfer-panel';
            // role=group (NOT listbox): the real listbox is the inner .pdx-transfer-list; two nested
            // listboxes are invalid (axe aria-required-children/parent).
            panel.setAttribute('role', 'group');
            panel.setAttribute('aria-label', title);

            const header = document.createElement('div');
            header.className = 'pdx-transfer-header';

            if (mode === 'checkbox') {
                const lbl = document.createElement('label');
                const allCb = document.createElement('input');
                allCb.type = 'checkbox';
                allCb.className = 'pdx-transfer-select-all';
                allCb.addEventListener('change', () => toggleAll(side));
                lbl.appendChild(allCb);
                const titleSpan = document.createElement('span');
                titleSpan.textContent = title;
                lbl.appendChild(titleSpan);
                header.appendChild(lbl);
            } else {
                const titleSpan = document.createElement('span');
                titleSpan.className = 'pdx-transfer-title';
                titleSpan.textContent = title;
                header.appendChild(titleSpan);
            }

            const count = document.createElement('span');
            count.className = 'pdx-transfer-count';
            count.textContent = '0/0';
            header.appendChild(count);
            panel.appendChild(header);

            if (searchable) {
                const searchWrap = document.createElement('div');
                searchWrap.className = 'pdx-transfer-search';
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = getComponentString('transfer', 'search')();
                // Named after its list: two fields both called "Search" were told apart by nothing.
                input.setAttribute('aria-label', getComponentString('transfer', 'searchIn')().replace('{list}', title));
                input.addEventListener('input', () => {
                    if (side === 'source') _sourceSearch.set(input.value);
                    else _targetSearch.set(input.value);
                });
                searchWrap.appendChild(input);
                panel.appendChild(searchWrap);
            }

            const list = document.createElement('div');
            list.className = 'pdx-transfer-list';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', title);
            if (mode !== 'direct') list.setAttribute('aria-multiselectable', 'true');
            panel.appendChild(list);
            return panel;
        }

        function makeBtn(icon: string, label: string): HTMLButtonElement {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdx-transfer-btn';
            btn.setAttribute('aria-label', label);
            btn.textContent = icon;
            return btn;
        }

        // Imperative API: el.getValue() / el.setValue(v) / el.clear() (value = target values)
        ctx.expose({
            /** The keys currently on the target side. */
            getValue() { return _internalValue(); },
            /** Replace the target side and emit `pdx-change`, dropping any move not yet committed. */
            setValue(v: string[]) {
                _localOverrides.clear(); _overridesVersion.set(x => x + 1);
                _internalValue.set(Array.isArray(v) ? v : []);
                setOwnProp(ctx.el, 'value', [..._internalValue.peek()]);
                ctx.emit('pdx-change', { value: _internalValue.peek() });
            },
            clear() {
                _localOverrides.clear(); _overridesVersion.set(x => x + 1);
                _internalValue.set([]);
                setOwnProp(ctx.el, 'value', []);
                ctx.emit('pdx-change', { value: [] }); ctx.emit('pdx-clear');
            },
        });

        return {};
    },
    render: () => html``,
});
