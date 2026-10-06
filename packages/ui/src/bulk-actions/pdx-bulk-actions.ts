// pdx-bulk-actions — a contextual action bar for a multi-selection (e.g. above a data-grid).
// Visible while `count > 0`; renders "{count} selected" + one button per action + a clear button.
// Event-driven and standalone: the parent feeds `count`/`actions` and reacts to pdx-action/pdx-clear.

import { component, html } from '@pdxui/core';

/** An action's icon, loading `pdx-icon` the first time one is named: a bar of labels never pays for the set. */
function actionIcon(name: string) {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
    return html`<pdx-icon name="${name}" size="15"></pdx-icon>`;
}
import { uiString, format } from '../shared/i18n';

export interface BulkAction {
    /** Identifier emitted in pdx-action. */
    key: string;
    label: string;
    /** Optional pdx-icon name. */
    icon?: string;
    /** Semantic tone → .pdx-{tone} button class (danger/primary/…). Default ghost. */
    tone?: string;
    /**
     * The action exists and this caller may not perform it. The button renders, marked
     * `aria-disabled`, and clicking it emits nothing.
     *
     * The third case a bulk bar needs: without it, an application with permissions could only
     * drop the action from the array, so the visitor would never learn it existed and the
     * explanation would have to be a paragraph the page invents beside the bar.
     */
    disabled?: boolean;
    /** Why, read out with the button. Optional — `disabled` alone is legitimate. */
    disabledReason?: string;
}

/**
 * `aria-disabled`, not the `disabled` attribute, and that is the point of the feature rather than
 * a detail of it.
 *
 * A `disabled` button leaves the tab order, so the reason attached to it is unreachable and the
 * user is back to inferring a rule from something they cannot get to — the same hole
 * `useDropZone`'s `isRejected` closes. `role="toolbar"` is exactly where the ARIA
 * practices recommend this form, and `surfaces/buttons.css` already paints
 * `[aria-disabled="true"]` the way it paints `:disabled`, so the look is the house one.
 */
const HIDDEN_STYLE = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;'
    + 'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

/** One per bar on the page, so two bars' reasons cannot share an id. */
let barSeq = 0;

/**
 * The bar's look. Its `display` is bound on its own, from `count`: a fixed inline `display:inline-flex`
 * would beat the `[hidden]` rule, and a bar at count 0 would stay on screen with "0 selected".
 * Narrower than its actions, the bar wraps them and never grows past its container: kept on one
 * row, it is wider than a phone, and the page's sideways clip cuts the last actions off.
 */
const BAR_STYLE = 'align-items:center;gap:var(--pdx-space-md);flex-wrap:wrap;max-width:100%;box-sizing:border-box;'
    + 'padding:var(--pdx-space-xs) var(--pdx-space-md);'
    + 'border:1px solid var(--pdx-color-border);border-radius:var(--pdx-radius-md);background:var(--pdx-color-inset)';

/**
 * A contextual action bar for a multi-selection: while items are selected it shows how many, a
 * button per action and a clear button.
 */
component('pdx-bulk-actions', {
    props: {
        /** Number of selected items — drives visibility and the default label. */
        count: { type: Number, default: 0 },
        /** Actions to offer. */
        actions: { type: Array, default: [] },
        /** Label template; `{count}` is substituted. Default: the `bulk-actions.selected` component string, "{count} selected". */
        label: { type: String, default: '' },
        /** Show the trailing clear (✕) button. */
        clearable: { type: Boolean, default: true },
    },
    setup(ctx) {
        const barId = `pdx-bulk-${++barSeq}`;

        // The default is `bulk-actions.selected`, in the registry rather than an English literal, which
        // a locale can pluralise with an ICU block.
        function countLabel(): string {
            const tpl = (ctx.label() as string) || uiString('bulk-actions', 'selected');
            return format(tpl, { count: ctx.count() as number });
        }
        function onAction(action: BulkAction): void {
            // The button is `aria-disabled`, not `disabled`, so the click arrives. Refusing it
            // here is what makes the mark true rather than decorative.
            if (action.disabled) return;
            ctx.emit('pdx-action', { key: action.key, action });
        }
        /** The id of an action's reason, or null when it has none to give. */
        function reasonId(action: BulkAction): string | null {
            return action.disabled && action.disabledReason ? `${barId}-${action.key}-why` : null;
        }
        /** Every reason on this bar, for the off-screen block the buttons point at. */
        function reasons(): BulkAction[] {
            return (ctx.actions() as BulkAction[]).filter((a) => reasonId(a) !== null);
        }
        function clear(): void { ctx.emit('pdx-clear', {}); }
        return { countLabel, onAction, reasonId, reasons, clear };
    },
    render: (ctx) => html`
        <div class="pdx-bulk-actions" role="toolbar" :aria-label="${() => uiString('bulk-actions', 'label')}"
            :hidden="${() => (ctx.count() as number) <= 0}"
            :style="${() => ((ctx.count() as number) > 0 ? 'display:inline-flex;' : 'display:none;') + BAR_STYLE}">
            <span class="pdx-bulk-count" style="font-weight:600;font-size:.85rem;white-space:nowrap">${() => ctx.countLabel()}</span>
            <div class="pdx-bulk-buttons" style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:var(--pdx-space-xs)">
                ${() => (ctx.actions() as BulkAction[]).map((a) => html`
                    <button type="button" size="sm" class="pdx-bulk-action ${a.tone ? 'pdx-' + a.tone : 'pdx-ghost'}"
                        :aria-disabled="${() => (a.disabled ? 'true' : null)}"
                        :aria-describedby="${() => ctx.reasonId(a)}"
                        style="display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap"
                        @click="${() => ctx.onAction(a)}">
                        ${a.icon ? actionIcon(a.icon) : ''}${a.label}
                    </button>
                `)}
            </div>
            ${() => (ctx.reasons() as BulkAction[]).map((a) => html`
                <span id="${ctx.reasonId(a)}" style="${HIDDEN_STYLE}">${a.disabledReason}</span>
            `)}
            ${() => ctx.clearable() ? html`
                <button type="button" size="sm" class="pdx-bulk-clear pdx-ghost" :aria-label="${() => uiString('bulk-actions', 'clearSelection')}"
                    style="margin-inline-start:auto;flex:0 0 auto"
                    @click="${() => ctx.clear()}">✕</button>
            ` : ''}
        </div>
    `,
});
