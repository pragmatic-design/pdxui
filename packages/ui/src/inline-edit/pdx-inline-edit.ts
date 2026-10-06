// pdx-inline-edit — Click to edit, renders the right editor per data type.
// Display mode shows formatted value, edit mode shows the appropriate pdx-* component.
// Supports: text, number, currency, date, datetime, boolean, select, multiselect,
// color, rating, textarea.

import { component, html, signal, untracked } from '@pdxui/core';
import { registerComponentStrings, getComponentString, registerFormControl } from '@pdxui/core';
import { resolveLocale } from '../shared/locale';
import { setOwnProp } from '../shared/own-prop';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/inline-edit';
import '../color-picker/pdx-color-picker'; // rendered by this component, and registered by nobody else
import '../number-input/pdx-number-input'; // rendered by this component, and registered by nobody else
import '../rating/pdx-rating'; // rendered by this component, and registered by nobody else
import '../select/pdx-select'; // rendered by this component, and registered by nobody else
import '../switch-toggle/pdx-switch'; // rendered by this component, and registered by nobody else

registerComponentStrings('inline-edit', {
    empty: 'Click to edit',
    save: 'Save',
    cancel: 'Cancel',
    yes: 'Yes',
    no: 'No',
    // The editor's accessible name with no `label`: the value it edits.
    edit: 'Edit {value}',
    // The editor's accessible name when there is no value, `name` or `placeholder` either.
    label: 'Edit value',
});

registerFormControl('pdx-inline-edit', {
    valueEvent: 'pdx-change',
    valueProp: 'value',
});

/**
 * A value the user clicks to edit in place, in the editor its `type` calls for.
 */
