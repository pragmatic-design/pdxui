// pdx-field-group — Scopes child field paths to a nested object in the form.
// Inside <pdx-form :form="f">, a <pdx-field-group name="customer"> prefixes
// all descendant field names: name="email" → form['customer.email'].
//
// The compiler handles static path prefixing at build time.
// This component provides runtime context for dynamic cases (e.g., field-list items).
//
// Display modes:
//   - inline (default): fieldset with legend, always visible
//   - dialog: trigger button → opens <pdx-dialog> with the fields
//   - panel: collapsible fieldset; the legend holds a disclosure button (not a
//     <legend role="button"> with no tabindex, which Tab would skip)

import { component, html, signal, provideFieldGroupPath, useFieldGroupPath, generatedId, model } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles live in form.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/form';
import '../dialog/pdx-dialog'; // rendered by this component, and registered by nobody else

/**
 * Scopes the fields inside it to a nested object of the form, rendered inline, as a collapsible
 * panel or behind a dialog.
 *
 * @cssstate collapsed - `collapsed`: a panel shows its legend line only.
 *
 * @csspart root - The `<fieldset>`, or the dialog mode's wrapper.
 * @csspart legend - The `<legend>`, with `label` or in panel mode.
 * @csspart toggle - The panel's disclosure button, in its legend.
 * @csspart content - The box that holds the fields, inline and in panel mode.
 * @csspart trigger - The dialog mode's button that opens the dialog.
 */
component('pdx-field-group', {
    props: {
        /** Group name — maps to a nested object key in the form data. */
        name: { type: String, default: '' },
        /** Optional label rendered as a fieldset legend. */
        label: { type: String, default: '' },
        /**
         * Display mode: inline (default), dialog, panel. A mode renders its own markup, each with its
         * fixed class, so it is no variant axis; what changes within one, collapsed, is a state.
         */
        display: { type: String, default: 'inline' },
    },
    // `collapsed` is a model (#293): the panel's toggle writes it.
    models: {
        /** Whether a panel is collapsed (display="panel" only). */
        collapsed: model<boolean>(false, { type: Boolean }),
    },
    states: ['collapsed'],
    parts: ['root', 'legend', 'toggle', 'content', 'trigger'],
    setup(ctx) {
        // Build full dotted path from parent field-group context (supports nesting). Read when used,
        // not once at setup: a group set up before its parent group would find no parent path and
        // provide its own name alone — `address` instead of `order.address`.
        function fullPath(): string {
            const parentPath = useFieldGroupPath(ctx.el) ?? '';
            const name = ctx.name() as string;
            return parentPath ? `${parentPath}.${name}` : name;
        }

        // Provide path context to descendants (runtime fallback for dynamic forms), and provide it
        // again when it changes. Only when it changes: providing wakes every path lookup, this one
        // included.
        let providedPath = '';
        ctx.track(() => {
            const path = fullPath();
            if (!path || path === providedPath) return;
            providedPath = path;
            provideFieldGroupPath(path, ctx.el);
        });

        // Panel: the model is its collapsed state, and the content id the toggle's aria-controls names.
        const _expanded = (): boolean => !(ctx.collapsed() as boolean);
        const contentId = `${generatedId('pdx-field-group')}-content`;

        // The toggle writes the model, which announces `collapsed-change`; a parent's write does not.
        function togglePanel(): void {
            ctx.collapsed.set(!ctx.collapsed.peek());
        }

        ctx.track(() => {
            ctx.state('collapsed', ctx.display() === 'panel' && !!ctx.collapsed());
        });

        // Dialog: open state
        const _dialogOpen = signal(false);

        function openDialog(): void {
            _dialogOpen.set(true);
        }
        function closeDialog(): void {
            _dialogOpen.set(false);
        }

        return { fullPath, _expanded, togglePanel, contentId, _dialogOpen, openDialog, closeDialog };
    },
    render: (ctx) => {
        const display = ctx.display() as string;

        if (display === 'dialog') {
            return html`
                <div class="pdx-field-group pdx-field-group-dialog" data-part="root">
                    <button type="button" class="pdx-outline pdx-field-group-trigger" data-part="trigger" size="sm"
                            @click="${ctx.openDialog}">
                        ${() => ctx.label() || ctx.name() || uiString('field-group', 'edit')}
                    </button>
                    ${() => ctx._dialogOpen() ? html`
                        <pdx-dialog :open="${() => true}"
                                     :title="${ctx.label}"
                                     @open-change="${(e: CustomEvent<{ value: boolean }>) => { if (!e.detail.value) ctx.closeDialog(); }}">
                            <div class="pdx-field-group-content">
                                <slot></slot>
                            </div>
                        </pdx-dialog>
                    ` : ''}
                </div>
            `;
        }

        if (display === 'panel') {
            // The legend and its toggle are there with or without a label: rendered only with one,
            // a collapsed panel without a label could never be opened. Without a label the
            // toggle shows its chevron and is named by the registered string.
            return html`
                <fieldset class="pdx-field-group pdx-field-group-panel" data-part="root" role="group" :aria-label="${() => ctx.label() || null}">
                    <legend class="pdx-field-group-legend" data-part="legend">
                        <button type="button" class="pdx-field-group-toggle" data-part="toggle"
                                :aria-expanded="${() => String(ctx._expanded())}"
                                :aria-controls="${() => ctx.contentId}"
                                :aria-label="${() => ctx.label() ? null : uiString('field-group', 'toggle')}"
                                @click="${ctx.togglePanel}">${ctx.label}</button>
                    </legend>
                    <div class="pdx-field-group-content" data-part="content" :id="${() => ctx.contentId}" :hidden="${() => !ctx._expanded()}">
                        <slot></slot>
                    </div>
                </fieldset>
            `;
        }

        // Default: inline
        return html`
            <fieldset class="pdx-field-group" data-part="root" role="group" :aria-label="${() => ctx.label() || null}">
                ${() => ctx.label() ? html`<legend class="pdx-field-group-legend" data-part="legend">${ctx.label}</legend>` : ''}
                <div class="pdx-field-group-content" data-part="content">
                    <slot></slot>
                </div>
            </fieldset>
        `;
    },
});
