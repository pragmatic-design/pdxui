// pdx-cascader's public types, beside the component: a .pdx file exports its element, and an app
// that builds its options in TypeScript imports this shape from `@pdxui/ui/cascader`.

export interface CascaderNode {
    value: string;
    label: string;
    children?: CascaderNode[];
    /** Lazy load: true = has children but not loaded yet */
    isLeaf?: boolean;
    disabled?: boolean;
}
