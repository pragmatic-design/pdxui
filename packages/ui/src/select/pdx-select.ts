// pdx-select — Unified Select / Combobox / MultiSelect.
// Single component: `searchable` enables type-to-filter (combobox ARIA),
// `multiple` enables multi-select with chip tags.
// Consumes DataSource or plain arrays. Virtual scroll auto-activates for >100 items.

import { component, html, signal, computed, effect } from '@pdxui/core';
import { createDataSource, isDataSource, tryInject } from '@pdxui/core';
import { usePopover, overlayStack } from '@pdxui/core';
import { createVirtualizer } from '@pdxui/core';
import type { DataSource, PopoverPlacement } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/select';
// The multi-select's tags are drawn with .pdx-chip, which chip.css owns.
import '@pdxui/design/components/chip';

let _selectCounter = 0;

// ─── Normalisation helpers ───────────────────────────────────

interface NormalisedOption { label: string; value: unknown; _raw: unknown }

function normaliseOptions(
    raw: unknown[],
    labelField: string,
    valueField: string,
): NormalisedOption[] {
    if (!raw || raw.length === 0) return [];
    const first = raw[0];
    if (typeof first === 'string' || typeof first === 'number') {
        return raw.map(v => ({ label: String(v), value: v, _raw: v }));
    }
    return raw.map(item => {
        const obj = item as Record<string, unknown>;
        return {
            label: String(obj[labelField] ?? ''),
            value: obj[valueField] ?? item,
            _raw: item,
        };
    });
}

// ─── Component ───────────────────────────────────────────────

/**
 * One control that is a select, a combobox or a multi-select, chosen by the searchable and multiple
 * props, fed by an array or a DataSource.
 *
 * @slot item - Scoped — renders one option in the list. Receives `{ label, value, raw, index }` (`raw` is the original option).
 * @slot selected - Scoped — renders the selected value in the trigger. Receives `{ label, value, raw }`.
 */
