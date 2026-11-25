// pdx-tree-select's public types, beside the component: a .pdx file exports its element, and an app
// that builds its options in TypeScript imports this shape from `@pdxui/ui/tree-select`.

export interface TreeSelectNode {
    value: string;
    label: string;
    children?: TreeSelectNode[];
    disabled?: boolean;
    isLeaf?: boolean;
}
