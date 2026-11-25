// The event pdx-timeline draws, beside the component, which re-exports it (#1352): the
// `@pdxui/ui/timeline` entry gives the type as it did before the move to .pdx (#1210).

export interface TimelineItem {
    title: string;
    description?: string;
    date?: string;
    icon?: string;
    color?: string;
    status?: 'default' | 'success' | 'warning' | 'error' | 'info';
    /** What the status means here ("Completed", "Current"), read out in place of the dot's colour.
     *  Empty: the timeline.{status} component string. */
    statusLabel?: string;
}
