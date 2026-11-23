// The shape of a menu entry, beside pdx-menu: a .pdx script exports no type (#1210), the menu's
// declaration exports it again (#1335), and the library's manifest reads the shapes of the component's
// folder that it names. pdx-dropdown-menu, pdx-context-menu, pdx-menubar and pdx-split-button draw the
// same entries.
export interface MenuItem {
    /** Unique key for the item */
    key: string;
    /** Display label */
    label: string;
    /** Item type */
    type?: 'item' | 'checkbox' | 'radio' | 'separator' | 'label' | 'submenu';
    /** Icon HTML or text (prepended) */
    icon?: string;
    /** Keyboard shortcut display text (e.g. "Ctrl+C") */
    shortcut?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Danger/destructive styling */
    danger?: boolean;
    /** Checked state for checkbox/radio */
    checked?: boolean;
    /** Radio group name — items with same group are mutually exclusive */
    radioGroup?: string;
    /** Sub-menu items */
    children?: MenuItem[];
    /** Custom CSS class */
    className?: string;
    /**
     * The language the label is written in, when it is not the page's — a language picker's
     * «Italiano» — written as `lang` on the item so a screen reader pronounces it (WCAG 3.1.2).
     */
    lang?: string;
}
