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

/** What an `@event(…)` declares about how its event is dispatched. */
export interface EventOptions {
    /** `(bubbles)`: it bubbles and is composed (#138). */
    bubbles?: true;
    /** `(cancelable)`: a listener's `preventDefault()` refuses it, and the emitter returns false (#1035). */
    cancelable?: true;
}

/**
 * The options of `@event(…)`, from the parentheses as written (`(bubbles)`, `(cancelable, bubbles)`), or
 * `{}` when there are none. Null for an option that is neither, or one written twice: the caller reports
 * the declaration.
 */
export function eventOptions(parens: string | undefined): EventOptions | null {
    if (parens === undefined) return {};
    const words = parens.slice(1, -1).split(',').map((w) => w.trim());
    const out: EventOptions = {};
    for (const w of words) {
        if (w !== 'bubbles' && w !== 'cancelable') return null;
        if (out[w]) return null;
        out[w] = true;
    }
    return out;
}

/** The emitter a quoted event name gives the script: its camelCase, `open-change` → `openChange`. */
export function eventEmitterName(name: string): string {
    return name.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}
