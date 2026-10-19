// The alpha change events of the library components (#478, part 1 of #125).
//
// A component that moves to its model (`models` in the descriptor, #124) no longer emits its alpha
// change event: `<pdx-checkbox @pdx-change="…">` listens to nothing. Its manifest says which alpha
// events it emitted (`alphaEvents`) and how each alpha `detail.<field>` reads now (`alphaDetail`,
// written against `$event`). Two registry entries read them through the context's `alphaOf`:
//
//   alpha-change-event    — removed: `@<alpha event>=` is PDX_REMOVED_FORM naming the model's event;
//                           `pdx migrate` rewrites an inline handler and flags what it cannot;
//   alpha-change-listener — changed, flagged: `@change=` on a component that emitted `change` still
//                           hears a native `change` from an inner input, so it is not an error.
//
// No library component lists `alphaEvents` yet: each batch of #125 adds them as it moves.

import { escapeForRegExp } from '../compiler/regexp-escape';
import type { LanguageChange, LanguageChangeContext, LanguageChangeFinding } from './changes';

/** What a component's manifest says of its alpha events, and the event of its first model. */
export interface AlphaEvents {
    events: string[];
    /** Alpha `detail.<field>` → the beta expression, written against `$event`. */
    detail: Record<string, string>;
    /** The first model's event, `checked-change`. */
    modelEvent: string;
}

/** tag → its alpha events, or null when it records none (or has no model to move to). */
export type AlphaLookup = (tag: string) => AlphaEvents | null;

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** One listener on a component that records alpha events. */
interface Listener {
    /** Offset of the attribute in the text. */
    at: number;
    /** The attribute as written: `@pdx-change.stop="…"`. */
    attribute: string;
    event: string;
    modifiers: string;
    quote: string;
    value: string;
    alpha: AlphaEvents;
}

