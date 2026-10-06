// pdx-edit-drawer — a drawer hosting a schema-driven form for creating/editing one entity.
// Composes pdx-drawer + pdx-form-template (built from a FormSchema). On Save it validates and emits
// pdx-save with the values; the parent persists and closes. `value=null` → create mode.
//
// The form-template is mounted IMPERATIVELY (schema/form set as properties), matching pdx-auto-form:
// passing an object prop down two declarative-binding levels does not reliably reach the child.

import { component, html, createFormFromSchema } from '@pdxui/core';
import type { FormSchema, Form } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// Self-contained: ensure the composed custom elements are registered when this entry is imported
// directly (e.g. @pdxui/ui/edit-drawer), not only via the @pdxui/ui barrel.
import '../drawer/pdx-drawer';
import '../form-template/pdx-form-template';
// This component's styles live in drawer.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/drawer';

/**
 * A drawer hosting a schema-driven form to create or edit one entity: on Save it validates and emits
 * `pdx-save` with the values.
 */
component('pdx-edit-drawer', {
    props: {
        /** Open state (controlled). */
        open: { type: Boolean, default: false },
        /** FormSchema describing the entity fields. */
        schema: { type: Object, default: null },
        /** Entity to edit, or null to create a new one. */
        value: { type: Object, default: null },
        /** Drawer title; defaults to "Edit"/"New" by mode. */
        title: { type: String, default: '' },
        position: { type: String, default: 'right', enum: ['left', 'right'] },
        /** Forwarded to pdx-drawer — named preset (sm/md/lg) or a custom CSS width. */
        size: { type: String, default: 'md' },
        /** Label of the save button. Empty: the edit-drawer.save component string, «Save». */
        saveLabel: { type: String, default: '' },
        /** Label of the cancel button. Empty: the edit-drawer.cancel component string, «Cancel». */
        cancelLabel: { type: String, default: '' },
        /** Disable the footer buttons while the parent is persisting. */
        busy: { type: Boolean, default: false },
    },
    setup(ctx) {
        let formInstance: Form<Record<string, unknown>> | null = null;
        /** This drawer's form body — the drawer may move its panel to <body>, so it is kept, not re-queried. */
        let bodyEl: HTMLElement | null = null;

        // Mount a FRESH form-template on each open: load the entity into the form FIRST, then build
        // the template so its inputs render with the loaded values (a form reset after the inputs
        // already exist doesn't reliably refresh their display). Props are set imperatively — passing
        // an object prop through declarative bindings does not reliably reach the child (pdx-auto-form
        // does the same). The drawer re-parents slotted content, so we always query the live body.
        function mountForm(): void {
            const schema = ctx.schema() as FormSchema | null;
            const body = bodyEl ?? ctx.el.querySelector<HTMLElement>('.pdx-edit-drawer-body');
            if (!body || !schema) return;
            bodyEl = body;
            // A fresh form per open, so each one starts from the schema's defaults. A form reused and
            // reset with `value ?? {}` would not do: form.reset MERGES into its snapshot, so New
            // after Edit would keep the edited entity ("Alice Johnson" under the title "New"), and
            // Bob would keep Alice's phone.
            formInstance?.dispose?.();
            formInstance = createFormFromSchema(schema);
            const value = ctx.value() as Record<string, unknown> | null;
            if (value) formInstance.reset(value);

            type FormTemplateEl = HTMLElement & { schema: unknown; form: unknown; showActions: boolean };
            body.innerHTML = '';
            const ft = document.createElement('pdx-form-template') as FormTemplateEl;
            // Every prop is set BEFORE the element is attached. The body is in the document, so
            // appending mounts the template at once, and its <pdx-form> sets up with whatever `form`
            // it has at that moment: appending first would print `<pdx-form> requires a "form" prop`
            // on every open. Props set before connect are carried over when the element mounts.
            ft.form = formInstance;
            // The drawer supplies its own Cancel/Save footer, so the form-template's built-in actions
            // bar is redundant (its top-border read as a stray "hr" under the inputs). showActions is a
            // default-TRUE boolean prop and can't be cleared via the attribute, so the visual hide is
            // enforced in CSS (.pdx-edit-drawer pdx-form-actions { display:none }) — this stays as the
            // declared intent.
            ft.showActions = false;
            ft.schema = schema;
            body.appendChild(ft);
        }

        // (Re)build the form whenever the drawer opens or the entity changes.
        ctx.track(() => {
            const isOpen = ctx.open() as boolean;
            void ctx.value();
            void ctx.schema();
            if (isOpen) requestAnimationFrame(() => mountForm());
        });

        const isEdit = (): boolean => !!ctx.value();
        function resolvedTitle(): string {
            return (ctx.title() as string) || uiString('edit-drawer', isEdit() ? 'edit' : 'new');
        }

        async function save(): Promise<void> {
            if (!formInstance) return;
            if (!(await formInstance.validate())) {
                focusFirstError();
                return;
            }
            ctx.emit('pdx-save', { values: formInstance.getValues(), mode: isEdit() ? 'edit' : 'create' });
        }

        /** A failed save puts focus on the first invalid field, so a keyboard or screen-reader user
         *  lands on the error and hears its message rather than staying on Save. The errors are
         *  drawn by the fields' own bindings, so this looks after the next frame. */
        function focusFirstError(): void {
            requestAnimationFrame(() => {
                const invalid = bodyEl?.querySelector<HTMLElement>('[aria-invalid="true"]');
                if (!invalid) return;
                const target = invalid.matches('input, textarea, select, [tabindex]')
                    ? invalid
                    : invalid.querySelector<HTMLElement>('input, textarea, select, [tabindex]') ?? invalid;
                target.focus();
            });
        }
        function cancel(): void { ctx.emit('pdx-cancel', {}); }

        /**
         * The inner drawer trying to close itself — Escape, the ✕, the backdrop, a swipe.
         *
         * ALWAYS prevented, and that is what «controlled» means: `open` is this component's prop,
         * so the host owns the open state and the drawer must not write over it. What the host gets
         * is `pdx-cancel`, once, before anything moves; it closes by setting `open` to false, which
         * flows down.
         *
         * Without this, a host that asked «discard your changes?» and was answered «stay» would keep
         * a drawer that had already shut itself: `el.open` reads true, the panel is in the document
         * and not `aria-hidden`, and it is invisible — `[data-open]` is gone and the CSS opens
         * the panel by it. The host's binding cannot correct it, because the host's
         * value has never changed.
         */
        function onBeforeClose(e: Event): void {
            e.preventDefault();
            cancel();
        }

        ctx.expose({
            /** The form values now, `{}` while the form is not built. */
            getValues() { return formInstance?.getValues() ?? {}; },
            validate() { return formInstance?.validate() ?? Promise.resolve(false); },
            /**
             * Whether anything in the form was changed since it opened.
             *
             * A drawer is not a modal — Escape and the ✕ close it, and both are easy to hit by
             * accident — so a host has to ask before discarding, and only when there is something to
             * discard. The host cannot work this out for itself: the panel is re-parented to
             * <body>, so a query under the host finds no form, and comparing `getValues()` with the
             * record races the keystroke that has not reached the form model yet. The form carries
             * this itself.
             */
            isDirty() { return formInstance?.dirty() ?? false; },
        });

        return { resolvedTitle, save, cancel, onBeforeClose };
    },
    render: (ctx) => html`
        <pdx-drawer :open="${ctx.open}" :position="${ctx.position}" :size="${ctx.size}"
            :label="${() => ctx.resolvedTitle()}" @pdx-before-close="${(e: Event) => ctx.onBeforeClose(e)}">
            <div class="pdx-edit-drawer" style="display:flex;flex-direction:column;height:100%;gap:var(--pdx-space-md)">
                <header style="font-weight:600" class="pdx-txt-heading">${() => ctx.resolvedTitle()}</header>
                <div class="pdx-edit-drawer-body" style="flex:1;overflow:auto;min-height:0"></div>
            </div>
            <!-- Cancel/Save go in the drawer's own footer slot: the .pdx-drawer-footer provides the full-width
                 separator + padding (no inset border, no extra empty footer below). -->
            <div slot="footer" style="display:flex;justify-content:flex-end;align-items:center;gap:var(--pdx-space-sm)">
                <button type="button" size="sm" class="pdx-ghost" :disabled="${ctx.busy}"
                    @click="${() => ctx.cancel()}">${() => (ctx.cancelLabel() as string) || uiString('edit-drawer', 'cancel')}</button>
                <button type="button" size="sm" class="pdx-primary" :disabled="${ctx.busy}"
                    @click="${() => ctx.save()}">${() => (ctx.saveLabel() as string) || uiString('edit-drawer', 'save')}</button>
            </div>
        </pdx-drawer>
    `,
});
