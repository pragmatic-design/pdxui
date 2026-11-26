// The shape of a pdx-nav-menu entry. In a module of its own so the menu's siblings (nav-keys,
// nav-flyout) import it without importing the component; the component re-exports it.

export interface NavMenuItem {
    /** Unique key */
    key: string;
    /** Display label */
    label: string;
    /** Icon HTML (prepended) */
    icon?: string;
    /** Badge text (appended, e.g. count) */
    badge?: string;
    /** Badge variant for styling */
    badgeVariant?: 'default' | 'primary' | 'danger' | 'success';
    /** Nested children (creates collapsible group) */
    children?: NavMenuItem[];
    /** Section header (non-clickable) */
    type?: 'item' | 'header' | 'separator';
    /** Link href (renders as <a> instead of <button>) */
    href?: string;
    /** Disabled */
    disabled?: boolean;
    /** Initially expanded (for groups with children) */
    expanded?: boolean;
    /**
     * A `header` with `children` is a collapsible group heading, OPEN unless this says otherwise.
     * Toggling it emits `pdx-toggle`, for the app to keep.
     */
    collapsed?: boolean;
    /**
     * `data-*` attributes for the entry: `{ test: 'to-tickets' }` → `data-test="to-tickets"`. An
     * app's own hooks — a test's, analytics' — on a menu drawn from data. Only a valid
     * data name is written: an item must not be able to set an `href` or a handler.
     */
    data?: Record<string, string>;
}
