// PDX_EVENT_BUBBLES_UNUSED (#138): an `@event(bubbles)` no element above the component listens to.
//
// `pdx migrate` writes `(bubbles)` on every alpha `@event`, which keeps what each did; most of them
// are heard only on the component itself (`<app-card @saved>`), where bubbling adds nothing. This
// lists those, so the marker can be removed by hand. "Above" is read off the project's templates
// (`project-listeners.ts`, which the resolver reads files with): a listener `@saved` written on any
// element that is not the component's own tag hears the event only because it bubbles. A listener
// added from a `.ts` (`addEventListener`) is not read, which is why the diagnostic is an info and not a
// warning. No file is read here: the compiler also runs in a browser, the site's playground.

import type { EventInfo } from './script-analyzer-types';
import type { ValidationWarning } from './validate';

/** Whether something in the project listens to `event` on an element other than this component. */
export type EventHeardLookup = (event: string) => boolean;

/** PDX_EVENT_BUBBLES_UNUSED for each `@event(bubbles)` the project does not hear above the component. */
export function checkBubblesUnused(events: readonly EventInfo[], heardAbove?: EventHeardLookup): ValidationWarning[] {
    if (!heardAbove) return [];
    return events.filter((e) => e.bubbles && !heardAbove(e.name)).map((e) => ({
        code: 'PDX_EVENT_BUBBLES_UNUSED',
        severity: 'info' as const,
        message: `@event(bubbles) '${e.name}': no template in the project listens to it above the component, only on it, where bubbling adds nothing.`,
        hint: `If nothing outside the templates listens either, remove the marker: @event ${e.name}${e.payloadType === 'void' ? '' : `: ${e.payloadType}`};`,
    }));
}
