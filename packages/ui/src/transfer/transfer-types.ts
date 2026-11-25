// pdx-transfer's public types, beside the component: a .pdx file exports its element, and an app
// that builds its items in TypeScript imports this shape from `@pdxui/ui/transfer`.

export interface TransferItem {
    value: string;
    label: string;
    disabled?: boolean;
    /** Original data object (for DataSource mode) */
    _raw?: any;
}