component('pdx-inline-edit', {
    formAssociated: true,
    props: {
        /** Data type — determines which editor to show */
        type: { type: String, default: 'text' },
        /** Current value */
        value: { type: Object, default: null },
        /** Options for select/multiselect: [{ value, label }] */
        options: { type: Array, default: [] },
        /** Placeholder when value is empty */
        placeholder: { type: String, default: '' },
        /** When to enter edit mode: 'click' | 'dblclick' | 'icon' */
        editOn: { type: String, default: 'click' },
        /** When to save: 'blur' (auto-save on blur/Enter) | 'action' (confirm/cancel buttons) */
        saveOn: { type: String, default: 'blur' },
        /** Disabled */
        disabled: { type: Boolean, default: false },
        /** Readonly */
        readonly: { type: Boolean, default: false },
        /** Component size */
        size: { type: String, default: '' },
        /** Currency code for type=currency (default: 'EUR') */
        currency: { type: String, default: 'EUR' },
        /** Decimals kept by the number and currency editors. -1: the currency's own (2 for EUR, 0 for JPY), or what the number display shows (3). */
        precision: { type: Number, default: -1 },
        /** Locale for formatting. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        /** Form field name */
        name: { type: String, default: '' },
        /** Show edit icon on hover */
        showIcon: { type: Boolean, default: true },
        /** The field's name, for the editor's accessible name. Empty: the inline-edit.edit component string, «Edit {value}». */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        const _editing = signal(false);
        const _domReady = signal(false);
        const _internalValue = signal<any>(null);
        let _editValue: any = null; // temp value during editing
        let _editorBuilt = false; // the open editor exists: built once per edit

        // DOM refs
        let _displayEl: HTMLElement | null = null;
        let _editorEl: HTMLElement | null = null;
        // _actionsEl reserved for future use (action buttons container)
        let _hiddenEl: HTMLInputElement | null = null;
        let _rootEl: HTMLElement | null = null;
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;

        function getType(): string {
            return (ctx.type() as string) || 'text';
        }

        /** The prop, then the page's lang, then the browser. */
        function getLocale(): string {
            return resolveLocale(ctx.el, ctx.locale() as string);
        }

        /**
         * The decimals the number/currency editor keeps. With no step and no precision on its
         * pdx-number-input, step 1 would mean 0 decimals and every typed value would be rounded to
         * an integer: 29.5 edited to 30.2 would save 30. Automatic is what the display can show.
         */
        function editorPrecision(type: string): number {
            const own = ctx.precision() as number;
            if (own >= 0) return own;
            const loc = getLocale();
            const opts: Intl.NumberFormatOptions = type === 'currency'
                ? { style: 'currency', currency: (ctx.currency() as string) || 'EUR' }
                : {};
            return new Intl.NumberFormat(loc, opts).resolvedOptions().maximumFractionDigits ?? 0;
        }

        // ── Format value for display ──

        function formatDisplay(val: any): string {
            if (val === null || val === undefined || val === '') {
                return (ctx.placeholder() as string) || getComponentString('inline-edit', 'empty')();
            }
            const type = getType();
            const locale = getLocale();

            switch (type) {
                case 'number':
                    return new Intl.NumberFormat(locale).format(Number(val));
                case 'currency': {
                    const curr = (ctx.currency() as string) || 'EUR';
                    return new Intl.NumberFormat(locale, { style: 'currency', currency: curr }).format(Number(val));
                }
                case 'date':
                    return formatDate(val, { dateStyle: 'medium' });
                case 'datetime':
                    return formatDate(val, { dateStyle: 'medium', timeStyle: 'short' });
                case 'boolean':
                    return val ? getComponentString('inline-edit', 'yes')() : getComponentString('inline-edit', 'no')();
                case 'select': {
                    const opts = (ctx.options() as any[]) || [];
                    const opt = opts.find(o => o.value === val);
                    return opt ? opt.label : String(val);
                }
                case 'multiselect': {
                    const opts = (ctx.options() as any[]) || [];
                    const vals = Array.isArray(val) ? val : [];
                    return vals.map(v => {
                        const o = opts.find(opt => opt.value === v);
                        return o ? o.label : String(v);
                    }).join(', ');
                }
                case 'color':
                    return String(val);
                case 'rating':
                    return `${val} / 5`;
                default:
                    return String(val);
            }
        }

        function formatDate(val: any, options: Intl.DateTimeFormatOptions): string {
            try {
                const d = val instanceof Date ? val : new Date(val);
                if (isNaN(d.getTime())) return String(val);
                return new Intl.DateTimeFormat(getLocale(), options).format(d);
            } catch { return String(val); }
        }

        function isEmpty(val: any): boolean {
            return val === null || val === undefined || val === '' ||
                (Array.isArray(val) && val.length === 0);
        }

        // ── Edit mode ──

        function startEdit(): void {
            if (ctx.disabled() || ctx.readonly()) return;
            _editValue = _internalValue.peek();
            // Boolean: toggle immediately without showing editor
            if (getType() === 'boolean') {
                _editValue = !_editValue;
                _internalValue.set(_editValue);
                setOwnProp(ctx.el, 'value', _editValue);
                ctx.emit('pdx-change', { value: _editValue });
                return;
            }
            // Rating: show editor inline (no separate edit mode needed)
            _editing.set(true);
            // Click outside → auto-confirm (unless action mode)
            if ((ctx.saveOn() as string) !== 'action') {
                setTimeout(() => {
                    _outsideHandler = (e: MouseEvent) => {
                        if (!ctx.el.contains(e.target as Node)) confirmEdit();
                    };
                    document.addEventListener('mousedown', _outsideHandler);
                }, 0);
            }
        }

        function removeOutsideHandler(): void {
            if (_outsideHandler) {
                document.removeEventListener('mousedown', _outsideHandler);
                _outsideHandler = null;
            }
        }

        // Teardown on destroy: otherwise unmounting while editing would leave the
        // mousedown orphaned on document.
        ctx.track(() => () => removeOutsideHandler());

        // Closing the editor removes the element that had focus, and focus would fall to <body>: a
        // keyboard user who saved or cancelled would have to find their place again. It goes back to the
        // display — only when the editor had it, so a click or Tab elsewhere keeps where it went.
        function editorHasFocus(): boolean {
            return !!_editorEl && _editorEl.contains(document.activeElement);
        }
        function refocusDisplay(hadFocus: boolean): void {
            if (hadFocus && _displayEl && !_editing.peek()) _displayEl.focus();
        }

        function confirmEdit(): void {
            const hadFocus = editorHasFocus();
            removeOutsideHandler();
            _internalValue.set(_editValue);
            _editing.set(false);
            // The saved value is the host's `value`, as registerFormControl declares.
            setOwnProp(ctx.el, 'value', _editValue);
            ctx.emit('pdx-change', { value: _editValue });
            refocusDisplay(hadFocus);
        }

        function cancelEdit(): void {
            const hadFocus = editorHasFocus();
            removeOutsideHandler();
            _editValue = _internalValue.peek();
            _editing.set(false);
            ctx.emit('pdx-cancel');
            refocusDisplay(hadFocus);
        }

        // ── Build editor DOM for current type ──

        function buildEditor(container: HTMLElement): void {
            container.innerHTML = '';
            const type = getType();
            const val = _editValue;
            const size = ctx.size() as string;
            // The editor's accessible name (no visible <label>): WCAG 4.1.2 on the input/textarea/date.
            // The field's label, else the value it edits, so every editor is not "Edit value".
            const ariaName = (ctx.label() as string)
                || (isEmpty(val) ? '' : format(uiString('inline-edit', 'edit'), { value: formatDisplay(val) }))
                || (ctx.name() as string) || (ctx.placeholder() as string) || getComponentString('inline-edit', 'label')();

            switch (type) {
                case 'text': {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'pdx-inline-edit-input' + (size ? ` pdx-input-${size}` : '');
                    input.setAttribute('aria-label', ariaName);
                    input.value = val ?? '';
                    input.addEventListener('input', () => { _editValue = input.value; });
                    wireKeyboard(input);
                    container.appendChild(input);
                    // Focus now, not on a timer: the display is already hidden, and what was typed in
                    // between would go to <body> — "Jane Roe" typed after Enter would save "e Roe".
                    input.focus(); input.select();
                    break;
                }
                case 'textarea': {
                    const ta = document.createElement('textarea');
                    ta.className = 'pdx-inline-edit-textarea' + (size ? ` pdx-input-${size}` : '');
                    ta.setAttribute('aria-label', ariaName);
                    ta.value = val ?? '';
                    ta.rows = 3;
                    ta.addEventListener('input', () => { _editValue = ta.value; });
                    // Textarea: Ctrl+Enter to confirm, Escape to cancel
                    ta.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmEdit(); }
                    });
                    container.appendChild(ta);
                    ta.focus();
                    break;
                }
                case 'number':
                case 'currency': {
                    const num = document.createElement('pdx-number-input') as any;
                    num.setAttribute('aria-label', ariaName);
                    if (size) num.setAttribute('size', size);
                    if (type === 'currency') {
                        num.setAttribute('currency', (ctx.currency() as string) || 'EUR');
                        num.setAttribute('locale', getLocale());
                    }
                    num.setAttribute('precision', String(editorPrecision(type)));
                    // The editor opens on the value, not on its padding: 29.5 would be "29.500", because
                    // `precision` decides the decimals drawn as well as the rounding.
                    num.setAttribute('trim-zeros', '');
                    // Set value as attribute BEFORE append — CE reads it during init
                    if (val != null) num.setAttribute('value', String(val));
                    num.style.width = '100%';
                    num.style.minWidth = '180px';
                    num.addEventListener('pdx-change', (e: CustomEvent) => {
                        _editValue = e.detail?.value ?? num.value;
                    });
                    // Typing: the number input reports each keystroke as pdx-input with the parsed
                    // value. The native `input` event would read `num.value`, the host prop, which typing
                    // does not update — Enter would then save the value the edit started with.
                    num.addEventListener('pdx-input', (e: CustomEvent) => {
                        if (e.detail && 'value' in e.detail) _editValue = e.detail.value;
                    });
                    container.appendChild(num);
                    // Focus the inner input: now, when the element is defined and rendered on append
                    // (so nothing typed before the focus arrives is lost); else once it has built.
                    const focusNumber = (): boolean => {
                        const inp = num.querySelector('input');
                        if (!inp) return false;
                        inp.focus();
                        inp.select();
                        // Wire Escape on the inner input
                        inp.addEventListener('keydown', (e: KeyboardEvent) => {
                            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                            if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                        });
                        return true;
                    };
                    if (!focusNumber()) requestAnimationFrame(() => requestAnimationFrame(focusNumber));
                    break;
                }
                case 'date':
                case 'datetime': {
                    // Use native input for reliable inline editing
                    const input = document.createElement('input');
                    input.type = type === 'datetime' ? 'datetime-local' : 'date';
                    input.className = 'pdx-inline-edit-input' + (size ? ` pdx-input-${size}` : '');
                    input.setAttribute('aria-label', ariaName);
                    if (val) input.value = String(val);
                    input.addEventListener('change', () => {
                        _editValue = input.value;
                        if ((ctx.saveOn() as string) !== 'action') confirmEdit();
                    });
                    input.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                    });
                    container.appendChild(input);
                    input.focus();
                    break;
                }
                case 'boolean': {
                    const sw = document.createElement('pdx-switch') as any;
                    sw.checked = !!val;
                    sw.addEventListener('pdx-change', (e: CustomEvent) => {
                        _editValue = e.detail?.checked ?? sw.checked;
                        // Boolean auto-confirms immediately
                        confirmEdit();
                    });
                    container.appendChild(sw);
                    break;
                }
                case 'select': {
                    const sel = document.createElement('pdx-select') as any;
                    if (size) sel.setAttribute('size', size);
                    sel.options = (ctx.options() as any[]) || [];
                    sel.value = val ?? '';
                    sel.addEventListener('pdx-change', (e: CustomEvent) => {
                        _editValue = e.detail?.value ?? sel.value;
                        // Auto-confirm on select (unless action mode)
                        if ((ctx.saveOn() as string) !== 'action') confirmEdit();
                    });
                    container.appendChild(sel);
                    break;
                }
                case 'multiselect': {
                    const sel = document.createElement('pdx-select') as any;
                    sel.setAttribute('multiple', '');
                    if (size) sel.setAttribute('size', size);
                    sel.options = (ctx.options() as any[]) || [];
                    sel.value = Array.isArray(val) ? val : [];
                    sel.addEventListener('pdx-change', (e: CustomEvent) => {
                        _editValue = e.detail?.value ?? sel.value;
                    });
                    container.appendChild(sel);
                    break;
                }
                case 'color': {
                    const cp = document.createElement('pdx-color-picker') as any;
                    cp.value = val ?? '#000000';
                    cp.addEventListener('pdx-change', (e: CustomEvent) => {
                        _editValue = e.detail?.value ?? cp.value;
                    });
                    container.appendChild(cp);
                    break;
                }
                case 'rating': {
                    const rt = document.createElement('pdx-rating') as any;
                    rt.value = val ?? 0;
                    rt.addEventListener('pdx-change', (e: CustomEvent) => {
                        _editValue = e.detail?.value ?? rt.value;
                        confirmEdit();
                    });
                    container.appendChild(rt);
                    break;
                }
                default: {
                    // Fallback to text input
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'pdx-inline-edit-input';
                    input.setAttribute('aria-label', ariaName);
                    input.value = val ?? '';
                    input.addEventListener('input', () => { _editValue = input.value; });
                    wireKeyboard(input);
                    container.appendChild(input);
                    input.focus(); input.select();
                }
            }

            // Add confirm/cancel buttons for action mode
            if ((ctx.saveOn() as string) === 'action' && type !== 'boolean' && type !== 'rating') {
                const actions = document.createElement('div');
                actions.className = 'pdx-inline-edit-actions';
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'pdx-inline-edit-save';
                saveBtn.textContent = '✓';
                saveBtn.setAttribute('aria-label', getComponentString('inline-edit', 'save')());
                saveBtn.addEventListener('click', confirmEdit);
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'pdx-inline-edit-cancel';
                cancelBtn.textContent = '✕';
                cancelBtn.setAttribute('aria-label', getComponentString('inline-edit', 'cancel')());
                cancelBtn.addEventListener('click', cancelEdit);
                actions.appendChild(saveBtn);
                actions.appendChild(cancelBtn);
                container.appendChild(actions);
            }
        }

        /** Wire Enter/Escape for text-like inputs */
        function wireKeyboard(input: HTMLElement): void {
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
            });
        }

        // ── Sync external value → internal ──
        ctx.track(() => {
            const val = ctx.value();
            if (val !== undefined) {
                const cur = _internalValue.peek();
                if (JSON.stringify(val) !== JSON.stringify(cur)) {
                    _internalValue.set(val);
                }
            }
        });

        // ── Build DOM ── (ctx.frame: a setup a move destroyed does not build again)
        ctx.frame(() => {
            const el = ctx.el;
            const name = ctx.name() as string;

            _rootEl = document.createElement('div');
            _rootEl.className = 'pdx-inline-edit';

            // Display element (visible when not editing)
            _displayEl = document.createElement('div');
            _displayEl.className = 'pdx-inline-edit-display';
            _displayEl.setAttribute('role', 'button');
            _displayEl.setAttribute('tabindex', '0');

            const editOn = (ctx.editOn() as string) || 'click';
            if (editOn === 'dblclick') {
                _displayEl.addEventListener('dblclick', startEdit);
            } else {
                _displayEl.addEventListener('click', startEdit);
            }
            _displayEl.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(); }
            });

            _rootEl.appendChild(_displayEl);

            // Editor container (visible when editing)
            _editorEl = document.createElement('div');
            _editorEl.className = 'pdx-inline-edit-editor';
            _editorEl.style.display = 'none';
            // Focus leaving the editor saves it, as save-on="blur" says: otherwise Tab would move on
            // and leave it open, two editors at once. Only a move to somewhere else — the editor's own
            // buttons and popups are inside the host; no target (the window lost focus, or the
            // mousedown-outside handler is already saving) does nothing.
            _editorEl.addEventListener('focusout', (e: FocusEvent) => {
                if (!_editing.peek() || (ctx.saveOn() as string) === 'action') return;
                const to = e.relatedTarget as Node | null;
                if (to && !ctx.el.contains(to)) confirmEdit();
            });
            _rootEl.appendChild(_editorEl);

            if (name) {
                _hiddenEl = document.createElement('input');
                _hiddenEl.type = 'hidden';
                _hiddenEl.name = name;
                _rootEl.appendChild(_hiddenEl);
            }

            el.appendChild(_rootEl);
            _domReady.set(true);
        });

        // ── Reactive update ──
        ctx.track(() => {
            if (!_domReady()) return;
            const editing = _editing();
            const val = _internalValue();
            const disabled = ctx.disabled() as boolean;
            const readonly_ = ctx.readonly() as boolean;
            const showIcon = ctx.showIcon() as boolean;
            const type = getType();

            if (!_displayEl || !_editorEl || !_rootEl) return;

            _rootEl.className = 'pdx-inline-edit'
                + (disabled ? ' disabled' : '')
                + (readonly_ ? ' readonly' : '')
                + (editing ? ' editing' : '');
            // The type is an attribute: as a class, `pdx-inline-edit-${type}`, "text" and "textarea"
            // would be the value span's and the editor's own classes, and their styles would land on
            // the root.
            _rootEl.dataset.type = type;

            if (editing) {
                _displayEl.style.display = 'none';
                _editorEl.style.display = '';
                // Once per edit, and untracked. Built here on every run, the editor would be rebuilt by
                // any prop or string the build reads (size, label, the i18n strings) changing while it
                // is open: a new input, the typed text all selected, and the next key would replace it —
                // "Jane Roe" saved as "Roe". A change while editing shows at the next edit.
                if (!_editorBuilt) {
                    _editorBuilt = true;
                    const editorEl = _editorEl;
                    untracked(() => buildEditor(editorEl));
                }
            } else {
                _editorBuilt = false;
                _displayEl.style.display = '';
                _editorEl.style.display = 'none';
                _editorEl.innerHTML = '';

                // Build display content
                _displayEl.innerHTML = '';
                const isEmptyVal = isEmpty(val);

                // Color swatch
                if (type === 'color' && !isEmptyVal) {
                    const swatch = document.createElement('span');
                    swatch.className = 'pdx-inline-edit-swatch';
                    swatch.style.backgroundColor = String(val);
                    _displayEl.appendChild(swatch);
                }

                const text = document.createElement('span');
                text.className = 'pdx-inline-edit-text' + (isEmptyVal ? ' empty' : '');
                text.textContent = formatDisplay(val);
                _displayEl.appendChild(text);

                // Edit icon
                if (showIcon && !disabled && !readonly_) {
                    const icon = document.createElement('span');
                    icon.className = 'pdx-inline-edit-icon';
                    icon.textContent = '✎';
                    icon.setAttribute('aria-hidden', 'true');
                    _displayEl.appendChild(icon);
                }
            }

            if (_hiddenEl) {
                _hiddenEl.value = val !== null && val !== undefined ? JSON.stringify(val) : '';
            }
        });

        // Exposes the methods on the host: the setup's `return {}` gives them only to the render context,
        // NOT to the DOM element. Without it, host.startEdit() (the imperative API) is undefined.
        (ctx.el as unknown as Record<string, unknown>).startEdit = startEdit;
        (ctx.el as unknown as Record<string, unknown>).confirmEdit = confirmEdit;
        (ctx.el as unknown as Record<string, unknown>).cancelEdit = cancelEdit;

        return { startEdit, confirmEdit, cancelEdit };
    },
    render: () => html``,
});