component('pdx-select', {
    formAssociated: true,
    props: {
        options: { type: Array, default: () => [] },
        /** DataSource instance — dedicated prop for data-driven select. Takes priority over options. */
        source: { type: Object, default: null },
        value: { type: String, default: null },
        labelField: { type: String, default: 'label' },
        valueField: { type: String, default: 'value' },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
        clearable: { type: Boolean, default: false },
        searchable: { type: Boolean, default: false },
        multiple: { type: Boolean, default: false },
        /** Multi mode: collapse selected tags in the trigger to keep it compact.
         *  -1 = unlimited (default, show all chips); 0 = summary only ("N selected");
         *  N>0 = show N chips + a "+K" overflow chip. The dropdown is unaffected. */
        maxTagCount: { type: Number, default: -1 },
        // Five sizes: the trigger is a `.pdx-input-wrap`, sized by inputs.css, and select.css sizes the caret.
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input. */
        size: { type: String, default: '', enum: ['xs', 'sm', 'md', 'lg', 'xl'] },
        name: { type: String, default: '' },
        loading: { type: Boolean, default: false },
        groupField: { type: String, default: '' },
        /** The combobox's accessible name, and its listbox's. Not needed inside a pdx-form-field with a
         *  label, after a pdx-label, or with a <label for> the select's id: those name it. */
        label: { type: String, default: '' },
        /** Custom render for each option: (item: {label, value, _raw}) => string|Node */
        itemTemplate: { type: Object, default: null },
        /** Custom render for selected value in trigger: (item: {label, value, _raw}) => string|Node */
        selectedTemplate: { type: Object, default: null },
        /** Where to show search input: 'trigger' (default) or 'dropdown' */
        searchPosition: { type: String, default: 'trigger' },
        /** Allow creating new options when search has no match. Emits pdx-create. */
        creatable: { type: Boolean, default: false },
        /** Label template for the create option. Use {query} as placeholder. Empty: the select.create
         *  component string, «Create "{query}"» in English. */
        createLabel: { type: String, default: '' },
        /** Enable debounced server-side filtering for remote DataSource. */
        remote: { type: Boolean, default: false },
        /** Debounce delay in ms for remote search. */
        debounce: { type: Number, default: 200 },
    },
    setup(ctx) {
        const uid = 'pdx-sel-' + (++_selectCounter);
        const listboxId = uid + '-lb';

        // ── Internal state ──
        const _open = signal(false);
        const _query = signal('');
        const _activeIndex = signal(-1);
        const _selectedValues = signal<Set<unknown>>(new Set());
        // Tracks whether user has typed in the search input (vs just opened)
        const _userTyped = signal(false);

        // ── Derived DataSource from options ──
        const _dsRef = signal<DataSource<Record<string, unknown>> | null>(null);
        const _isExternalDS = signal(false);
        let _searchDebounceTimer: any = null;

        // Sync source/options → internal DataSource
        // Priority: source prop > Context Protocol > options (array or DS)
        ctx.track(() => {
            const src = ctx.source() as unknown;
            const opts = ctx.options() as unknown;
            const lf = ctx.labelField() as string || 'label';
            const vf = ctx.valueField() as string || 'value';

            // source prop takes priority — accepts DataSource or ref to <pdx-data-source>
            if (src) {
                let ds: DataSource<Record<string, unknown>> | null = null;
                if (isDataSource(src)) {
                    ds = src as DataSource<Record<string, unknown>>;
                } else if (src instanceof HTMLElement && typeof (src as any).source === 'function') {
                    ds = (src as any).source();
                }
                if (ds) {
                    _isExternalDS.set(true);
                    _dsRef.set(ds);
                    return;
                }
            }

            // Fallback: Context Protocol from ancestor <pdx-data-source>
            const injected = tryInject<DataSource<any>>('dataSource', ctx.el);
            if (injected && isDataSource(injected)) {
                _isExternalDS.set(true);
                _dsRef.set(injected as DataSource<Record<string, unknown>>);
                return;
            }

            if (isDataSource(opts)) {
                _isExternalDS.set(true);
                _dsRef.set(opts as DataSource<Record<string, unknown>>);
            } else {
                _isExternalDS.set(false);
                const arr = Array.isArray(opts) ? opts : [];
                const ds = createDataSource({
                    data: normaliseOptions(arr, lf, vf) as any[],
                    pageSize: 0,
                    idField: 'value',
                    autoLoad: true,
                });
                _dsRef.set(ds);
            }
        });

        // Filtered items (from DS or internal)
        const filteredItems = computed((): NormalisedOption[] => {
            const ds = _dsRef();
            if (!ds) return [];
            if (_isExternalDS()) {
                const lf = ctx.labelField() as string || 'label';
                const vf = ctx.valueField() as string || 'value';
                return ds.data().map(item => ({
                    label: String(item[lf] ?? ''),
                    value: item[vf] ?? item,
                    _raw: item,
                }));
            }
            return ds.data() as unknown as NormalisedOption[];
        });

        // Grouped items
        const groupedItems = computed(() => {
            const gf = ctx.groupField() as string;
            if (!gf) return null;
            const items = filteredItems();
            const groups = new Map<string, NormalisedOption[]>();
            for (const item of items) {
                const raw = item._raw as Record<string, unknown>;
                const key = String(raw[gf] ?? '');
                let bucket = groups.get(key);
                if (!bucket) { bucket = []; groups.set(key, bucket); }
                bucket.push(item);
            }
            return groups;
        });

        // Flat list for keyboard nav (respects grouping order)
        const flatItems = computed((): NormalisedOption[] => {
            const grouped = groupedItems();
            if (!grouped) return filteredItems();
            const result: NormalisedOption[] = [];
            for (const items of grouped.values()) {
                result.push(...items);
            }
            return result;
        });

        // ── Selection state ──
        // Guard: true while reflectValue() writes back to the `value` prop, so the
        // external-value sync below skips re-deriving _selectedValues from a value we
        // ourselves just set (avoids a redundant Set rebuild + render after every pick).
        let _reflecting = false;

        // Sync external value prop → internal selection (null/empty = clear).
        // One-way: parent sets el.value = x → selection updates (UI-01 prop reactivity).
        ctx.track(() => {
            const v = ctx.value();
            if (_reflecting) return;
            if (v === null || v === undefined || v === '') {
                _selectedValues.set(new Set());
                return;
            }
            const mul = ctx.multiple();
            if (mul && Array.isArray(v)) {
                _selectedValues.set(new Set(v));
            } else if (mul && typeof v === 'string') {
                // Multi value as comma-joined string (mirrors the hidden input format).
                _selectedValues.set(new Set(v.split(',').filter(s => s !== '')));
            } else if (!mul) {
                _selectedValues.set(new Set([v]));
            }
        });

        /**
         * UI-03: reflect the user's current selection onto the host `value` prop so
         * `el.value` is readable after a choice (previously the value lived only in
         * `pdx-change.detail`). Single → the scalar value; multiple → comma-joined.
         * Writes through the prop signal (setRaw) — the _reflecting guard stops the
         * sync track above from rebuilding _selectedValues from this same write.
         */
        function reflectValue(): void {
            const sel = _selectedValues();
            // Multiple: the ARRAY is reflected, not the comma-joined string — a join
            // loses the type (numbers→strings on the round trip) and collides with
            // values containing commas; el.value is consistent with
            // pdx-change.detail.values.
            const next = ctx.multiple()
                ? Array.from(sel)
                : (sel.size > 0 ? (sel.values().next().value ?? null) : null);
            _reflecting = true;
            try {
                (ctx.el as { value?: unknown }).value = next;
            } finally {
                _reflecting = false;
            }
        }

        function getSelectedLabel(): string {
            const sel = _selectedValues();
            if (sel.size === 0) return '';
            const val = sel.values().next().value;
            const item = flatItems().find(i => i.value === val);
            return item?.label ?? String(val);
        }

        function getSelectedItems(): NormalisedOption[] {
            const sel = _selectedValues();
            return flatItems().filter(i => sel.has(i.value));
        }

        // Priority: scoped slot (@slot / <slot let:>) > function prop > default label
        // ctx.slot() checks __slots first, falls back to defaultFn

        function renderItemContent(item: NormalisedOption | null | undefined, index?: number): unknown {
            if (!item) return '';
            const itemData = { label: item.label, value: item.value, raw: item._raw, index: index ?? 0 };
            // Check scoped slot first, then function prop, then plain label
            if ((ctx as any).__slots?.['item']) return (ctx as any).__slots['item'](itemData);
            const tmpl = ctx.itemTemplate() as unknown as ((item: unknown) => unknown) | null;
            if (tmpl) return tmpl(itemData);
            return item.label;
        }

        function renderSelectedContent(item: NormalisedOption | null | undefined): unknown {
            if (!item) return '';
            const itemData = { label: item.label, value: item.value, raw: item._raw };
            if ((ctx as any).__slots?.['selected']) return (ctx as any).__slots['selected'](itemData);
            const tmpl = ctx.selectedTemplate() as unknown as ((item: unknown) => unknown) | null;
            if (tmpl) return tmpl(itemData);
            return item.label;
        }

        function getSelectedItem(): NormalisedOption | null {
            const sel = _selectedValues();
            if (sel.size === 0) return null;
            const val = sel.values().next().value;
            return flatItems().find(i => i.value === val) ?? null;
        }

        function isItemSelected(val: unknown): boolean {
            return _selectedValues().has(val);
        }

        // ── The combobox ──
        // One element has role="combobox", and it is the one that takes focus: the search input when
        // it sits in the trigger, else the trigger itself, so the same component never announces two
        // different things.
        function inputInTrigger(): boolean {
            return !!ctx.searchable() && (!!ctx.multiple() || ctx.searchPosition() !== 'dropdown');
        }

        /** The highlighted option's id, while the list is open: what a screen reader announces. */
        function activeId(): string | null {
            const idx = _activeIndex();
            return _open() && idx >= 0 ? uid + '-opt-' + idx : null;
        }

        /** Index of the first selected option in the list, or -1. */
        function selectedIndex(): number {
            const sel = _selectedValues.peek();
            return sel.size === 0 ? -1 : displayItems.peek().findIndex(i => sel.has(i.value));
        }

        /** Open from the keyboard on an option: the selected one, else `fallback` (APG select-only). */
        function openOnOption(fallback: number): void {
            open();
            if (!_open()) return;
            const sel = selectedIndex();
            _activeIndex.set(sel >= 0 ? sel : fallback);
            scrollActiveIntoView();
        }

        // A <label for="{host id}"> names the host, which is labelable because it is form-associated,
        // and not the combobox inside it, which would stay unnamed. The label's id goes on the
        // combobox, unless something already names it.
        ctx.frame(() => {
            const id = ctx.el.id;
            if (!id) return;
            const label = document.querySelector<HTMLLabelElement>(`label[for="${id.replace(/["\\]/g, '\\$&')}"]`);
            const cb = ctx.el.querySelector('[role="combobox"]');
            if (!label || !cb || cb.hasAttribute('aria-labelledby') || cb.hasAttribute('aria-label')) return;
            if (!label.id) label.id = uid + '-label';
            cb.setAttribute('aria-labelledby', label.id);
        });

        // ── Type-ahead ──
        // Printable keys on a select that has no search field: the NEXT option starting with what was
        // typed, cycling when the same letter repeats (APG listbox). Closed and single, it picks that
        // option, as a native <select> does; open, or multiple, it moves the highlight.
        const TYPE_AHEAD_TIMEOUT = 500;        // focusGroup's and activeDescendant's default
        let _typeBuffer = '';
        let _typeTimer: ReturnType<typeof setTimeout> | null = null;

        function typeAhead(char: string): void {
            _typeBuffer += char.toLowerCase();
            if (_typeTimer) clearTimeout(_typeTimer);
            _typeTimer = setTimeout(() => { _typeBuffer = ''; _typeTimer = null; }, TYPE_AHEAD_TIMEOUT);
            const items = displayItems();
            if (items.length === 0) return;
            const current = _open() ? _activeIndex() : selectedIndex();
            const find = (needle: string): number => {
                for (let i = 1; i <= items.length; i++) {
                    const idx = (current + i + items.length) % items.length;
                    if (items[idx].label.toLowerCase().startsWith(needle)) return idx;
                }
                return -1;
            };
            let idx = find(_typeBuffer);
            if (idx < 0 && [..._typeBuffer].every(c => c === _typeBuffer[0])) idx = find(_typeBuffer[0]);
            if (idx < 0) return;
            if (!_open() && !ctx.multiple()) {
                if (!isItemSelected(items[idx].value)) selectItem(items[idx]);
                return;
            }
            if (!_open()) open();
            _activeIndex.set(idx);
            scrollActiveIntoView();
        }

        // ── Open/close ──
        let popover: ReturnType<typeof usePopover> | null = null;
        let overlayId = '';
        let virtualizerDispose: (() => void) | null = null;

        function open() {
            if (ctx.disabled() || ctx.readonly() || _open()) return;
            _open.set(true);
            _query.set('');
            _userTyped.set(false);
            _activeIndex.set(-1);
            // Lazy load: if external DataSource has no data yet, trigger refresh
            const ds = _dsRef();
            if (ds && _isExternalDS() && ds.data().length === 0 && !ds.isLoading()) {
                ds.refresh();
            }
            ctx.emit('pdx-open', undefined, { bubbles: false });
        }

        function close() {
            if (!_open()) return;
            _open.set(false);
            _query.set('');
            // Only reset filter if user had typed a search query (avoids needless refetch)
            if (_isExternalDS() && _dsRef() && _query.peek()) {
                _dsRef()!.setFilter([]);
            }
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        function toggle() {
            if (_open()) close(); else open();
        }

        // ── Selection actions ──
        function selectItem(item: NormalisedOption) {
            const mul = ctx.multiple();
            if (mul) {
                const set = new Set(_selectedValues());
                if (set.has(item.value)) set.delete(item.value);
                else set.add(item.value);
                _selectedValues.set(set);
                reflectValue();
                ctx.emit('pdx-change', {
                    values: Array.from(set),
                    items: flatItems().filter(i => set.has(i.value)).map(i => i._raw),
                });
            } else {
                _selectedValues.set(new Set([item.value]));
                reflectValue();
                ctx.emit('pdx-change', { value: item.value, item: item._raw });
                close();
            }
            updateHiddenInput();
        }

        function removeTag(val: unknown) {
            const set = new Set(_selectedValues());
            set.delete(val);
            _selectedValues.set(set);
            reflectValue();
            ctx.emit('pdx-change', {
                values: Array.from(set),
                items: flatItems().filter(i => set.has(i.value)).map(i => i._raw),
            });
            updateHiddenInput();
        }

        function clearSelection() {
            _selectedValues.set(new Set());
            reflectValue();
            const mul = ctx.multiple();
            if (mul) {
                ctx.emit('pdx-change', { values: [], items: [] });
            } else {
                ctx.emit('pdx-change', { value: null, item: null });
            }
            ctx.emit('pdx-clear');
            updateHiddenInput();
        }

        // ── Search ──
        function onSearchInput(e: Event) {
            const val = (e.target as HTMLInputElement).value;
            _userTyped.set(true);
            _query.set(val);
            _activeIndex.set(-1);
            ctx.emit('pdx-search', { query: val });

            if (_isExternalDS() && _dsRef()) {
                const lf = ctx.labelField() as string || 'label';
                const ds = _dsRef()!;

                if (ctx.remote()) {
                    // Remote mode: debounce server-side filter
                    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
                    _searchDebounceTimer = setTimeout(() => {
                        if (val) {
                            ds.setFilter([{ field: lf, operator: 'contains', value: val }]);
                        } else {
                            ds.setFilter([]);
                        }
                    }, ctx.debounce() as number);
                } else {
                    // Local DS: filter immediately
                    if (val) {
                        ds.setFilter([{ field: lf, operator: 'contains', value: val }]);
                    } else {
                        ds.setFilter([]);
                    }
                }
            }

            if (!_open()) open();
        }

        // Client-side filter for array mode
        const displayItems = computed((): NormalisedOption[] => {
            const q = _query().toLowerCase();
            if (!q || _isExternalDS()) return flatItems();
            return flatItems().filter(i => i.label.toLowerCase().includes(q));
        });

        // Creatable: show "Create X" when query has no exact match
        const showCreateOption = computed((): boolean => {
            if (!ctx.creatable()) return false;
            const q = _query().trim();
            if (!q) return false;
            return !displayItems().some(i => i.label.toLowerCase() === q.toLowerCase());
        });

        function createOption() {
            const q = _query().trim();
            if (!q) return;
            const newItem: NormalisedOption = { label: q, value: q, _raw: q };
            ctx.emit('pdx-create', { value: q, label: q });
            selectItem(newItem);
            _query.set('');
        }

        // ── Keyboard ──
        function onTriggerKeydown(e: KeyboardEvent) {
            if (ctx.disabled() || ctx.readonly()) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (!_open()) openOnOption(0);
                    else moveActive(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (!_open()) openOnOption(displayItems().length - 1);
                    else moveActive(-1);
                    break;
                case 'Enter':
                case ' ':
                    if (ctx.searchable() && e.key === ' ') return; // allow space in search
                    // A space inside a type-ahead run is part of the name ("New York").
                    if (e.key === ' ' && _typeBuffer) { e.preventDefault(); typeAhead(' '); break; }
                    e.preventDefault();
                    if (_open()) {
                        const idx = _activeIndex();
                        const items = displayItems();
                        if (idx >= 0 && idx < items.length) {
                            selectItem(items[idx]);
                        } else if (showCreateOption()) {
                            // No item selected but create option is available
                            createOption();
                        }
                    } else {
                        openOnOption(0);
                    }
                    break;
                case 'Escape':
                    if (_open()) {
                        e.preventDefault();
                        e.stopPropagation();
                        close();
                    }
                    break;
                case 'Home':
                    if (_open()) { e.preventDefault(); _activeIndex.set(0); }
                    break;
                case 'End':
                    if (_open()) { e.preventDefault(); _activeIndex.set(displayItems().length - 1); }
                    break;
                case 'Backspace':
                    if (ctx.multiple() && ctx.searchable() && _query() === '') {
                        // Remove last tag
                        const sel = Array.from(_selectedValues());
                        if (sel.length > 0) removeTag(sel[sel.length - 1]);
                    }
                    break;
                default:
                    if (!ctx.searchable() && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault();
                        typeAhead(e.key);
                    }
            }
        }

        function moveActive(delta: number) {
            const items = displayItems();
            if (items.length === 0) return;
            let idx = _activeIndex() + delta;
            if (idx < 0) idx = items.length - 1;
            else if (idx >= items.length) idx = 0;
            _activeIndex.set(idx);
            scrollActiveIntoView();
        }

        function scrollActiveIntoView() {
            const idx = _activeIndex();
            const el = ctx.el.querySelector(`[data-option-index="${idx}"]`) as HTMLElement;
            el?.scrollIntoView({ block: 'nearest' });
        }

        function onOptionClick(e: Event, item: NormalisedOption) {
            e.preventDefault();
            e.stopPropagation();
            selectItem(item);
        }

        // ── Hidden input for form participation ──
        function updateHiddenInput() {
            const hidden = ctx.el.querySelector('input[type="hidden"]') as HTMLInputElement;
            if (!hidden) return;
            const sel = _selectedValues();
            if (ctx.multiple()) {
                hidden.value = Array.from(sel).join(',');
            } else {
                hidden.value = sel.size > 0 ? String(sel.values().next().value) : '';
            }
        }

        // ── Popover setup ──
        // Popover setup: deferred to after mount (querySelector needs rendered DOM)
        let _popoverDispose: (() => void) | null = null;
        queueMicrotask(() => {
            const triggerEl = ctx.el.querySelector('.pdx-select-trigger') as HTMLElement;
            const dropdownEl = ctx.el.querySelector('.pdx-select-dropdown') as HTMLElement;
            if (!triggerEl || !dropdownEl) return;

            popover = usePopover({
                trigger: 'manual',
                placement: 'bottom-start' as PopoverPlacement,
                // No offset: the gap comes from `--pdx-float-offset`, not a literal 4 beside
                // the token declaring the same number.
                flip: true,
                dismissOnOutside: true,
                dismissOnEscape: false, // handled by onTriggerKeydown
                container: ctx.el, // light DOM: trigger + content are siblings inside host CE
                onOpenChange: (isOpen) => {
                    if (!isOpen && _open()) close();
                },
            });

            popover.setTrigger(triggerEl);
            popover.setContent(dropdownEl);

            // Sync _open → popover + overlayStack
            const disposeSync = effect(() => {
                const isOpen = _open();
                if (!popover) return;
                if (isOpen) {
                    // Match dropdown width to trigger
                    dropdownEl.style.width = triggerEl.offsetWidth + 'px';
                    popover.open();
                    overlayId = uid;
                    const zIndex = overlayStack.push(overlayId);
                    dropdownEl.style.zIndex = String(zIndex);

                    // Focus search input if searchable
                    requestAnimationFrame(() => {
                        const searchInput = ctx.el.querySelector('.pdx-select-search, .pdx-select-tag-search, .pdx-select-dropdown-search') as HTMLInputElement;
                        if (searchInput) searchInput.focus();
                    });
                } else {
                    popover.close();
                    dropdownEl.style.zIndex = '';
                    if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                }
            });

            _popoverDispose = () => {
                disposeSync();
                popover?.dispose();
                popover = null;
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
            };
        });
        // Cleanup on disconnect
        ctx.track(() => () => { _popoverDispose?.(); });

        // ── Virtual scroll (auto-activate for large lists) ──
        const VIRTUAL_THRESHOLD = 100;
        const ITEM_HEIGHT = 36; // estimated option height

        const useVirtual = computed(() => displayItems().length > VIRTUAL_THRESHOLD);

        const virtualItems = signal<{ index: number; offsetStart: number; size: number }[]>([]);
        const virtualTotalSize = signal(0);

        ctx.track(() => {
            virtualizerDispose?.();
            virtualizerDispose = null;

            if (!useVirtual() || !_open()) {
                virtualItems.set([]);
                virtualTotalSize.set(0);
                return;
            }

            const listEl = ctx.el.querySelector('.pdx-select-list') as HTMLElement;
            if (!listEl) return;

            const virt = createVirtualizer({
                count: () => displayItems().length,
                estimateSize: () => ITEM_HEIGHT,
                overscan: 5,
                getScrollElement: () => listEl,
            });

            const disposeItems = effect(() => {
                virtualItems.set(virt.items());
                virtualTotalSize.set(virt.totalSize());
            });

            virtualizerDispose = () => {
                disposeItems();
                virt.dispose();
            };

            return () => {
                virtualizerDispose?.();
                virtualizerDispose = null;
            };
        });

        // ── CSS classes ──
        function triggerClass(): string {
            let cls = 'pdx-select-trigger pdx-input-wrap';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-input-' + s;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.readonly()) cls += ' readonly';
            if (ctx.error()) cls += ' error';
            if (ctx.success()) cls += ' success';
            if (ctx.warning()) cls += ' warning';
            if (ctx.multiple()) cls += ' multiple';
            return cls;
        }

        // ── Click handling ──
        function onTriggerClick(e: Event) {
            const target = e.target as HTMLElement;
            if (target.closest('.pdx-input-clear') || target.closest('.pdx-chip-remove')) return;
            // A click in the search field opens and never closes: its focus has just opened the list
            // (the click follows the focus), and a toggle here would close it again.
            if (target.closest('.pdx-select-search')) { open(); return; }
            toggle();
        }

        // Computed loading: prop OR DataSource.isLoading
        const isLoading = computed(() => {
            if (ctx.loading()) return true;
            const ds = _dsRef();
            return ds ? ds.isLoading() : false;
        });

        // Cleanup debounce and type-ahead timers on disconnect
        ctx.track(() => () => {
            if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
            if (_typeTimer) clearTimeout(_typeTimer);
        });

        // Expose programmatic API on the host element
        (ctx.el as any).openSelect = open;
        (ctx.el as any).closeSelect = close;
        (ctx.el as any).toggleSelect = toggle;
        // UI-03: read-only `selectedItem` getter returning the raw selected record(s).
        // (`value` is reflected onto the host prop by reflectValue() — see above — so
        // `el.value` is already readable; `selectedItem` exposes the full object.)
        // Imperative API: focus/blur/clear (merged with selectedItem getter)
        ctx.expose({
            get selectedItem(): unknown {
                const items = getSelectedItems().map(i => i._raw);
                if (ctx.multiple()) return items;
                return items.length > 0 ? items[0] : null;
            },
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() { clearSelection(); },
        });

        return {
            uid, listboxId,
            _open, _query, _activeIndex, _selectedValues, _userTyped,
            displayItems, groupedItems, useVirtual, virtualItems, virtualTotalSize,
            triggerClass, getSelectedLabel, getSelectedItems, getSelectedItem, isItemSelected, isLoading,
            inputInTrigger, activeId,
            renderItemContent, renderSelectedContent,
            onTriggerClick, onTriggerKeydown, onSearchInput, onOptionClick,
            removeTag, clearSelection, open, close,
            showCreateOption, createOption,
        };
    },
    render: (ctx) => html`
        <div :class="${ctx.triggerClass}"
            :role="${() => ctx.inputInTrigger() ? null : 'combobox'}"
            :aria-haspopup="${() => ctx.inputInTrigger() ? null : 'listbox'}"
            :aria-expanded="${() => ctx.inputInTrigger() ? null : String(ctx._open())}"
            :aria-controls="${() => ctx.inputInTrigger() ? null : ctx.listboxId}"
            :aria-activedescendant="${() => ctx.inputInTrigger() ? null : ctx.activeId()}"
            :aria-label="${() => ctx.inputInTrigger() ? null : (ctx.label() || null)}"
            :aria-disabled="${() => !ctx.inputInTrigger() && ctx.disabled() ? 'true' : null}"
            tabindex="${() => ctx.inputInTrigger() ? '-1' : '0'}"
            @click="${ctx.onTriggerClick}"
            @keydown="${ctx.onTriggerKeydown}">

            ${() => {
                const mul = ctx.multiple();
                const searchable = ctx.searchable();

                if (mul) {
                    // Multiple mode: tags (with optional collapse) + optional search
                    return html`
                        <div class="pdx-select-tags">
                            ${() => {
                                const items = ctx.getSelectedItems() as NormalisedOption[];
                                const cap = ctx.maxTagCount() as number;
                                // Summary mode (cap 0): single "N selected" chip, no per-tag removal.
                                if (cap === 0 && items.length > 0) {
                                    return html`<span class="pdx-chip pdx-chip-sm pdx-chip-summary">${() => format(uiString('select', 'selected'), { n: items.length })}</span>`;
                                }
                                const capped = cap > 0 && items.length > cap;
                                const shown = capped ? items.slice(0, cap) : items;
                                const overflow = capped ? items.length - cap : 0;
                                return html`
                                    ${shown.map((item: NormalisedOption) => html`
                                        <span class="pdx-chip pdx-chip-sm">
                                            <span>${() => item.label}</span>
                                            <button class="pdx-chip-remove" type="button" tabindex="-1"
                                                :aria-label="${() => format(uiString('select', 'remove'), { label: item.label })}"
                                                @click="${(e: Event) => { e.stopPropagation(); ctx.removeTag(item.value); }}">×</button>
                                        </span>
                                    `)}
                                    ${overflow > 0 ? html`<span class="pdx-chip pdx-chip-sm pdx-chip-summary">+${overflow}</span>` : ''}`;
                            }}
                            ${() => searchable
                                ? html`<input class="pdx-select-tag-search"
                                    type="text"
                                    autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                                    role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
                                    :aria-expanded="${() => String(ctx._open())}"
                                    :aria-controls="${() => ctx.listboxId}"
                                    :aria-activedescendant="${ctx.activeId}"
                                    :aria-label="${() => ctx.label() || null}"
                                    :value="${ctx._query}"
                                    placeholder="${() => ctx._selectedValues().size === 0 ? ctx.placeholder() : ''}"
                                    :disabled="${ctx.disabled}"
                                    @input="${ctx.onSearchInput}"
                                    tabindex="0" />`
                                : ctx._selectedValues().size === 0
                                    ? html`<span class="pdx-select-value pdx-select-placeholder">${ctx.placeholder}</span>`
                                    : ''
                            }
                        </div>`;
                }

                if (searchable && ctx.searchPosition() !== 'dropdown') {
                    // Search in trigger
                    // Its keys reach onTriggerKeydown by bubbling to the trigger. It had its own
                    // handler as well, so every key ran twice: ↓ skipped an option, and the Enter
                    // that picked one reopened the list.
                    return html`<input class="pdx-select-search"
                        type="text"
                        autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                        role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
                        :aria-expanded="${() => String(ctx._open())}"
                        :aria-controls="${() => ctx.listboxId}"
                        :aria-activedescendant="${ctx.activeId}"
                        :aria-label="${() => ctx.label() || null}"
                        :value="${() => {
                            if (!ctx._open()) return ctx.getSelectedLabel();
                            return ctx._userTyped() ? ctx._query() : ctx.getSelectedLabel();
                        }}"
                        placeholder="${ctx.placeholder}"
                        :disabled="${ctx.disabled}"
                        @input="${ctx.onSearchInput}"
                        @focus="${(e: Event) => {
                            // Open directly, not a faked click — onTriggerClick(new Event('click')) —
                            // whose target is null, so every focus would throw on target.closest().
                            // onTriggerClick is for real clicks, where target is set.
                            ctx.open();
                            const inp = e.target as HTMLInputElement;
                            if (inp.value) requestAnimationFrame(() => inp.select());
                        }}"
                        tabindex="0" />`;
                }

                // Non-searchable or search-in-dropdown: show value label
                const selItem = ctx.getSelectedItem();
                return selItem
                    ? html`<span class="pdx-select-value">${() => ctx.renderSelectedContent(ctx.getSelectedItem()!)}</span>`
                    : html`<span class="pdx-select-value pdx-select-placeholder">${ctx.placeholder}</span>`;
            }}

            ${() => ctx.clearable() && !ctx.disabled() && !ctx.readonly() && ctx._selectedValues().size > 0
                ? html`<button class="pdx-input-clear pdx-input-suffix-interactive" type="button" :aria-label="${() => uiString('select', 'clear')}" tabindex="-1"
                    @click="${(e: Event) => { e.stopPropagation(); ctx.clearSelection(); }}">×</button>`
                : ''}
            ${() => ctx.isLoading()
                ? html`<span class="pdx-input-loading" role="status" :aria-label="${() => uiString('select', 'loading')}"></span>`
                : ''}
            <span class="pdx-select-caret"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
        </div>

        <input type="hidden"
            :name="${() => ctx.name() || null}"
            :value="${() => {
                const sel = ctx._selectedValues();
                if (ctx.multiple()) return Array.from(sel).join(',');
                return sel.size > 0 ? String(sel.values().next().value) : '';
            }}" />

        <div :class="${() => 'pdx-select-dropdown' + (ctx._open() ? ' open' : '')}">
            ${() => ctx.searchable() && ctx.searchPosition() === 'dropdown'
                ? html`<div class="pdx-select-search-wrap">
                    <input class="pdx-select-dropdown-search"
                        type="text"
                        autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                        :aria-controls="${() => ctx.listboxId}"
                        :aria-activedescendant="${ctx.activeId}"
                        :value="${ctx._query}"
                        :placeholder="${() => uiString('select', 'search')}"
                        @input="${ctx.onSearchInput}"
                        @keydown="${ctx.onTriggerKeydown}" />
                  </div>`
                : ''
            }
            <span class="pdx-sr-only" role="status" aria-live="polite" aria-atomic="true">
                ${() => {
                    const n = ctx.displayItems().length;
                    return ctx._open() ? (n === 0 ? uiString('select', 'noResults') : format(uiString('select', 'optionsAvailable'), { n })) : '';
                }}
            </span>
            <div class="${() => 'pdx-select-list' + (ctx.useVirtual() ? ' virtual' : '')}"
                role="listbox"
                :id="${() => ctx.listboxId}"
                :aria-label="${() => (ctx.label() as string) || uiString('select', 'listbox')}"
                :aria-multiselectable="${() => ctx.multiple() ? 'true' : null}"
                :style="${() => ctx.useVirtual() ? 'height:' + Math.min(ctx.virtualTotalSize(), 240) + 'px' : ''}">
                ${() => {
                    const items = ctx.displayItems();
                    if (items.length === 0) {
                        return html`<div class="pdx-select-empty">${() => uiString('select', 'noResults')}</div>`;
                    }

                    // Virtual scroll mode
                    if (ctx.useVirtual()) {
                        return ctx.virtualItems().map((vi: { index: number; offsetStart: number; size: number }) => {
                            const item = items[vi.index];
                            if (!item) return '';
                            return html`<div class="${() => 'pdx-select-option' + (ctx._activeIndex() === vi.index ? ' active' : '')}"
                                role="option"
                                :id="${() => ctx.uid + '-opt-' + vi.index}"
                                data-option-index="${() => vi.index}"
                                :aria-selected="${() => ctx.isItemSelected(item.value) ? 'true' : 'false'}"
                                :style="${() => 'position:absolute;top:0;left:0;right:0;height:' + vi.size + 'px;transform:translateY(' + vi.offsetStart + 'px)'}"
                                @click="${(e: Event) => ctx.onOptionClick(e, item)}"
                                @mouseenter="${() => ctx._activeIndex.set(vi.index)}">
                                ${() => ctx.multiple() ? html`<span class="pdx-select-check"><svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"></polyline></svg></span>` : ''}
                                ${() => ctx.renderItemContent(item)}</div>`;
                        });
                    }

                    // Grouped mode
                    const grouped = ctx.groupedItems();
                    if (grouped) {
                        let globalIdx = 0;
                        const result: unknown[] = [];
                        for (const [groupName, groupItems] of grouped) {
                            result.push(html`<div class="pdx-select-group-header" role="presentation">${() => groupName}</div>`);
                            for (const item of groupItems) {
                                const idx = globalIdx++;
                                result.push(html`<div class="${() => 'pdx-select-option' + (ctx._activeIndex() === idx ? ' active' : '')}"
                                    role="option"
                                    :id="${() => ctx.uid + '-opt-' + idx}"
                                    data-option-index="${() => idx}"
                                    :aria-selected="${() => ctx.isItemSelected(item.value) ? 'true' : 'false'}"
                                    @click="${(e: Event) => ctx.onOptionClick(e, item)}"
                                    @mouseenter="${() => ctx._activeIndex.set(idx)}">
                                    ${() => ctx.multiple() ? html`<span class="pdx-select-check"><svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"></polyline></svg></span>` : ''}
                                    ${() => ctx.renderItemContent(item)}</div>`);
                            }
                        }
                        return result;
                    }

                    // Flat mode
                    return items.map((item: NormalisedOption, idx: number) =>
                        html`<div class="${() => 'pdx-select-option' + (ctx._activeIndex() === idx ? ' active' : '')}"
                            role="option"
                            :id="${() => ctx.uid + '-opt-' + idx}"
                            data-option-index="${() => idx}"
                            :aria-selected="${() => ctx.isItemSelected(item.value) ? 'true' : 'false'}"
                            @click="${(e: Event) => ctx.onOptionClick(e, item)}"
                            @mouseenter="${() => ctx._activeIndex.set(idx)}">
                            ${() => ctx.multiple() ? html`<span class="pdx-select-check"><svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"></polyline></svg></span>` : ''}
                            ${() => ctx.renderItemContent(item)}</div>`
                    );
                }}
                ${() => ctx.showCreateOption()
                    ? html`<div class="pdx-select-option pdx-select-create"
                        role="option"
                        @click="${() => ctx.createOption()}">
                        <span class="pdx-select-create-icon">+</span>
                        ${() => ((ctx.createLabel() as unknown as string) || uiString('select', 'create')).replace('{query}', ctx._query())}
                    </div>`
                    : ''
                }
            </div>
        </div>
    `,
});