// Match: the opening tag of a custom element, quoted values read whole (a handler holds `=>`).
// Groups: [1]=the tag [2]=its attributes
const CUSTOM_TAG = /<([A-Za-z][\w]*-[\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Match: an event listener attribute. Groups: [1]=the event [2]=its modifiers [3]=the quote [4]=the value
const LISTENER = /(?<=\s)@([A-Za-z][\w-]*)((?:\.[\w-]+)*)\s*=\s*(["'])([\s\S]*?)\3/g;

/** Every listener whose event `pick` accepts, on a tag whose manifest records alpha events. */
function listeners(text: string, context: LanguageChangeContext | undefined, pick: (event: string, alpha: AlphaEvents) => boolean): Listener[] {
    const alphaOf = context?.alphaOf;
    if (!alphaOf) return [];
    const out: Listener[] = [];
    for (const tag of text.matchAll(CUSTOM_TAG)) {
        const alpha = alphaOf(tag[1].toLowerCase());
        if (!alpha) continue;
        const attrsAt = tag.index + 1 + tag[1].length;
        for (const l of tag[2].matchAll(LISTENER)) {
            if (!pick(l[1], alpha)) continue;
            out.push({ at: attrsAt + l.index, attribute: l[0], event: l[1], modifiers: l[2], quote: l[3], value: l[4], alpha });
        }
    }
    return out;
}

/** A handler that is a reference: `onChange`, `form.save`. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
// Match: an arrow with one plain parameter, or none. Groups: [1]=the parameter in parentheses [2]=the
// bare parameter [3]=the body
const ARROW = /^(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*(\S[\s\S]*)$/;

/**
 * The handler with each alpha `detail.<field>` read rewritten through `detail`, or null when a person
 * must rewrite it: a reference, the event or its `detail` passed on whole, a field with no mapping, a
 * parameter list the rewrite does not read.
 */
function rewriteHandler(value: string, detail: Record<string, string>): string | null {
    const handler = value.trim();
    if (REFERENCE.test(handler)) return null;
    let event = '$event';
    let head = '';
    let body = handler;
    if (/^(?:async\s+)?(?:\(|[A-Za-z_$][\w$]*\s*=>)/.test(handler) && handler.includes('=>')) {
        const arrow = ARROW.exec(handler);
        if (!arrow) return null; // destructured or several parameters
        const name = arrow[1] ?? arrow[2];
        if (!name) return handler; // `() => …` reads no event
        event = name;
        body = arrow[3];
        head = handler.slice(0, handler.length - body.length);
    }
    let failed = false;
    // Match: the event name standing alone, and the members read off it. Groups: [1]=the members
    const reads = new RegExp(`(?<![\\w$.])${escapeForRegExp(event)}(?![\\w$])((?:\\??\\.[A-Za-z_$][\\w$]*)*)`, 'g');
    const next = body.replace(reads, (whole, chain: string) => {
        const members = [...chain.matchAll(/(\??\.)([A-Za-z_$][\w$]*)/g)];
        if (members.length === 0) { failed = true; return whole; } // the event passed on whole
        if (members[0][2] !== 'detail') return whole; // `e.target`, `e.key`: not the detail
        const field = members[1]?.[2];
        if (!field || !(field in detail)) { failed = true; return whole; } // `detail` on whole, or unmapped
        const rest = members.slice(2).map((m) => m[0]).join('');
        // Every `$event` of the mapping is the handler's event: `($event.currentTarget.indeterminate ? null
        // : $event.detail.value)` holds two. A function, so a `$` in the name is not a pattern.
        return detail[field].replace(/\$event(?![\w$])/g, () => event) + rest;
    });
    return failed ? null : head + next;
}

/** The rewritten attribute, or null when its handler must be rewritten by hand. */
function rewriteListener(l: Listener): string | null {
    const handler = rewriteHandler(l.value, l.alpha.detail);
    if (handler === null) return null;
    // The spaces around the handler stay as written. A function, so a `$` in the handler is not a pattern.
    const value = l.value.replace(l.value.trim(), () => handler);
    return `@${l.alpha.modelEvent}${l.modifiers}=${l.quote}${value}${l.quote}`;
}

/** An alpha event other than `change`, which a native event from inside still answers. */
const isAlphaEvent = (event: string, alpha: AlphaEvents): boolean => event !== 'change' && alpha.events.includes(event);

export const alphaChangeEvent: LanguageChange = {
    id: 'alpha-change-event',
    kind: 'removed',
    scope: 'pdx',
    issue: 478,
    message: 'the component no longer emits its alpha change event: listen to its model\'s event, whose detail is `{ value }`.',
    detect(text, context): LanguageChangeFinding[] {
        return listeners(text, context, isAlphaEvent).map((l) => ({
            line: lineAt(text, l.at),
            found: `@${l.event}${l.modifiers}`,
            note: `Here, write \`@${l.alpha.modelEvent}\`.`,
        }));
    },
    fix(text, context) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const l of listeners(text, context, isAlphaEvent).reverse()) {
            const next = rewriteListener(l);
            if (next !== null) out = out.slice(0, l.at) + next + out.slice(l.at + l.attribute.length);
        }
        return out;
    },
};

export const alphaChangeListener: LanguageChange = {
    id: 'alpha-change-listener',
    kind: 'changed',
    scope: 'pdx',
    issue: 478,
    message: '`@change` heard the component\'s alpha change event, which it no longer emits; a native `change` from an inner input still reaches it. '
        + 'Listen to the model\'s event if you meant the component\'s value.',
    detect(text, context): LanguageChangeFinding[] {
        return listeners(text, context, (event, alpha) => event === 'change' && alpha.events.includes('change')).map((l) => ({
            line: lineAt(text, l.at),
            found: `@change${l.modifiers}`,
            note: `Its model's event is \`@${l.alpha.modelEvent}\`.`,
        }));
    },
    fix: 'flag',
};
