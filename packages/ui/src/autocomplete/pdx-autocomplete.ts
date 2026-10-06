// pdx-autocomplete — Text input with suggestions.
// Value is FREE TEXT. Supports local array, DataSource, debounce, forceSelection, highlight.

import { signal, computed, effect, html, component, isDataSource, tryInject, useFormAssociated, untracked } from '@pdxui/core';
import { usePopover, overlayStack } from '@pdxui/core';
import type { DataSource, SlotFunction } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/autocomplete';

let _acCounter = 0;

interface NormalisedOption { label: string; value: unknown; _raw: unknown; }

function normalize(items: any[], labelField: string, valueField: string): NormalisedOption[] {
    if (!items || !Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string' || typeof item === 'number') {
            return { label: String(item), value: item, _raw: item };
        }
        return {
            label: String(item[labelField] ?? item.label ?? ''),
            value: item[valueField] ?? item.value ?? item,
            _raw: item,
        };
    });
}

/** Build a highlighted span using DOM API (no innerHTML). */
function buildHighlight(label: string, query: string): HTMLSpanElement {
    const span = document.createElement('span');
    const matchIdx = label.toLowerCase().indexOf(query.toLowerCase());
    if (matchIdx === -1) {
        span.textContent = label;
        return span;
    }
    span.append(document.createTextNode(label.slice(0, matchIdx)));
    const mark = document.createElement('mark');
    mark.textContent = label.slice(matchIdx, matchIdx + query.length);
    span.append(mark);
    span.append(document.createTextNode(label.slice(matchIdx + query.length)));
    return span;
}

/**
 * A text input with suggestions whose value is free text: the user can type anything, or pick a
 * suggestion from a local list or a remote data source.
 *
 * @fires pdx-change {{ value, label, item }} - When the value is committed: a suggestion picked (`value` is its value field, `item` the suggestion), the field cleared, or free text confirmed by leaving the field or pressing Enter with no option chosen (`value` and `label` the text, `item` null). Once per edit, like a native `change`.
 * @slot option - Scoped — renders one option. Receives `{ label, value, raw, highlighted, index }` (`raw` is the original item).
 */
