// The action pdx-bulk-actions offers, beside the component, which re-exports it (#1352): the
// `@pdxui/ui/bulk-actions` entry gives the type as it did before the move to .pdx (#1210).

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
