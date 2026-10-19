// The `@defer` triggers the runtime reads (`core/src/renderer/defer.ts`, `activateTrigger`), and the
// grammar of the parentheses that hold them (#281; docs/language/beta/template.md → «`@defer` — two
// phases»):
//
//   @defer ( <render triggers> [ ; prefetch <prefetch triggers> ] )
//
// Triggers combine with `|`; a trigger is a built-in or `when (<expression>)`. The split is at the
// top level only, so a `|` or a `;` inside `when ( … )` is the expression's.
//
// One reader for the validator that reports PDX_DEFER_UNKNOWN_TRIGGER, both code generators, and the
// migration registry (#121). The compiler cannot import from core; `core/tests/defer-unknown-trigger.test.ts`
// fails when the runtime stops accepting one of these.

import { splitAtDepthZero } from './tokenizer';
import { jsQuote } from './js-literal';

/** The built-in triggers, as an author writes them. `<n>` is a number of milliseconds. */
export const DEFER_TRIGGERS: readonly string[] = ['immediate', 'viewport', 'idle', 'idle(<n>)', 'interaction', 'timer(<n>)'];

// Match: one built-in trigger, with the runtime's own patterns. `idle` takes an optional `(digits)`,
// `timer` a required one; the others are words.
const TRIGGER_RE = /^(?:immediate|viewport|interaction|idle(?:\(\d+\))?|timer\(\d+\))$/;

// Match: `when ( … )` — the keyword and its opening parenthesis; the rest is read balanced.
const WHEN_RE = /^when\s*\(/;

/** One phase of a `@defer`: its built-in triggers, and the expressions of its `when ( … )`s. */
export interface DeferPhase {
    triggers: string[];
    when: string[];
}

/** The triggers of a `@defer (…)`, by phase, and what in them is not a trigger. */
export interface DeferTriggers {
    render: DeferPhase;
    prefetch?: DeferPhase;
    /** Every part that is not a trigger, in order: an unknown name, an empty `when ()`, a `;` not followed by `prefetch`. */
    unknown: string[];
}

/** The `@defer` spelling the beta removed (decision 37): `hover` is `interaction`. */
export const REMOVED_TRIGGER = 'hover';

function readPhase(text: string, unknown: string[]): DeferPhase {
    const phase: DeferPhase = { triggers: [], when: [] };
    for (const item of splitAtDepthZero(text, '|').map((t) => t.trim()).filter(Boolean)) {
        if (WHEN_RE.test(item) && item.endsWith(')')) {
            const expr = item.slice(item.indexOf('(') + 1, -1).trim();
            if (expr) phase.when.push(expr);
            else unknown.push(item);
        } else if (TRIGGER_RE.test(item)) {
            phase.triggers.push(item);
        } else {
            unknown.push(item);
        }
    }
    return phase;
}

/** Read the text inside `@defer ( … )`. */
export function parseDeferTriggers(raw: string): DeferTriggers {
    const unknown: string[] = [];
    const [render, ...rest] = splitAtDepthZero(raw, ';');
    const out: DeferTriggers = { render: readPhase(render ?? '', unknown), unknown };
    if (rest.length > 0) {
        // Match: `prefetch` and what follows it. Groups: [1]=the prefetch triggers
        const m = rest.length === 1 ? /^\s*prefetch\s+([\s\S]+)$/.exec(rest[0]) : null;
        if (m) out.prefetch = readPhase(m[1], unknown);
        else unknown.push(`;${rest.join(';')}`.trim());
    }
    return out;
}

/**
 * The trigger options of `defer()`, as `key: value` strings, for both code generators: `trigger` and
 * `when` start the render, `prefetch` and `prefetchWhen` only the load. `expr` turns a template
 * expression into the code that reads it, the generator's own way. What is not a trigger — a compile
 * error already — is passed on in `trigger`, where the runtime fires it at once, as the alpha did.
 */
export function deferTriggerOptions(raw: string, expr: (source: string) => string, compact = false): string[] {
    const t = parseDeferTriggers(raw);
    const sp = compact ? '' : ' ';
    const when = (list: string[]): string => `()${sp}=>${sp}${list.map((e) => `(${expr(e)})`).join(' || ')}`;
    const opts: string[] = [];
    // The triggers as the alpha wrote them, when they are only built-ins: the emitted module is what it was.
    const render = [...t.render.triggers, ...t.unknown];
    if (render.length > 0) opts.push(`trigger:${sp}${jsQuote(t.prefetch || t.render.when.length > 0 ? render.join(' | ') : raw.trim())}`);
    if (t.render.when.length > 0) opts.push(`when:${sp}${when(t.render.when)}`);
    if (t.prefetch && t.prefetch.triggers.length > 0) opts.push(`prefetch:${sp}${jsQuote(t.prefetch.triggers.join(' | '))}`);
    if (t.prefetch && t.prefetch.when.length > 0) opts.push(`prefetchWhen:${sp}${when(t.prefetch.when)}`);
    return opts;
}

/**
 * The parts of a `@defer (…)` trigger that are not triggers, in order — `hover` aside: it is a form the
 * beta removed, reported and rewritten as such (`language/defer-hover.ts`).
 */
export function unknownDeferTriggers(trigger: string): string[] {
    return parseDeferTriggers(trigger).unknown.filter((t) => t !== REMOVED_TRIGGER);
}
