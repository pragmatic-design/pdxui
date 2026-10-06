// pdx-form-field — Layout wrapper: label + input (slot) + hint + error.
// Auto-wires aria-describedby, aria-invalid, htmlFor between label and input.
// Error display is touched-gated: shows only when touched=true, showError is forced, or the form
// validates onChange.
// ZERO validation built-in — validation lives in @form rune or dev code.

import { component, html, signal, tryUseForm, useFieldGroupPath, resolveValidationMessage, onLocaleChange } from '@pdxui/core';
import type { Form } from '@pdxui/core';

let fieldIdCounter = 0;

/** The controls a field marked aria-required: only those are unmarked when `required` goes, so a
 *  control that says `required` itself (pdx-input's own prop) keeps it. */
const _markedRequired = new WeakSet<Element>();
/** The comboboxes a field named by aria-labelledby, unnamed again when its label goes. */
const _labelledByField = new WeakSet<Element>();
/** The controls a field named with its a11yLabel, unnamed again when it goes or a label shows. */
const _namedByField = new WeakSet<Element>();

/**
 * Layout wrapper for one form control: label, the slotted input, hint and error, with the ARIA
 * wiring between them and no validation of its own.
 */
component('pdx-form-field', {
    props: {
        /** Field name — if set and inside <pdx-form>, auto-wires error/touched from form context. */
        name: { type: String, default: '' },
        label: { type: String, default: '' },
        hint: { type: String, default: '' },
        description: { type: String, default: '' },
        /**
         * The error message. Shown only when the field is touched, when `show-error` is set, or when
         * its form validates onChange: an error decided by code (a server rejection, a check on save)
         * goes with `show-error`.
         */
        error: { type: String, default: '' },
        /** Non-blocking warning message (yellow, below error). */
        warning: { type: String, default: '' },
        success: { type: String, default: '' },
        required: { type: Boolean, default: false },
        optional: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        touched: { type: Boolean, default: false },
        /** Force error display even if not touched */
        showError: { type: Boolean, default: false },
        size: { type: String, default: '' },
        /** Horizontal layout: label left, input right */
        horizontal: { type: Boolean, default: false },
        /**
         * The control's name when the field shows no `label`: set as its aria-label. A visible label
         * wins, and a control that names itself keeps its own name.
         */
        a11yLabel: { type: String, default: '' },
    },
    setup(ctx) {
        const fieldId = 'pdx-ff-' + (++fieldIdCounter);
        const inputId = fieldId + '-input';
        const labelId = fieldId + '-label';
        const hintId = fieldId + '-hint';
        const errorId = fieldId + '-error';
        const descId = fieldId + '-desc';

        // Auto-wire from form context if `name` is set and no inline override.
        // Looked up when read, not once at setup: a field set up before its <pdx-form> (happy-dom
        // connects children first; a browser does when pdx-form's module loads later) would never
        // find it. A miss subscribes the reading effect to the next provideForm(); once
        // found, the form is kept.
        let _form: Form<any> | undefined;
        function currentForm(): Form<any> | undefined {
            return _form ??= tryUseForm(ctx.el) as Form<any> | undefined;
        }


        /** Resolve the full field name, prefixing with group path if needed. */
        function resolveFieldName(): string {
            const name = ctx.name() as string;
            if (!name) return '';
            const form = currentForm();
            // If the form already has this field, use it directly
            // (compiler already prefixed at build time)
            if (form && form.fields[name]) return name;
            // Runtime fallback: prefix with the field-group path — for when the compiler cannot
            // resolve it statically (e.g. inside pdx-field-list, which creates items dynamically).
            // Read here, not kept: set up before its group, the field would find none.
            const groupPath = useFieldGroupPath(ctx.el);
            if (groupPath) {
                const fullPath = `${groupPath}.${name}`;
                if (form && form.fields[fullPath]) return fullPath;
            }
            return name;
        }

        // Reactive locale tracking — bump signal when locale changes to re-resolve messages
        const _localeVer = signal(0);
        void onLocaleChange(() => _localeVer.set(v => v + 1));

        function resolveError(): string {
            _localeVer(); // read to create reactive dependency
            // Cascata: inline error prop > form context error
            const inlineError = ctx.error() as string;
            if (inlineError) return resolveValidationMessage(inlineError) || inlineError;
            const form = currentForm();
            const name = resolveFieldName();
            if (form && name && form.fields[name]) {
                const err = form.fields[name].error();
                return err ? (resolveValidationMessage(err) || err) : '';
            }
            return '';
        }

        function resolveWarning(): string {
            _localeVer(); // read to create reactive dependency
            const inlineWarning = ctx.warning() as string;
            if (inlineWarning) return inlineWarning;
            const form = currentForm();
            const name = resolveFieldName();
            if (form && name && form.fields[name]) {
                return form.fields[name].warning() ?? '';
            }
            return '';
        }

        function resolveTouched(): boolean {
            if (ctx.touched()) return true;
            const form = currentForm();
            const name = resolveFieldName();
            if (form && name && form.fields[name]) {
                return form.fields[name].touched();
            }
            return false;
        }

        function shouldShowError(): boolean {
            const err = resolveError();
            if (!err) return false;
            if (ctx.showError()) return true;
            if (resolveTouched()) return true;
            // In onChange mode, show errors immediately (no touch required)
            const form = currentForm();
            if (form && form.validateOn === 'onChange') return true;
            return false;
        }

        function wrapClass(): string {
            let cls = 'pdx-form-field';
            if (ctx.horizontal()) cls += ' pdx-form-field-horizontal';
            if (ctx.disabled()) cls += ' disabled';
            if (shouldShowError()) cls += ' has-error';
            else if (resolveWarning()) cls += ' has-warning';
            else if (ctx.success()) cls += ' has-success';
            return cls;
        }

        function labelClass(): string {
            let cls = 'pdx-field-label';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-field-label-' + s;
            if (ctx.required()) cls += ' pdx-field-required';
            if (ctx.optional()) cls += ' pdx-field-optional';
            if (ctx.disabled()) cls += ' pdx-field-label-disabled';
            return cls;
        }

        /**
         * A pdx-slider's thumbs are <div>s with the slider role: `for` cannot reach them, and every slider would
         * be "Value" under its field's visible label. One thumb is named by
         * the label; the two of a range by the label AND their own name ("Price range Minimum").
         */
        function nameSliders(root: HTMLElement, hasLabel: boolean): void {
            const thumbs = Array.from(root.querySelectorAll<HTMLElement>('[role="slider"]'));
            thumbs.forEach((thumb, i) => {
                if (hasLabel) {
                    if (!thumb.id) thumb.id = `${fieldId}-thumb-${i}`;
                    thumb.setAttribute('aria-labelledby', thumbs.length > 1 ? `${labelId} ${thumb.id}` : labelId);
                    _labelledByField.add(thumb);
                } else if (_labelledByField.has(thumb)) {
                    thumb.removeAttribute('aria-labelledby');
                    _labelledByField.delete(thumb);
                }
            });
        }

        /** The wiring for the props as last read; run again when the slot's content grows. */
        let lastWire: (() => void) | null = null;

        // Auto-wire aria attributes to the first input found in the slot
        ctx.track(() => {
            const el = ctx.el;
            const err = shouldShowError();
            const hasHint = !!(ctx.hint() as string);
            const hasDesc = !!(ctx.description() as string);
            const disabled = ctx.disabled();
            const size = ctx.size() as string;
            const required = !!ctx.required();
            const hasLabel = !!(ctx.label() as string);
            const a11yLabel = ctx.a11yLabel() as string;

            lastWire = () => {
                // Find the first focusable input element. Never a hidden input: it is what a
                // component submits, not what a person reaches — the time picker's is the only
                // input in its group, and the label's `for` would name it.
                const input = el.querySelector(
                    'input:not([type="hidden"]), textarea, select, .pdx-input-wrap, [role="radiogroup"], [role="group"]'
                ) as HTMLElement | null;
                if (!input) {
                    nameSliders(el, hasLabel);
                    return;
                }

                // A GROUP is named as a group. Its first input is one radio, or nothing a person
                // reaches: taken as the control, the label's `for` would name the first radio «Gender
                // Female» and leave the group unnamed.
                const group = input.matches('[role="radiogroup"], [role="group"]') ? input : null;

                // Set input ID for label htmlFor
                const nativeInput = group ? null : input.matches('input, textarea, select')
                    ? input
                    : input.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select');
                if (nativeInput && !nativeInput.id) {
                    nativeInput.id = inputId;
                }

                // A control that is no labelable element — pdx-select's trigger, a role="combobox"
                // <div> — cannot be reached by the label's `for`: it is named by the label's id, and
                // takes the rest of the wiring where an input would.
                const combobox = !nativeInput && input.matches('[role="combobox"]') ? input : null;
                const control = nativeInput ?? combobox;

                // Named by the label's id — `aria-labelledby` outranks both an aria-label and a
                // <label for> — wherever `for` cannot do it: a role="combobox" <div>, a group, and a
                // control that names itself with a fallback aria-label (the date picker's «Choose
                // date», the switch's «Toggle», the tag input's «Add tag»), which outranks the label's
                // `for` and would be the name every one of them is heard by. A plain input
                // keeps the `for` alone.
                const selfNamed = nativeInput && nativeInput.hasAttribute('aria-label') && !_namedByField.has(nativeInput)
                    ? nativeInput : null;
                // A group whose ONE text box is where a person types — the tag input's «Add tag» —
                // names that box too: the field is what is typed into. A time picker's segments and a
                // group's radios are several, and keep their own names («Hour», «Female»).
                const boxes = group
                    ? Array.from(group.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea'))
                    : [];
                const soleBox = boxes.length === 1 && boxes[0].hasAttribute('aria-label') ? boxes[0] : null;
                const labelled = new Set([combobox ?? group ?? selfNamed, soleBox].filter(Boolean));
                for (const target of [combobox, group, nativeInput, soleBox]) {
                    if (!target) continue;
                    if (hasLabel && labelled.has(target)) {
                        target.setAttribute('aria-labelledby', labelId);
                        _labelledByField.add(target);
                    } else if (_labelledByField.has(target)) {
                        target.removeAttribute('aria-labelledby');
                        _labelledByField.delete(target);
                    }
                }

                // A field with no visible label names its control with a11yLabel — a list row's cell,
                // whose column header names it only by sight. Not over a name the control
                // gave itself, and taken back when a label shows or the a11yLabel goes.
                const nameTarget = control ?? (input.matches('[role="radiogroup"], [role="group"]') ? input : null);
                if (nameTarget) {
                    const ours = _namedByField.has(nameTarget);
                    if (!hasLabel && a11yLabel && (ours || !nameTarget.hasAttribute('aria-label'))) {
                        nameTarget.setAttribute('aria-label', a11yLabel);
                        _namedByField.add(nameTarget);
                    } else if (ours && (hasLabel || !a11yLabel)) {
                        nameTarget.removeAttribute('aria-label');
                        _namedByField.delete(nameTarget);
                    }
                }

                // aria-describedby: chain hint + error IDs
                const describedBy: string[] = [];
                if (hasDesc) describedBy.push(descId);
                if (hasHint) describedBy.push(hintId);
                if (err) describedBy.push(errorId);

                if (control) {
                    if (describedBy.length > 0) {
                        control.setAttribute('aria-describedby', describedBy.join(' '));
                    } else {
                        control.removeAttribute('aria-describedby');
                    }
                    // Propagate error → aria-invalid
                    if (err) control.setAttribute('aria-invalid', 'true');
                    else control.removeAttribute('aria-invalid');
                }

                // Propagate required → aria-required. An asterisk alone tells no control:
                // "Full Name, edit text", no "required", until an error shows. Not
                // the native `required`: the browser's validation bubble would come up beside the
                // form's own messages. A radio group takes it on the group — a radio cannot carry it.
                const requiredTarget = input.matches('[role="radiogroup"]') ? input : control;
                if (requiredTarget) {
                    if (required) {
                        requiredTarget.setAttribute('aria-required', 'true');
                        _markedRequired.add(requiredTarget);
                    } else if (_markedRequired.has(requiredTarget)) {
                        requiredTarget.removeAttribute('aria-required');
                        _markedRequired.delete(requiredTarget);
                    }
                }

                // Propagate disabled/error/size to WC children
                const wcInputs = el.querySelectorAll('pdx-input, pdx-textarea, pdx-checkbox, pdx-radio, pdx-switch, pdx-radio-group, pdx-checkbox-group');
                for (const wc of wcInputs) {
                    if (disabled) wc.setAttribute('disabled', '');
                    if (err) wc.setAttribute('error', '');
                    else wc.removeAttribute('error');
                    if (size) wc.setAttribute('size', size);
                }
            };
            requestAnimationFrame(lastWire);
        });

        // Wired again when the slot's content GROWS. The wiring runs a frame after the field's
        // props, and a control that builds its own DOM in a later frame — the date picker does, in
        // its first rAF — is not there yet: run once, nothing would be found, nothing named, and
        // nothing would ever look again. Added nodes only: the wiring writes attributes, never nodes, so
        // it cannot wake itself. One frame per burst, whatever the number of records.
        let rewireQueued = false;
        const slotWatch = new MutationObserver((records) => {
            if (rewireQueued || !lastWire || !records.some(r => r.addedNodes.length > 0)) return;
            rewireQueued = true;
            requestAnimationFrame(() => { rewireQueued = false; lastWire?.(); });
        });
        slotWatch.observe(ctx.el, { childList: true, subtree: true });
        ctx.track(() => () => slotWatch.disconnect());

        return { fieldId, inputId, labelId, hintId, errorId, descId, shouldShowError, resolveError, resolveWarning, wrapClass, labelClass };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}">
            ${() => ctx.label() ? html`
                <label :class="${ctx.labelClass}" :id="${() => ctx.labelId}" :for="${() => ctx.inputId}">${ctx.label}</label>
            ` : ''}
            ${() => ctx.description() ? html`
                <span class="pdx-field-description" :id="${() => ctx.descId}">${ctx.description}</span>
            ` : ''}
            <div class="pdx-form-field-input">
                <slot></slot>
            </div>
            ${() => ctx.shouldShowError() ? html`
                <span class="pdx-field-error" :id="${() => ctx.errorId}" role="alert">${() => ctx.resolveError()}</span>
            ` : ctx.resolveWarning() ? html`
                <span class="pdx-field-warning">${() => ctx.resolveWarning()}</span>
            ` : ctx.success() ? html`
                <span class="pdx-field-success">${ctx.success}</span>
            ` : ctx.hint() ? html`
                <span class="pdx-field-hint" :id="${() => ctx.hintId}">${ctx.hint}</span>
            ` : ''}
        </div>
    `,
});
