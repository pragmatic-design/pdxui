// pdx-search-input — Input with search icon, clear, debounce, Escape to clear.
// Uses pdx-input wrapper pattern. Emits pdx-search after debounce.

import { component, html, signal } from '@pdxui/core';
// The search glyph is a <pdx-icon> in this component's own template, so it is registered
// here: on a page that does not import the whole library the tag would never upgrade and the
// prefix would measure 0x0.
import '../icon/pdx-icon';
import { uiString } from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';

/**
 * A search field with a search icon, a clear button and Escape to clear, that emits the search after
 * a debounce or on Enter.
 */
component('pdx-search-input', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        /** The input's placeholder. Empty: the search-input.placeholder component string, «Search...». */
        placeholder: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        size: { type: String, default: '' },
        loading: { type: Boolean, default: false },
        name: { type: String, default: '' },
        /** Debounce delay in ms for pdx-search event (0 = no debounce) */
        debounce: { type: Number, default: 300 },
        /** Keyboard shortcut hint displayed in suffix (e.g. "Ctrl+K") */
        shortcut: { type: String, default: '' },
    },
    setup(ctx) {
        const liveValue = signal('');
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        // The debounce must not emit pdx-search after the unmount
        ctx.track(() => () => { if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; } });

        function wrapClass(): string {
            let cls = 'pdx-input-wrap';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-input-' + s;
            if (ctx.disabled()) cls += ' disabled';
            return cls;
        }

        /**
         * One pdx-search per search: a value that was just searched is not searched again: Enter after
         * the debounce has fired would emit the same query a second time, and a consumer would run
         * it twice. Null until the first search, so a first Enter always searches.
         */
        let lastSearched: string | null = null;
        function emitSearch(value: string): void {
            if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
            if (value === lastSearched) return;
            lastSearched = value;
            ctx.emit('pdx-search', { value });
        }

        function onInput(e: Event) {
            const val = (e.target as HTMLInputElement).value;
            liveValue.set(val);
            setOwnProp(ctx.el, 'value', val);
            ctx.emit('pdx-input', { value: val });

            // Debounced search event (cancelled on destroy too)
            if (debounceTimer) clearTimeout(debounceTimer);
            const delay = ctx.debounce() as number;
            if (delay > 0) {
                debounceTimer = setTimeout(() => { debounceTimer = null; emitSearch(val); }, delay);
            } else {
                emitSearch(val);
            }
        }

        function onKeydown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.preventDefault();
                clear();
            }
            if (e.key === 'Enter') {
                // Immediate search on Enter: cancels the pending debounce
                emitSearch(liveValue());
            }
        }

        function clear() {
            liveValue.set('');
            const input = ctx.el.querySelector('input') as HTMLInputElement | null;
            if (input) { input.value = ''; input.focus(); }
            setOwnProp(ctx.el, 'value', '');
            ctx.emit('pdx-input', { value: '' });
            emitSearch('');
            ctx.emit('pdx-clear');
        }

        function onWrapClick(e: Event) {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'BUTTON') return;
            ctx.el.querySelector('input')?.focus();
        }

        function onFocus() { ctx.emit('pdx-focus'); }
        function onBlur() { ctx.emit('pdx-blur'); }

        ctx.track(() => {
            const propVal = ctx.value() as string;
            if (propVal) liveValue.set(propVal);
        });

        // The inner <input> submits — `name` and the value verbatim. The host does not, or it would send it a second time.

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() { clear(); },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        return { liveValue, wrapClass, onInput, onKeydown, clear, onWrapClick, onFocus, onBlur };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}" @click="${ctx.onWrapClick}">
            <span class="pdx-input-prefix">
                ${() => ctx.loading()
                    ? html`<span class="pdx-input-loading" role="status" :aria-label="${() => uiString('search-input', 'searching')}"></span>`
                    : html`<pdx-icon name="search" size="sm"></pdx-icon>`
                }
            </span>
            <input
                class="pdx-input"
                type="search"
                :value="${ctx.value}"
                :placeholder="${() => (ctx.placeholder() as string) || uiString('search-input', 'placeholder')}"
                :disabled="${ctx.disabled}"
                :name="${ctx.name}"
                :aria-label="${() => ctx.ariaLabel() || null}"
                role="searchbox"
                autocomplete="off"
                data-lpignore="true"
                data-1p-ignore=""
                data-form-type="other"
                @input="${ctx.onInput}"
                @keydown="${ctx.onKeydown}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
            />
            ${() => ctx.liveValue() ? html`
                <button class="pdx-input-clear pdx-input-suffix-interactive" type="button" :aria-label="${() => uiString('search-input', 'clear')}" tabindex="-1" @click="${ctx.clear}">\u00d7</button>
            ` : ctx.shortcut() ? html`
                <span class="pdx-input-suffix" style="font-size:var(--pdx-text-xs);opacity:0.5"><kbd style="font-family:var(--pdx-font-mono)">${ctx.shortcut}</kbd></span>
            ` : ''}
        </div>
    `,
});
