// What a view of pdx-scheduler shows of an event's state while it is dragged and what the pointer may
// do with it, and the name a month's event reads under: shared by the component and its @internal
// views (#1020), which draw the events the component moves.

import { uiString, format } from '../shared/i18n';
import { allowed } from './drag-model';
import { clockLabel, dayRange } from './labels';
import { resourceLabels } from './event-style';
import type { Draft } from './scheduler-drag';
import type { SchedulerEvent, SchedulerResource } from './grid-model';

/** The id the range being created is drawn under while it is dragged. */
export const DRAFT_ID = 'pdx-scheduler-draft';

/** The scheduler's own say over moves: off when disabled, and `readonly` for the events without their own. */
export type MoveRules = { disabled: boolean; readonly: boolean; resources: readonly SchedulerResource[] };

/** Whether the pointer may move (`move`) or resize (`resize`) the event; never the range being created. */
export function canDo(e: SchedulerEvent, what: 'move' | 'resize', rules: MoveRules): boolean {
    return !rules.disabled && e.id !== DRAFT_ID && allowed(e, what, rules.resources, { readonly: rules.readonly });
}

/** Whether the event is the one being dragged, or the range being created is. */
export function isDraggedEvent(e: SchedulerEvent, draft: Draft | null): boolean {
    return draft !== null && (e.id === draft.id || (draft.id === '' && e.id === DRAFT_ID));
}

/** A month's event: its time (or «All day») and its days in this week, then its resources. */
export function monthEventName(e: SchedulerEvent, minutes: number | null, days: readonly string[], first: number, span: number,
    locale: string, resources: readonly SchedulerResource[]): string {
    const when = (minutes === null ? uiString('scheduler', 'allDay') : clockLabel(minutes, locale)) + ', ' + dayRange(days[first], days[first + span - 1], locale);
    const names = resourceLabels(e, resources);
    return format(uiString('scheduler', 'eventName'), { title: e.title, when }) + (names ? ', ' + names : '');
}
