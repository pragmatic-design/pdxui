// pdx-radio — Custom radio with label, description, sizes.
// Maps to .pdx-radio CSS class from design system (forms.css).
// Use inside <pdx-radio-group> for managed selection + keyboard nav.

import { component, html, useFormAssociated, untracked } from '@pdxui/core';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';

// One submitter per radio: the host. The inner <input type="radio"> stays, because the
// browser's radio group is what gives one tab stop and arrow keys that move and check,
// but it must not submit: its `form` attribute names no form (`pdx-radio-no-submit`), so its form
// owner is null. Radios whose owner is null group by name across the whole document, so the inner
// name is scoped to the host's form — two forms with a field `x` do not uncheck each other.
const formIds = new WeakMap<HTMLFormElement, number>();
let nextFormId = 0;
function formScope(form: HTMLFormElement): number {
    let id = formIds.get(form);
    if (id === undefined) { id = ++nextFormId; formIds.set(form, id); }
    return id;
}
type RadioHost = HTMLElement & { form: HTMLFormElement | null; name: string; checked: boolean };

/**
 * A radio button: one option of a single selection, grouped by `<pdx-radio-group>` and navigated
 * with the arrow keys.
 */
component('pdx-radio', {
    formAssociated: true,
    props: {
        checked: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        label: { type: String, default: '' },
        description: { type: String, default: '' },
        value: { type: String, default: '' },
        name: { type: String, default: '' },
        size: { type: String, default: '' },
        error: { type: Boolean, default: false },
        labelPosition: { type: String, default: 'right' },
    },
    setup(ctx) {
        // `checked` is the live state: selecting this radio writes it.
        const host = ctx.el as RadioHost;

        function innerName(): string | null {
            const n = ctx.name() as string;
            if (!n) return null;
            return host.form ? n + '~' + formScope(host.form) : n;
        }

        // The browser unchecks a radio when a sibling is chosen and fires no event for it, so the
        // host would keep `checked` — and keep submitting. The exclusivity is kept here, on the
        // hosts: when this one is checked — by the user, the keyboard or a parent — the others with
        // its name in its form are not. Read untracked: subscribing to a sibling's `checked` would
        // run this again whenever the sibling is chosen. A sibling not yet upgraded reads undefined.
        ctx.track(() => {
            if (!ctx.checked()) return;
            const name = ctx.name() as string;
            if (!name) return;
            untracked(() => {
                const root = host.getRootNode() as Document | ShadowRoot;
                for (const r of Array.from(root.querySelectorAll<RadioHost>('pdx-radio'))) {
                    if (r !== host && r.checked === true && r.name === name && r.form === host.form) setOwnProp(r, 'checked', false);
                }
            });
        });

        function onChange() {
            if (ctx.disabled()) return;
            setOwnProp(ctx.el, 'checked', true);
            ctx.emit('pdx-change', { value: ctx.value() || ctx.label() });
        }

        function boxClass(): string {
            let cls = 'pdx-radio';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-radio-' + s;
            if (ctx.error()) cls += ' pdx-radio-error';
            return cls;
        }

        function wrapClass(): string {
            let cls = 'pdx-radio-wrap';
            if (ctx.labelPosition() === 'left') cls += ' pdx-radio-label-left';
            if (ctx.disabled()) cls += ' disabled';
            return cls;
        }

        // Inside a pdx-radio-group the group is the field and submits the value; the radio submits
        // nothing, or the choice went out twice.
        useFormAssociated(ctx, {
            getFormValue: () => ctx.checked() && !host.closest('pdx-radio-group') ? ((ctx.value() as string) || 'on') : null,
        });
        reflectNameToHost(ctx);

        return { onChange, boxClass, wrapClass, innerName };
    },
    render: (ctx) => html`
        <label :class="${ctx.wrapClass}">
            <input
                type="radio"
                :class="${ctx.boxClass}"
                :checked="${ctx.checked}"
                :disabled="${ctx.disabled}"
                form="pdx-radio-no-submit"
                :name="${ctx.innerName}"
                :value="${ctx.value}"
                :aria-invalid="${() => ctx.error() ? 'true' : null}"
                @change="${ctx.onChange}"
            />
            ${() => (ctx.label() || ctx.description()) ? html`<span class="pdx-radio-content">
                ${() => ctx.label() ? html`<span class="pdx-radio-label">${ctx.label}</span>` : html`<slot></slot>`}
                ${() => ctx.description() ? html`<span class="pdx-radio-desc">${ctx.description}</span>` : ''}
            </span>` : html`<slot></slot>`}
        </label>
    `,
});
