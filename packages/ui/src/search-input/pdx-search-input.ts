// pdx-search-input — Input with search icon, clear, debounce, Escape to clear.
// Uses pdx-input wrapper pattern. Emits pdx-search after debounce.

import { component, event, html, signal, model } from '@pdxui/core';
import { submitThroughInnerField } from '../shared/inner-field';
// The search glyph is a <pdx-icon> in this component's own template, so it is registered
// here: on a page that does not import the whole library the tag would never upgrade and the
// prefix would measure 0x0.
import '../icon/pdx-icon';
// The icons it draws whatever its data, on the page with it rather than loaded a frame late (#47).
import { defineIcons } from '../icon/icon-map';
import iconSearch from '../icon/pragmatic/search';
defineIcons({ search: iconSearch });
import { uiString } from '../shared/i18n';
import { dispatchCommit } from '../shared/commit-change';

/**
 * A search field with a search icon, a clear button and Escape to clear, that emits the search after
 * a debounce or on Enter.
 *
 * @csspart root - The frame: border, background and the states' colours.
 * @csspart input - The native `<input type="search">`, the searchbox a form submits.
 * @csspart prefix - The space before the text: the search icon, or the spinner while `loading`.
 * @csspart spinner - The loading spinner, a `role="status"`, while `loading`.
 * @csspart clear - The clear button, while there is text.
 * @csspart shortcut - The `shortcut` hint, while the field is empty.
 *
 * @cssstate disabled - `disabled` is set.
 * @cssstate loading - `loading` is set.
 *
 * @alphaevent pdx-input
 * @alphadetail value $event.currentTarget.value
 */
component('pdx-search-input', {
    // Typing writes it (#479), and the write dispatches `value-change`, live. `pdx-search` stays: it is
    // the debounced query, not the value.
    models: { value: model<string>('', { form: true }) },
    events: {
        /** The query, after the debounce or on Enter; not repeated for the same text. */
        'pdx-search': event<{ value: string }>(),
        /** The clear button or Escape emptied the field, after its `value-change`. */
        'pdx-clear': event<void>(),
        /** The searchbox received focus. */
        'pdx-focus': event<void>(),
        /** The searchbox lost focus. */
        'pdx-blur': event<void>(),
    },
    // The visual states, on the host as custom states (#132), as pdx-input's.
    states: ['disabled', 'loading'],
    parts: ['root', 'input', 'prefix', 'spinner', 'clear', 'shortcut'],
    // The axis inputs.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same size on a native field. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input. */
        size: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' },
    },
    props: {
        /** The input's placeholder. Empty: the search-input.placeholder component string, «Search...». */
        placeholder: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        name: { type: String, default: '' },
        /** Debounce delay in ms for pdx-search event (0 = no debounce) */
        debounce: { type: Number, default: 300 },
        /** Keyboard shortcut hint displayed in suffix (e.g. "Ctrl+K") */
        shortcut: { type: String, default: '' },
    },
    setup(ctx) {
        // The inner field submits; a form reset puts it and the model back to the mounted text (#135).
        submitThroughInnerField(ctx);
        const liveValue = signal('');
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        // The debounce must not emit pdx-search after the unmount
        ctx.track(() => () => { if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; } });

        ctx.track(() => {
            ctx.state('disabled', !!ctx.disabled());
            ctx.state('loading', !!ctx.loading());
        });

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
            ctx.value.set(val);

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

        // A commit no typing produced: the model's write, then the native change a commit makes.
        function clear() {
            liveValue.set('');
            const input = ctx.el.querySelector('input') as HTMLInputElement | null;
            if (input) { input.value = ''; input.focus(); }
            ctx.value.set('');
            dispatchCommit(input);
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

        return { liveValue, onInput, onKeydown, clear, onWrapClick, onFocus, onBlur };
    },
    render: (ctx) => html`
        <div class="pdx-input-wrap" data-part="root" @click="${ctx.onWrapClick}">
            <span class="pdx-input-prefix" data-part="prefix">
                ${() => ctx.loading()
                    ? html`<span class="pdx-input-loading" data-part="spinner" role="status" :aria-label="${() => uiString('search-input', 'searching')}"></span>`
                    : html`<pdx-icon name="search" size="sm"></pdx-icon>`
                }
            </span>
            <input
                class="pdx-input"
                data-part="input"
                type="search"
                :value="${ctx.value}"
                :placeholder="${() => (ctx.placeholder() as string) || uiString('search-input', 'placeholder')}"
                :disabled="${ctx.disabled}"
                :name="${ctx.name}"
                :aria-label="${() => ctx.ariaLabel() || null}"
                role="searchbox"
                :aria-busy="${() => ctx.loading() ? 'true' : null}"
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
                <button class="pdx-input-clear pdx-input-suffix-interactive" data-part="clear" type="button" :aria-label="${() => uiString('search-input', 'clear')}" tabindex="-1" @click="${ctx.clear}">\u00d7</button>
            ` : ctx.shortcut() ? html`
                <span class="pdx-input-suffix" data-part="shortcut" style="font-size:var(--pdx-text-xs);opacity:0.5"><kbd style="font-family:var(--pdx-font-mono)">${ctx.shortcut}</kbd></span>
            ` : ''}
        </div>
    `,
});