component('pdx-autocomplete', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        suggestions: { type: Array, default: () => [] },
        source: { type: Object, default: null },
        labelField: { type: String, default: 'label' },
        valueField: { type: String, default: 'value' },
        placeholder: { type: String, default: '' },
        label: { type: String, default: '' },
        size: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        minLength: { type: Number, default: 1 },
        debounce: { type: Number, default: 200 },
        forceSelection: { type: Boolean, default: false },
        highlight: { type: Boolean, default: true },
        clearable: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        name: { type: String, default: '' },
        maxItems: { type: Number, default: 10 },
        /** Enable server-side filtering via DataSource.setFilter() with debounce. */
        remote: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
    },
    setup(ctx) {
        const uid = 'pdx-ac-' + (++_acCounter);
        const listboxId = uid + '-lb';

        const _open = signal(false);
        const _query = signal('');
        const _activeIndex = signal(-1);
        const _focused = signal(false);
        let _debounceTimer: any = null;
        let _blurTimer: any = null;
        // Tracks which query was last sent to the DS for remote search.
        // When DS data arrives, we verify it matches the current query.
        const _remoteQuery = signal('');
        const _pendingRemote = signal(false);

        // ── Popover + overlay stack ──
        let popover: ReturnType<typeof usePopover> | null = null;
        let overlayId = '';

        // ── DataSource resolution ──
        // Priority: source prop > Context Protocol (pdx-data-source ancestor)
        const _externalDS = signal<DataSource<any> | null>(null);

        ctx.track(() => {
            const src = ctx.source();
            if (src) {
                if (isDataSource(src)) {
                    _externalDS.set(src as DataSource<any>);
                    return;
                } else if (src instanceof HTMLElement && typeof (src as any).source === 'function') {
                    _externalDS.set((src as any).source());
                    return;
                }
            }
            // Fallback: try Context Protocol from ancestor <pdx-data-source>
            const injected = tryInject<DataSource<any>>('dataSource', ctx.el);
            if (injected && isDataSource(injected)) {
                _externalDS.set(injected);
            } else {
                _externalDS.set(null);
            }
        });

        // The text last announced with pdx-change, or set from outside: free text typed since then is
        // committed — announced — when the field is left or Enter is pressed.
        let _committed = '';

        // Sync external value prop → query. Typing also writes `value` (setOwnProp in onInput), and
        // then it equals the query already: only a value set from OUTSIDE is a committed one.
        ctx.track(() => {
            const v = ctx.value();
            if (v !== undefined && v !== null && v !== '') {
                if (v !== _query.peek()) _committed = v as string;
                _query.set(v as string);
            }
        });

        /**
         * Announce free text the way a pick is announced. The value is free text, and inside a
         * pdx-form the compiler wires this control on pdx-change: typed and never picked, it would never
         * reach the form. Like a native `change`, it fires once per edit, on commit.
         */
        function commitText(): void {
            const q = _query();
            if (q === _committed) return;
            _committed = q;
            ctx.emit('pdx-change', { value: q, label: q, item: null });
        }

        // ── For external DS: track data signal ──
        const _dsData = signal<any[]>([]);

        ctx.track(() => {
            const ds = _externalDS();
            if (!ds) return;
            const data = ds.data();
            _dsData.set(data ?? []);
            // Clear pending flag only if data matches the query we sent
            if (_pendingRemote.peek()) {
                const sentQuery = _remoteQuery.peek();
                const currentQuery = _query.peek();
                if (sentQuery === currentQuery) _pendingRemote.set(false);
            }
        });

        // ── Suggestions ──
        const allItems = computed((): NormalisedOption[] => {
            const lf = (ctx.labelField() as string) || 'label';
            const vf = (ctx.valueField() as string) || 'value';
            if (_externalDS()) {
                return normalize(_dsData(), lf, vf);
            }
            return normalize(ctx.suggestions() as any[], lf, vf);
        });

        const filteredItems = computed((): NormalisedOption[] => {
            const q = _query().toLowerCase().trim();
            const min = ctx.minLength() as number;
            if (!q || q.length < min) return [];
            const max = ctx.maxItems() as number;
            const items = allItems();
            // Remote mode: DS already filtered server-side, just slice
            // But don't show stale results while debounce/loading is in flight
            if (ctx.remote() && _externalDS()) {
                if (_pendingRemote()) return [];
                return items.slice(0, max);
            }
            // Default: client-side filter
            return items.filter(i => i.label.toLowerCase().includes(q)).slice(0, max);
        });

        // ── Actions ──
        function open() {
            if (ctx.disabled() || ctx.readonly()) return;
            _open.set(true);
            _activeIndex.set(-1);
        }
        function close() {
            _open.set(false);
            _activeIndex.set(-1);
        }

        function selectSuggestion(item: NormalisedOption) {
            _query.set(item.label);
            setOwnProp(ctx.el, 'value', item.label);
            // `value` is the suggestion's value field — the code, the id — and `label` what the input
            // shows, whatever the label. A suggestion
            // with no value field at all still sends its label.
            const hasValue = !(typeof item._raw === 'object' && item._raw !== null && item.value === item._raw);
            _committed = item.label;
            ctx.emit('pdx-change', { value: hasValue ? item.value : item.label, label: item.label, item: item._raw });
            close();
        }

        function onInput(e: Event) {
            const val = (e.target as HTMLInputElement).value;
            _query.set(val);
            _activeIndex.set(-1);
            // `value` is the live text, as in pdx-input.
            setOwnProp(ctx.el, 'value', val);
            ctx.emit('pdx-input', { value: val });

            const min = ctx.minLength() as number;

            // Remote mode: debounced server-side filter
            if (ctx.remote() && _externalDS()) {
                _pendingRemote.set(true);
                if (_debounceTimer) clearTimeout(_debounceTimer);
                _debounceTimer = setTimeout(() => {
                    const ds = _externalDS()!;
                    const lf = (ctx.labelField() as string) || 'label';
                    if (val.length >= min) {
                        _remoteQuery.set(val);
                        ds.setFilter([{ field: lf, operator: 'contains', value: val }]);
                    } else {
                        _pendingRemote.set(false);
                        ds.setFilter([]);
                        close();
                    }
                }, ctx.debounce() as number);
                return;
            }

            // Default: client-side filter, immediate. A query long enough opens the list even when
            // nothing matches, so it can say "No results" rather than stay closed and silent.
            if (val.length >= min) open();
            else close();
        }

        // Remote mode: auto-open when DS data arrives
        ctx.track(() => {
            if (!ctx.remote() || !_externalDS()) return;
            const items = filteredItems();
            if (items.length > 0 && _focused() && _query().length >= (ctx.minLength() as number)) {
                _open.set(true);
            }
        });

        // Suggestions set after the user typed — loaded in a pdx-input handler, as pdx-form-template's
        // lookup does — open the list when they match. onInput runs before they arrive, finds
        // nothing and closes, and only a DataSource in remote mode would reopen it. Only the
        // suggestions are tracked, so choosing an item — which changes the query — does not reopen it.
        ctx.track(() => {
            void ctx.suggestions();
            untracked(() => {
                if (_externalDS() || _open() || !_focused()) return;
                if (_query().trim().length >= (ctx.minLength() as number) && filteredItems().length > 0) open();
            });
        });

        function onFocus() {
            _focused.set(true);
            const q = _query().trim();
            const min = ctx.minLength() as number;
            if (q.length >= min && filteredItems().length > 0) open();
        }

        function onBlur() {
            _focused.set(false);
            if (_blurTimer) clearTimeout(_blurTimer);
            _blurTimer = setTimeout(() => {
                if (_focused()) return;
                close();
                if (ctx.forceSelection()) {
                    const q = _query().trim();
                    if (q && !allItems().some(i => i.label.toLowerCase() === q.toLowerCase())) {
                        _query.set('');
                        setOwnProp(ctx.el, 'value', '');
                        _committed = '';
                        ctx.emit('pdx-change', { value: '', label: '', item: null });
                    }
                } else {
                    commitText();
                }
            }, 150);
        }

        function onKeydown(e: KeyboardEvent) {
            if (ctx.disabled()) return;
            const items = filteredItems();
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (!_open() && items.length > 0) open();
                    else if (_open()) moveActive(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (_open()) moveActive(-1);
                    break;
                case 'Enter': {
                    const idx = _activeIndex();
                    if (_open() && idx >= 0 && idx < items.length) {
                        e.preventDefault();
                        selectSuggestion(items[idx]);
                    } else {
                        // No option chosen: the text as typed is the answer. Committed before the
                        // key reaches a form that submits on Enter, so the submit carries it.
                        if (_open()) { e.preventDefault(); close(); }
                        if (!ctx.forceSelection()) commitText();
                    }
                    break;
                }
                case 'Escape':
                    if (_open()) { e.preventDefault(); e.stopPropagation(); close(); }
                    break;
            }
        }

        function moveActive(delta: number) {
            const len = filteredItems().length;
            if (len === 0) return;
            let next = _activeIndex() + delta;
            if (next < 0) next = len - 1;
            if (next >= len) next = 0;
            _activeIndex.set(next);
        }

        function clear() {
            _query.set('');
            setOwnProp(ctx.el, 'value', '');
            _committed = '';
            ctx.emit('pdx-change', { value: '', label: '', item: null });
            ctx.emit('pdx-clear');
            close();
        }

        const isLoading = computed(() => {
            if (ctx.loading()) return true;
            const ds = _externalDS();
            return ds ? ds.isLoading() : false;
        });

        const wrapClass = computed(() => {
            let cls = 'pdx-autocomplete pdx-input-wrap';
            const sz = ctx.size();
            if (sz) cls += ' pdx-input-' + sz;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.readonly()) cls += ' readonly';
            if (ctx.error()) cls += ' pdx-input-error';
            if (ctx.success()) cls += ' pdx-input-success';
            if (ctx.warning()) cls += ' pdx-input-warning';
            if (_focused()) cls += ' focused';
            return cls;
        });

        // Popover setup: deferred to after mount (querySelector needs rendered DOM)
        let _popoverDispose: (() => void) | null = null;
        queueMicrotask(() => {
            const wrapEl = ctx.el.querySelector('.pdx-autocomplete') as HTMLElement;
            const dropdownEl = ctx.el.querySelector('.pdx-autocomplete-dropdown') as HTMLElement;
            if (!wrapEl || !dropdownEl) return;

            popover = usePopover({
                trigger: 'manual',
                placement: 'bottom-start',
                // No offset: the gap comes from `--pdx-float-offset`, and a literal 4 here would
                // duplicate the token declaring the same number.
                flip: true,
                dismissOnOutside: true,
                dismissOnEscape: false, // handled by onKeydown
                container: ctx.el, // light DOM: trigger + content are siblings inside host CE
                onOpenChange: (isOpen) => {
                    if (!isOpen && _open()) close();
                },
            });

            popover.setTrigger(wrapEl);
            popover.setContent(dropdownEl);

            // Sync _open → popover + overlayStack
            const disposeSync = effect(() => {
                const isOpen = _open();
                if (!popover) return;
                if (isOpen) {
                    dropdownEl.style.width = wrapEl.offsetWidth + 'px';
                    popover.open();
                    overlayId = uid;
                    const zIndex = overlayStack.push(overlayId);
                    dropdownEl.style.zIndex = String(zIndex);
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
        ctx.track(() => () => { _popoverDispose?.(); });

        // ── Cleanup timers ──
        ctx.track(() => () => {
            if (_debounceTimer) clearTimeout(_debounceTimer);
            if (_blurTimer) clearTimeout(_blurTimer);
        });

        ctx.expose({ open, close, clear });

        useFormAssociated(ctx, { getFormValue: () => { const v = _query(); return v != null && v !== '' ? String(v) : null; } });
        // The host is the one submitter. A hidden input carrying the name would send the value a
        // second time.
        reflectNameToHost(ctx);

        // Slot — read lazily (_projectSlots runs after setup)
        function getOptionSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['option'] as SlotFunction | undefined;
        }

        return {
            uid, listboxId,
            _open, _query, _activeIndex, _focused,
            filteredItems, isLoading, wrapClass,
            onInput, onFocus, onBlur, onKeydown,
            selectSuggestion, clear,
            getOptionSlot,
        };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}">
            <input class="pdx-input pdx-autocomplete-input"
                type="text"
                role="combobox"
                autocomplete="off"
                data-lpignore="true" data-1p-ignore="" data-form-type="other"
                :value="${ctx._query}"
                :placeholder="${ctx.placeholder}"
                :disabled="${ctx.disabled}"
                :readonly="${ctx.readonly}"
                :aria-expanded="${() => String(ctx._open())}"
                :aria-controls="${() => ctx.listboxId}"
                :aria-activedescendant="${() => {
                    const idx = ctx._activeIndex();
                    return idx >= 0 ? ctx.uid + '-sug-' + idx : null;
                }}"
                :aria-label="${() => ctx.label() || null}"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                @input="${ctx.onInput}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
                @keydown="${ctx.onKeydown}" />

            ${() => ctx.clearable() && ctx._query()
                ? html`<button class="pdx-input-clear" type="button" tabindex="-1"
                    :aria-label="${() => uiString('autocomplete', 'clear')}"
                    @mousedown="${(e: Event) => { e.preventDefault(); ctx.clear(); }}">×</button>`
                : ''
            }

            ${() => ctx.isLoading()
                ? html`<span class="pdx-input-spinner"></span>`
                : ''
            }
        </div>

        <div :class="${() => 'pdx-autocomplete-dropdown' + (ctx._open() ? ' open' : '')}">
            <span class="pdx-sr-only" role="status" aria-live="polite" aria-atomic="true">
                ${() => {
                    const items = ctx.filteredItems();
                    const n = items.length;
                    if (!ctx._open() || (n === 0 && ctx.isLoading())) return '';
                    return n === 0 ? uiString('autocomplete', 'noResults') : format(uiString('autocomplete', 'resultsAvailable'), { n });
                }}
            </span>
            <div class="pdx-autocomplete-list"
                role="listbox"
                :id="${() => ctx.listboxId}">
                ${() => {
                    const items = ctx.filteredItems();
                    // Nothing matches: say so, as pdx-select does — not while suggestions are loading.
                    if (items.length === 0) {
                        return ctx._open() && !ctx.isLoading()
                            ? html`<div class="pdx-autocomplete-empty">${() => uiString('autocomplete', 'noResults')}</div>`
                            : '';
                    }
                    return items.map((item: NormalisedOption, idx: number) =>
                        html`<div class="${() => 'pdx-autocomplete-option' + (ctx._activeIndex() === idx ? ' active' : '')}"
                            role="option"
                            :id="${() => ctx.uid + '-sug-' + idx}"
                            data-suggestion-index="${() => idx}"
                            :aria-selected="${() => ctx._activeIndex() === idx ? 'true' : 'false'}"
                            @mousedown="${(e: Event) => { e.preventDefault(); ctx.selectSuggestion(item); }}"
                            @mouseenter="${() => ctx._activeIndex.set(idx)}">
                            ${() => {
                                const slotFn = ctx.getOptionSlot();
                                if (slotFn) {
                                    const q = ctx._query().trim();
                                    return slotFn({ label: item.label, value: item.value, raw: item._raw, highlighted: !!q, index: idx });
                                }
                                const q = ctx._query().trim();
                                const label = item.label;
                                if (!ctx.highlight() || !q) return label;
                                return buildHighlight(label, q);
                            }}</div>`
                    );
                }}
            </div>
        </div>
    `,
});
