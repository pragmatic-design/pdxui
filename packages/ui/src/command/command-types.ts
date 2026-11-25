// pdx-command's public types, beside the component: a .pdx file exports its element, and an app
// that builds its commands in TypeScript imports this shape from `@pdxui/ui/command`.

export interface CommandItem {
    id: string;
    label: string;
    group?: string;
    icon?: string;
    shortcut?: string;
    action?: () => void;
    keywords?: string;   // extra search terms
    disabled?: boolean;
}
