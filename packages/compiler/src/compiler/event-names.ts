// The name of an event declared with a quoted name (#749), and the emitter it gives the script.
//
// `@event 'open-change': T;` dispatches `open-change`; the function the script calls is `openChange(…)`.
// Read by the script analyzer, and by `pdx migrate`, which rewrites `$emit('open-change', v)` to it.

// Match: lowercase words of letters and digits, the first starting with a letter, joined by single
// hyphens — `open-change`, `step-2`. Not `open-`, `a--b` or `Open-Change`: their camelCase would not be
// an identifier, or would not be the name the event is listened for by (HTML lowercases attributes).
const EVENT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Whether `name` can be written as a quoted `@event` name. */
export function isEventName(name: string): boolean {
    return EVENT_NAME.test(name);
}

/** The emitter a quoted event name gives the script: its camelCase, `open-change` → `openChange`. */
export function eventEmitterName(name: string): string {
    return name.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}
