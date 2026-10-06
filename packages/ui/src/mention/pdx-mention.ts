// pdx-mention — Textarea with @mention trigger, visual highlight, and floating suggestions.
// Overlay pattern: transparent-text textarea + mirror div behind for highlighting.
// Mentions tracked as ranges — textarea shows clean text, mirror highlights mentions.
// For persistence: getMentionMarkup() returns @[Label](id) format.

import { component, html, signal, useFormAssociated } from '@pdxui/core';
import { registerComponentStrings, getComponentString } from '@pdxui/core';
import { computeFloatingPosition, autoUpdate, offset, flip, shift } from '@pdxui/core';
import type { SlotFunction, VirtualElement } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/mention';

registerComponentStrings('mention', {
    loading: 'Loading...',
    noResults: 'No results',
    placeholder: 'Type @ to mention someone',
    // Announced when the suggestions change.
    suggestions: '{n, plural, one {# suggestion} other {# suggestions}}',
});

/** Instance counter for the ids that tie the textarea to its list and options. */
let _mentionSeq = 0;

export interface MentionItem {
    value: string;
    label: string;
    description?: string;
}

interface MentionRange {
    start: number;
    end: number;
    value: string;
    label: string;
    trigger: string;
}

/**
 * A textarea where typing a trigger such as @ opens floating suggestions, to insert a mention.
 *
 * @slot suggestion - Scoped — renders one suggestion. Receives `{ item, index, active }`.
 */
