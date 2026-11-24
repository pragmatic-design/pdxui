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

/**
 * The words no binding of a module may be named: JavaScript's reserved words, those of strict mode (a
 * module is strict), and `arguments` / `eval`, which strict mode does not let a `const` take.
 */
const RESERVED = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
    'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
    'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
    'while', 'with', 'yield', 'await', 'let', 'static', 'implements', 'interface', 'package', 'private',
    'protected', 'public', 'arguments', 'eval',
]);

/** Whether `name` is a word no binding of a module may take (RESERVED): a prop's too (#1239). */
export function isReservedWord(name: string): boolean {
    return RESERVED.has(name);
}

/** A name to suggest instead of a reserved one: the past participle an event is usually named by. */
const INSTEAD: Record<string, string> = {
    delete: 'remove` or `deleted', import: 'imported', export: 'exported', new: 'created', default: 'reset',
    switch: 'toggle', return: 'returned', continue: 'resumed', break: 'stopped', throw: 'failed', in: 'entered',
};

/**
 * PDX_EVENT_NAME_RESERVED (#1130), or null: an event whose emitter would be a reserved word cannot be
 * declared, since its emitter is a `const` of the setup — `@event delete` wrote `const delete = …`, a
 * module that does not parse — and a call `delete({ … })` is the delete operator, not a call.
 */
export function reservedEventName(name: string, emitter: string): { code: 'PDX_EVENT_NAME_RESERVED'; severity: 'error'; message: string; hint: string } | null {
    if (!RESERVED.has(emitter)) return null;
    const instead = INSTEAD[emitter];
    return {
        code: 'PDX_EVENT_NAME_RESERVED',
        severity: 'error',
        message: `@event ${name} would have the emitter \`${emitter}\`, a reserved word of JavaScript: no function can be named so, and \`${emitter}(…)\` would not call it.`,
        hint: instead
            ? `Name the event for what happened, in a word that is not reserved: \`${instead}\`.`
            : `Name the event for what happened, in a word that is not reserved (a past participle often is: \`${emitter}ed\`).`,
    };
}
