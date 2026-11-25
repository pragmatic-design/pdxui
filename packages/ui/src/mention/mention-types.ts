// pdx-mention's public types, beside the component: a .pdx file exports its element, and an app
// that builds its suggestions in TypeScript imports this shape from `@pdxui/ui/mention`.

export interface MentionItem {
    value: string;
    label: string;
    description?: string;
}
