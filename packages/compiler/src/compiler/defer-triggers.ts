// The `@defer` triggers the runtime reads (`core/src/renderer/defer.ts`, `activateTrigger`).
//
// One list, read by the validator that reports PDX_DEFER_UNKNOWN_TRIGGER and, later, by the migration
// registry that suggests `immediate` for an unknown one (#121). The compiler cannot import from core;
// `core/tests/defer-unknown-trigger.test.ts` fails when the runtime stops accepting one of these.

/** The triggers, as an author writes them. `<n>` is a number of milliseconds. */
export const DEFER_TRIGGERS: readonly string[] = ['immediate', 'viewport', 'idle', 'idle(<n>)', 'interaction', 'hover', 'timer(<n>)'];

// Match: one trigger, with the runtime's own patterns. `idle` takes an optional `(digits)`, `timer` a
// required one; the others are words.
const TRIGGER_RE = /^(?:immediate|viewport|interaction|hover|idle(?:\(\d+\))?|timer\(\d+\))$/;

/**
 * The parts of a `@defer (…)` trigger the runtime does not know, in order. Triggers combine with `|`
 * and each part is judged on its own, as the runtime splits them.
 */
export function unknownDeferTriggers(trigger: string): string[] {
    return trigger.split('|').map((t) => t.trim()).filter((t) => !TRIGGER_RE.test(t));
}