component('pdx-mention', {
    formAssociated: true,
    props: {
        /** Current text value (clean text, no markup) */
        value: { type: String, default: '' },
        /** Trigger character(s) — comma-separated for multiple (default: '@') */
        trigger: { type: String, default: '@' },
        /** Static suggestions array */
        items: { type: Array, default: [] },
        /** DataSource or raw array for remote search */
        source: { type: Object, default: null },
        /** Field for display label */
        labelField: { type: String, default: 'label' },
        /** Field for value/id */
        valueField: { type: String, default: 'value' },
        /** Field for description (optional) */
        descriptionField: { type: String, default: '' },
        /** Minimum chars after trigger before searching (default: 0) */
        minLength: { type: Number, default: 0 },
        /** Debounce delay in ms for remote search (default: 300) */
        debounce: { type: Number, default: 300 },
        /** Max suggestions to show */
        maxItems: { type: Number, default: 10 },
        /** Textarea rows */
        rows: { type: Number, default: 3 },
        /** Placeholder text */
        placeholder: { type: String, default: '' },
        /**
         * The field's accessible name (aria-label on the textarea). A field needs one: give `label`,
         * or put a visible label next to it. Without either, the placeholder stands in.
         */
        label: { type: String, default: '' },
        /** Disabled */
        disabled: { type: Boolean, default: false },
        /** Readonly */
        readonly: { type: Boolean, default: false },
        /** Form field name */
        name: { type: String, default: '' },
    },
    setup(ctx) {
        const _open = signal(false);
        const _query = signal('');
        const _activeIndex = signal(0);
        const _loading = signal(false);
        const _suggestions = signal<MentionItem[]>([]);
        const _activeTrigger = signal('');
        const _domReady = signal(false);
        // The form value is the persistence markup (@[Label](id) form), not the text `value` holds
        // — so it stays its own signal.
        const _markup = signal<string>((ctx.value() as string) || '');

        // Mention ranges tracked separately from text
        let _mentions: MentionRange[] = [];

        let _textareaEl: HTMLTextAreaElement | null = null;
        function getSuggestionSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['suggestion'] as SlotFunction | undefined;
        }
        let _mirrorEl: HTMLElement | null = null;
        let _dropdownEl: HTMLElement | null = null;
        let _statusEl: HTMLElement | null = null;
        const _listId = `pdx-mention-${++_mentionSeq}-list`;
        let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
        // Timers cancelled on destroy
        ctx.track(() => () => { if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; } });
        let _triggerStart = -1;

        function getTriggers(): string[] {
            const t = (ctx.trigger() as string) || '@';
            return t.split(',').map(s => s.trim()).filter(Boolean);
        }

        function normalizeItem(obj: any): MentionItem {
            if (typeof obj === 'string') return { value: obj, label: obj };
            const lf = (ctx.labelField() as string) || 'label';
            const vf = (ctx.valueField() as string) || 'value';
            const df = ctx.descriptionField() as string;
            return {
                value: String(obj[vf] ?? ''),
                label: String(obj[lf] ?? obj[vf] ?? ''),
                description: df ? String(obj[df] ?? '') : undefined,
            };
        }

        function getStaticItems(): MentionItem[] {
            return ((ctx.items() as any[]) || []).map(normalizeItem);
        }

        function resolveSourceData(): any[] {
            const src = ctx.source() as any;
            if (!src) return [];
            if (typeof src === 'object' && typeof src.data === 'function') return src.data() || [];
            if (Array.isArray(src)) return src;
            return [];
        }

        function hasRemoteSource(): boolean {
            const src = ctx.source() as any;
            return src && typeof src === 'object' && typeof src.fetch === 'function';
        }

        async function searchSuggestions(query: string): Promise<void> {
            const minLen = ctx.minLength() as number;
            if (query.length < minLen) { _suggestions.set([]); return; }

            const src = ctx.source() as any;
            const maxItems = ctx.maxItems() as number;
            const q = query.toLowerCase();

            if (src && typeof src === 'object' && typeof src.fetch === 'function') {
                _loading.set(true);
                try {
                    await src.fetch({ search: query });
                    const data = (typeof src.data === 'function' ? src.data() : src.data) || [];
                    _suggestions.set(data.map(normalizeItem).slice(0, maxItems));
                } catch { _suggestions.set([]); }
                finally { _loading.set(false); }
                return;
            }

            let all = getStaticItems();
            if (all.length === 0) all = resolveSourceData().map(normalizeItem);
            const filtered = q
                ? all.filter(i => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q))
                : all;
            _suggestions.set(filtered.slice(0, maxItems));
        }

        function debouncedSearch(query: string): void {
            if (_debounceTimer) clearTimeout(_debounceTimer);
            const delay = hasRemoteSource() ? (ctx.debounce() as number) : 0;
            if (delay > 0) {
                _debounceTimer = setTimeout(() => searchSuggestions(query), delay);
            } else {
                searchSuggestions(query);
            }
        }

        function openDropdown(triggerChar: string, triggerPos: number): void {
            _activeTrigger.set(triggerChar);
            _triggerStart = triggerPos;
            _activeIndex.set(0);
            _open.set(true);
        }

        function closeDropdown(): void {
            _open.set(false);
            _query.set('');
            _suggestions.set([]);
            _triggerStart = -1;
        }

        // ── Mention range management ──

        /** Shift all mention ranges after a position by delta */
        function shiftMentions(pos: number, delta: number): void {
            _mentions = _mentions.filter(m => {
                // If edit is inside a mention, remove that mention
                if (pos > m.start && pos < m.end) return false;
                return true;
            }).map(m => {
                if (m.start >= pos) return { ...m, start: m.start + delta, end: m.end + delta };
                return m;
            });
        }

        /** Build mirror HTML from text + mention ranges */
        function buildMirrorHTML(text: string): string {
            let result = '';
            let lastIdx = 0;
            // Sort mentions by start position
            const sorted = [..._mentions].sort((a, b) => a.start - b.start);
            for (const m of sorted) {
                if (m.start < lastIdx || m.start > text.length || m.end > text.length) continue;
                // Text before mention (HTML-escaped)
                result += escapeHTML(text.substring(lastIdx, m.start));
                // Mention span
                result += `<span class="pdx-mention-tag">${escapeHTML(text.substring(m.start, m.end))}</span>`;
                lastIdx = m.end;
            }
            // Remaining text
            result += escapeHTML(text.substring(lastIdx));
            return result + '\n'; // trailing newline for correct height
        }

        function escapeHTML(s: string): string {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function syncMirror(): void {
            if (!_mirrorEl || !_textareaEl) return;
            _mirrorEl.innerHTML = buildMirrorHTML(_textareaEl.value);
            _mirrorEl.scrollTop = _textareaEl.scrollTop;
        }

        /** Get the markup format for persistence: @[Label](value) */
        function getMentionMarkup(): string {
            if (!_textareaEl) return '';
            const text = _textareaEl.value;
            let result = '';
            let lastIdx = 0;
            const sorted = [..._mentions].sort((a, b) => a.start - b.start);
            for (const m of sorted) {
                if (m.start < lastIdx) continue;
                result += text.substring(lastIdx, m.start);
                result += `${m.trigger}[${m.label}](${m.value})`;
                lastIdx = m.end;
            }
            result += text.substring(lastIdx);
            return result;
        }

        function emitValues(): void {
            if (!_textareaEl) return;
            const text = _textareaEl.value;
            const mentions = _mentions.map(m => ({ value: m.value, label: m.label, trigger: m.trigger }));
            const markup = getMentionMarkup();
            _markup.set(markup);
            // `value` is the live text. Equal to the textarea's, so the external-value
            // track sees no change and keeps the mention ranges.
            setOwnProp(ctx.el, 'value', text);
            ctx.emit('pdx-input', { value: text, mentions, markup });
        }

        // ── Event handlers ──

        function selectItem(item: MentionItem): void {
            if (!_textareaEl || _triggerStart < 0) return;
            const text = _textareaEl.value;
            const trigger = _activeTrigger.peek();
            const cursorPos = _textareaEl.selectionStart;
            const before = text.substring(0, _triggerStart);
            const afterCursor = text.substring(cursorPos);

            // Clean insert: @Label (no markup in textarea)
            const insertText = `${trigger}${item.label} `;
            const oldLen = cursorPos - _triggerStart;
            const delta = insertText.length - oldLen;

            _textareaEl.value = before + insertText + afterCursor;
            _prevLength = _textareaEl.value.length;
            const newPos = _triggerStart + insertText.length;
            _textareaEl.selectionStart = _textareaEl.selectionEnd = newPos;
            _textareaEl.focus();

            // Shift existing mentions after this position
            shiftMentions(_triggerStart, delta);

            // Add new mention range (trigger char included in display)
            _mentions.push({
                start: _triggerStart,
                end: _triggerStart + insertText.length - 1, // exclude trailing space
                value: item.value,
                label: item.label,
                trigger,
            });

            syncMirror();
            emitValues();
            const mentions = _mentions.map(m => ({ value: m.value, label: m.label, trigger: m.trigger }));
            ctx.emit('pdx-select', { item, trigger, query: _query.peek() });
            setOwnProp(ctx.el, 'value', _textareaEl.value);
            ctx.emit('pdx-change', { value: _textareaEl.value, mentions, markup: getMentionMarkup() });
            closeDropdown();
        }

        let _prevLength = 0;

        function onInput(): void {
            if (!_textareaEl) return;
            const text = _textareaEl.value;
            const pos = _textareaEl.selectionStart;
            const delta = text.length - _prevLength;
            _prevLength = text.length;

            // Adjust mention ranges for text edits
            if (delta !== 0) {
                const editPos = pos - Math.max(delta, 0);
                shiftMentions(editPos, delta);
            }

            syncMirror();
            emitValues();

            // Detect trigger character
            const triggers = getTriggers();
            let foundTrigger = '';
            let foundPos = -1;
            for (let i = pos - 1; i >= 0; i--) {
                const ch = text[i];
                if (ch === ' ' || ch === '\n') break;
                if (triggers.includes(ch)) {
                    if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n') {
                        // Check we're not inside an existing mention
                        const inMention = _mentions.some(m => i >= m.start && i < m.end);
                        if (!inMention) { foundTrigger = ch; foundPos = i; }
                    }
                    break;
                }
            }

            if (foundTrigger && foundPos >= 0) {
                const query = text.substring(foundPos + 1, pos);
                _query.set(query);
                if (!_open.peek()) openDropdown(foundTrigger, foundPos);
                debouncedSearch(query);
            } else if (_open.peek()) {
                closeDropdown();
            }
        }

        function onKeydown(e: KeyboardEvent): void {
            if (!_open.peek()) return;
            const sugg = _suggestions.peek();
            const idx = _activeIndex.peek();

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                _activeIndex.set(sugg.length > 0 ? (idx + 1) % sugg.length : 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                _activeIndex.set(sugg.length > 0 ? (idx - 1 + sugg.length) % sugg.length : 0);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (sugg.length > 0) { e.preventDefault(); selectItem(sugg[idx]); }
            } else if (e.key === 'Escape') {
                e.preventDefault(); closeDropdown();
            }
        }

        /**
         * The caret's box in viewport coordinates. A hidden copy of the textarea lays out the text up
         * to the caret the same way, and a marker at its end is where the caret is inside the
         * textarea; the textarea's own rect and scroll put that in the viewport.
         */
        function caretRect(): DOMRect {
            if (!_textareaEl) return new DOMRect();
            const mirror = document.createElement('div');
            const style = getComputedStyle(_textareaEl);
            mirror.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow:hidden;box-sizing:${style.boxSizing};width:${style.width};font:${style.font};padding:${style.padding};border:${style.border};line-height:${style.lineHeight};`;
            const text = _textareaEl.value.substring(0, _textareaEl.selectionStart);
            mirror.textContent = text;
            const span = document.createElement('span');
            span.textContent = '|';
            mirror.appendChild(span);
            document.body.appendChild(mirror);
            const box = _textareaEl.getBoundingClientRect();
            // offsetLeft/Top count from the mirror's padding edge, i.e. inside its border — the same
            // border the textarea has, which clientLeft/Top measure.
            const left = box.left + _textareaEl.clientLeft + span.offsetLeft - _textareaEl.scrollLeft;
            const top = box.top + _textareaEl.clientTop + span.offsetTop - _textareaEl.scrollTop;
            const height = span.offsetHeight;
            document.body.removeChild(mirror);
            return new DOMRect(left, top, 0, height);
        }

        // The menu is `fixed` against the viewport and placed under the caret, so a scrolling
        // ancestor — a card, a table cell, a drawer body — cannot cut it. Not `absolute` inside the
        // wrap: any `overflow` box clips that.
        const _caret: VirtualElement = { getBoundingClientRect: caretRect };
        let _stopFollowing: (() => void) | null = null;

        function placeDropdown(): void {
            if (!_dropdownEl || _dropdownEl.style.display === 'none') return;
            const { x, y } = computeFloatingPosition(_caret, _dropdownEl, {
                placement: 'bottom-start',
                strategy: 'fixed',
                middleware: [offset(4), flip(), shift()],
            });
            _dropdownEl.style.position = 'fixed';
            _dropdownEl.style.left = `${x}px`;
            _dropdownEl.style.top = `${y}px`;
        }

        /** Place the open menu now, and keep it placed while it stays open. */
        function followCaret(): void {
            if (!_dropdownEl) return;
            if (_stopFollowing) placeDropdown();
            else _stopFollowing = autoUpdate(_caret, _dropdownEl, placeDropdown);
        }

        function stopFollowing(): void {
            _stopFollowing?.();
            _stopFollowing = null;
        }
        ctx.track(() => stopFollowing);

        // ── Build DOM ── (ctx.frame: a setup a move destroyed does not build again)
        ctx.frame(() => {
            const el = ctx.el;
            const disabled = ctx.disabled() as boolean;
            const readonly_ = ctx.readonly() as boolean;
            const ph = (ctx.placeholder() as string) || getComponentString('mention', 'placeholder')();
            const rows = ctx.rows() as number;

            const wrap = document.createElement('div');
            wrap.className = 'pdx-mention-wrap';

            _mirrorEl = document.createElement('div');
            _mirrorEl.className = 'pdx-mention-mirror';
            wrap.appendChild(_mirrorEl);

            _textareaEl = document.createElement('textarea');
            _textareaEl.className = 'pdx-mention-textarea';
            // An accessible name (the placeholder does not count as a label for axe).
            _textareaEl.setAttribute('aria-label', (ctx.label?.() as string) || ph);
            // Wired to its suggestion list: without it the list is invisible to a screen reader.
            // The textarea keeps its own role — a combobox is
            // single-line — so it says what a textbox can: that it completes from a list, which
            // list, and which option is active. Not aria-expanded: a textbox does not support it
            // (axe aria-allowed-attr, critical, measured on the open list). The live region below
            // says the list opened, and how many it holds.
            _textareaEl.setAttribute('aria-autocomplete', 'list');
            _textareaEl.setAttribute('aria-controls', _listId);
            _textareaEl.placeholder = ph;
            _textareaEl.rows = rows;
            _textareaEl.disabled = disabled;
            _textareaEl.readOnly = readonly_;
            _textareaEl.setAttribute('spellcheck', 'false');
            if (ctx.value()) {
                _textareaEl.value = ctx.value() as string;
                _prevLength = _textareaEl.value.length;
            }
            _textareaEl.addEventListener('input', onInput);
            _textareaEl.addEventListener('keydown', onKeydown);
            _textareaEl.addEventListener('scroll', () => {
                if (_mirrorEl && _textareaEl) _mirrorEl.scrollTop = _textareaEl.scrollTop;
                // The caret moves with the textarea's own scroll, which autoUpdate does not watch:
                // the textarea is not an ancestor of the menu.
                placeDropdown();
            });
            _textareaEl.addEventListener('blur', () => {
                setTimeout(() => { if (_open.peek()) closeDropdown(); }, 200);
            });
            wrap.appendChild(_textareaEl);

            _dropdownEl = document.createElement('div');
            _dropdownEl.className = 'pdx-mention-dropdown';
            // role=listbox: the children have role=option → without a listbox parent they would be orphans (axe).
            _dropdownEl.setAttribute('role', 'listbox');
            uiAttr(_dropdownEl, 'aria-label', () => uiString('mention', 'label'));
            _dropdownEl.id = _listId;
            _dropdownEl.style.display = 'none';
            wrap.appendChild(_dropdownEl);

            // How many suggestions there are, or that there are none: said once each time it changes.
            _statusEl = document.createElement('div');
            _statusEl.className = 'pdx-sr-only';
            _statusEl.setAttribute('role', 'status');
            _statusEl.setAttribute('aria-live', 'polite');
            _statusEl.setAttribute('aria-atomic', 'true');
            wrap.appendChild(_statusEl);

            el.appendChild(wrap);
            syncMirror();
            _domReady.set(true);
        });

        // Sync external value
        ctx.track(() => {
            if (!_domReady()) return;
            const val = ctx.value() as string;
            if (_textareaEl && val !== undefined && val !== _textareaEl.value) {
                _textareaEl.value = val;
                _prevLength = val.length;
                _mentions = []; // Reset mentions on external value change
                syncMirror();
            }
        });

        // Reactive: update dropdown
        ctx.track(() => {
            if (!_domReady()) return;
            const open = _open();
            const sugg = _suggestions();
            const idx = _activeIndex();
            const loading = _loading();

            if (!_dropdownEl) return;

            // An empty result is shown and said, not a list that closes without a word.
            // Below min-length there is no search yet, so no result to report.
            const searched = _query().length >= (ctx.minLength() as number);
            if (!open || (sugg.length === 0 && !loading && !searched)) {
                _dropdownEl.style.display = 'none';
                stopFollowing();
                syncActive(false, null);
                return;
            }

            _dropdownEl.style.display = '';
            _dropdownEl.innerHTML = '';
            announce(loading ? '' : sugg.length
                ? format(uiString('mention', 'suggestions'), { n: sugg.length })
                : getComponentString('mention', 'noResults')());
            // Placed once its content is in, so flip() measures the menu that will be shown.
            // autoUpdate then follows scrolls, resizes and size changes until the menu closes.
            if (loading) {
                const ld = document.createElement('div');
                ld.className = 'pdx-mention-loading';
                ld.textContent = getComponentString('mention', 'loading')();
                _dropdownEl.appendChild(ld);
                followCaret();
                syncActive(true, null);
                return;
            }
            if (sugg.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'pdx-mention-empty';
                empty.textContent = getComponentString('mention', 'noResults')();
                _dropdownEl.appendChild(empty);
                followCaret();
                syncActive(true, null);
                return;
            }
            sugg.forEach((item, i) => {
                const row = document.createElement('div');
                row.className = 'pdx-mention-item' + (i === idx ? ' active' : '');
                row.id = `${_listId}-${i}`;
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', i === idx ? 'true' : 'false');

                // Content: slot > default
                const suggSlot = getSuggestionSlot();
                if (suggSlot) {
                    const content = suggSlot({ item, index: i, active: i === idx });
                    row.appendChild(content instanceof DocumentFragment ? content : content);
                } else {
                    const label = document.createElement('span');
                    label.className = 'pdx-mention-item-label';
                    const q = _query.peek().toLowerCase();
                    if (q) {
                        const lowerLabel = item.label.toLowerCase();
                        const matchIdx = lowerLabel.indexOf(q);
                        if (matchIdx >= 0) {
                            label.appendChild(document.createTextNode(item.label.substring(0, matchIdx)));
                            const mark = document.createElement('span');
                            mark.className = 'pdx-mention-highlight';
                            mark.textContent = item.label.substring(matchIdx, matchIdx + q.length);
                            label.appendChild(mark);
                            label.appendChild(document.createTextNode(item.label.substring(matchIdx + q.length)));
                        } else {
                            label.textContent = item.label;
                        }
                    } else {
                        label.textContent = item.label;
                    }
                    row.appendChild(label);

                    if (item.description) {
                        const desc = document.createElement('span');
                        desc.className = 'pdx-mention-item-desc';
                        desc.textContent = item.description;
                        row.appendChild(desc);
                    }
                }

                row.addEventListener('mousedown', (e) => { e.preventDefault(); selectItem(item); });
                _dropdownEl!.appendChild(row);
            });
            followCaret();
            syncActive(true, `${_listId}-${Math.min(idx, sugg.length - 1)}`);
        });

        /** The textarea's side of the list: which option is active, none while it is closed. */
        function syncActive(open: boolean, activeId: string | null): void {
            if (!_textareaEl) return;
            if (activeId) _textareaEl.setAttribute('aria-activedescendant', activeId);
            else _textareaEl.removeAttribute('aria-activedescendant');
            if (!open) announce('');
        }

        /** Say `text` in the live region, once: re-renders for the active option repeat nothing. */
        function announce(text: string): void {
            if (_statusEl && _statusEl.textContent !== text) _statusEl.textContent = text;
        }

        useFormAssociated(ctx, { getFormValue: () => _markup() || null });
        // The host is the one submitter, the markup. No hidden input carries the name: filled only by
        // the suggestion list, it would send "" beside the value.
        reflectNameToHost(ctx);

        return { getMentionMarkup };
    },
    render: () => html``,
});
