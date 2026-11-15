// What every view of pdx-scheduler draws an event with, beside its own layout: its colour and the
// names of its resources. Shared by the component and its @internal views (#1020).

import { eventResources, type SchedulerEvent, type SchedulerResource } from './grid-model';

/**
 * An event's colour, as the `--pdx-scheduler-event-color` declaration to append to a style: its own,
 * else the colour of the resource it is drawn for, else its first resource's; '' when none has one.
 */
export function eventColorStyle(e: SchedulerEvent, resources: readonly SchedulerResource[], drawnFor?: SchedulerResource | null): string {
    const color = e.color ?? drawnFor?.color ?? eventResources(e, resources)[0]?.color;
    return color ? ';--pdx-scheduler-event-color:' + color : '';
}

/** The labels of an event's resources, comma-separated; '' when it has none. */
export function resourceLabels(e: SchedulerEvent, resources: readonly SchedulerResource[]): string {
    return eventResources(e, resources).map((r) => r.label).join(', ');
}
