// pdx-date-picker's public types, beside the component: a .pdx file exports its element, and an app
// that builds its presets in TypeScript imports this shape from `@pdxui/ui/date-picker`.

export interface DatePreset {
    label: string;
    value: string | [string, string];
}
