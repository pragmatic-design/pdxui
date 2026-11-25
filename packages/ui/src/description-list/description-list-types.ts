// The entry pdx-description-list draws, beside the component, which re-exports it (#1352): the
// `@pdxui/ui/description-list` entry gives the type as it did before the move to .pdx (#1210).

export interface DescriptionListItem {
    label: string;
    value: string | HTMLElement;
    span?: number;
    icon?: string;
}
