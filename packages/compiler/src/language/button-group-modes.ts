// `pdx-button-group`'s selection modes are removed: selecting among buttons is `pdx-toggle-group`
// (#286, decision 51). The button group stays a visual group of action buttons, with no value.
//
// `pdx migrate` rewrites `<pdx-button-group mode="single|multiple">` whose children are plain buttons
// — a `<pdx-button>` or a native `<button>` holding text, with static attributes a toggle takes — to
// `<pdx-toggle-group type="…">` with `pdx-toggle` items. An item keeps its `value`, or takes its text as
// one: the button group identified a button without `value` by its text, the toggle group by `value`.
// The group's `variant` follows decision 53 (the toggle mode of pdx-button): outline and ghost are kept,
// any other is `solid`. `@pdx-change`, whose detail was the value itself, becomes `@value-change`, whose
// detail is `{ value }`: an inline handler's `detail` reads become `detail.value`. Everything else —
// another child, a binding on a child, a bound mode or variant, a handler that is a reference — is
// flagged and left as written. `mode="none"`, the action group, only loses the attribute.

import { escapeForRegExp } from '../compiler/regexp-escape';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** An opening tag: where it starts and ends, and what lies between its name and its `>`. */
interface OpenTag {
    start: number;
    /** Just past its `>`. */
    end: number;
    attrs: string;
}

// Match: the opening tag of a pdx-button-group, quoted values read whole — a handler holds `=>`, which
// text-scan's openTags would take for the tag's end. Groups: [1]=its attributes
const GROUP_TAG = /<pdx-button-group(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** Every opening `<pdx-button-group …>`, in order. */
function groupTags(text: string): OpenTag[] {
    return [...text.matchAll(GROUP_TAG)].map((m) => ({ start: m.index, end: m.index + m[0].length, attrs: m[1] }));
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** One attribute of a tag, as written. */
interface Attr {
    /** The name with its prefix: `value`, `:value`, `@pdx-change.stop`. */
    name: string;
    /** The value without its quotes, or null for a bare attribute. */
    value: string | null;
    /** The attribute as written, its leading whitespace included. */
    text: string;
}

// Match: one attribute, its leading whitespace kept. Groups: [1]=the name [2]=a double-quoted value
// [3]=a single-quoted value [4]=an unquoted value
const ATTR = /\s+([:@]{0,2}[A-Za-z_][\w.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;

/** The attributes of a tag's `attrs` text, in order. */
function parseAttrs(attrs: string): Attr[] {
    return [...attrs.matchAll(ATTR)].map((m) => ({ name: m[1], value: m[2] ?? m[3] ?? m[4] ?? null, text: m[0] }));
}

/** A handler that is a reference: `onChange`, `form.save`. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
// Match: an arrow with one plain parameter, or none. Groups: [1]=the parameter in parentheses [2]=the
// bare parameter [3]=the body
const ARROW = /^(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*(\S[\s\S]*)$/;

/**
 * The handler with each read of the event's `detail` — the value, in the button group — made a read of
 * `detail.value`, or null when a person must rewrite it: a reference, the event passed on whole, a
 * parameter list this does not read. The shape of alpha-events' rewrite (./alpha-events), for a detail
 * that was the value rather than an object of fields.
 */
function rewriteHandler(value: string): string | null {
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
    // Match: the event name standing alone, and the first member read off it. Groups: [1]=the member
    const reads = new RegExp(`(?<![\\w$.])${escapeForRegExp(event)}(?![\\w$])(\\??\\.[A-Za-z_$][\\w$]*)?`, 'g');
    const next = body.replace(reads, (whole, member: string | undefined) => {
        if (!member) { failed = true; return whole; } // the event passed on whole
        if (!/^\??\.detail$/.test(member)) return whole; // `e.target`: not the detail
        return `${whole}.value`;
    });
    return failed ? null : head + next;
}

/** The attributes a plain button may carry into a `pdx-toggle`; `type` is a native button's own. */
const ITEM_ATTRS = /^(?:value|disabled|aria-label|title|class|id|data-[\w-]+)$/;

// Match: one plain button, `<pdx-button …>text</pdx-button>` or `<button …>text</button>`, with the
// whitespace before it. Groups: [1]=leading whitespace [2]=the tag [3]=its attributes [4]=its text
const ITEM = /(\s*)<(pdx-button|button)((?:[^>"']|"[^"]*"|'[^']*')*)>([^<]*)<\/\2\s*>/gy;

/** Why a group is left for a person to rewrite: the note its finding carries. */
interface Why {
    why: string;
}

/** The children rewritten as `pdx-toggle` items, or why one of them is not a plain button. */
function rewriteItems(content: string): string | Why {
    ITEM.lastIndex = 0;
    let out = '';
    let at = 0;
    for (let m = ITEM.exec(content); m; m = ITEM.exec(content)) {
        const text = m[4];
        let written = '';
        let hasValue = false;
        for (const a of parseAttrs(m[3])) {
            if (a.name === 'type') continue;
            // A binding, a handler, a button's own prop.
            if (!ITEM_ATTRS.test(a.name)) return { why: `a button carries \`${a.name}\`, which a \`pdx-toggle\` does not take as written` };
            if (a.name === 'value') hasValue = true;
            written += a.text;
        }
        if (!hasValue) {
            const label = text.trim();
            if (!label || label.includes('"')) return { why: 'a button has no `value` and no plain text to take as one' };
            written += ` value="${label}"`;
        }
        out += `${m[1]}<pdx-toggle${written}>${text}</pdx-toggle>`;
        at = ITEM.lastIndex;
    }
    const rest = content.slice(at);
    return rest.trim() === '' ? out + rest : { why: 'a child is not a plain button holding text (an icon, another element)' };
}

/** A group with its body: the opening tag, where its content ends, and where its closing tag ends. */
interface Group {
    tag: OpenTag;
    attrs: Attr[];
    mode: Attr;
    /** Offset of `</pdx-button-group`, or -1 when the body is not one this reads. */
    close: number;
    /** Just past the closing tag's `>`. */
    end: number;
}

/** Every `<pdx-button-group>` with a `mode`, bound or static. */
function groups(text: string): Group[] {
    const lower = text.toLowerCase();
    const out: Group[] = [];
    for (const tag of groupTags(text)) {
        const attrs = parseAttrs(tag.attrs);
        const mode = attrs.find((a) => a.name === 'mode' || a.name === ':mode' || a.name === '::mode');
        if (!mode) continue;
        let close = lower.indexOf('</pdx-button-group', tag.end);
        const nested = lower.indexOf('<pdx-button-group', tag.end);
        if (tag.attrs.trim().endsWith('/') || (nested !== -1 && nested < close)) close = -1;
        const end = close === -1 ? -1 : text.indexOf('>', close) + 1;
        out.push({ tag, attrs, mode, close, end });
    }
    return out;
}

/** The group rewritten and the offset the rewrite runs to, or why a person must rewrite it. */
function rewriteGroup(text: string, g: Group): { text: string; until: number } | Why {
    if (g.mode.name !== 'mode') return { why: 'its mode is bound' };
    // The action group: only its opening tag changes.
    if (g.mode.value === 'none') return { text: '<pdx-button-group' + g.tag.attrs.replace(g.mode.text, '') + '>', until: g.tag.end };
    const group = rewriteSelection(text, g);
    return typeof group === 'string' ? { text: group, until: g.end } : group;
}

/** A selection group as a toggle group, or why a person must rewrite it. */
function rewriteSelection(text: string, g: Group): string | Why {
    if (g.mode.value !== 'single' && g.mode.value !== 'multiple') return { why: `\`mode="${g.mode.value}"\` is not single, multiple or none` };
    if (g.close === -1 || g.end === 0) return { why: 'the group is self-closing, or holds another button group' };
    const items = rewriteItems(text.slice(g.tag.end, g.close));
    if (typeof items !== 'string') return items;

    let attrs = '';
    const variant = g.attrs.find((a) => a.name === 'variant' || a.name === ':variant');
    if (variant && variant.name !== 'variant') return { why: 'its variant is bound: a toggle group takes outline, ghost or solid' };
    for (const a of g.attrs) {
        if (a === g.mode) {
            attrs += ` type="${g.mode.value}"` + (variant ? '' : ' variant="solid"');
        } else if (a === variant) {
            const kept = a.value === 'outline' || a.value === 'ghost' || a.value === 'solid';
            attrs += kept ? a.text : ' variant="solid"';
        } else if (/^@pdx-change(?:\.|$)/.test(a.name)) {
            const handler = a.value === null ? null : rewriteHandler(a.value);
            if (handler === null || a.value === null) {
                return { why: 'its `@pdx-change` handler is a reference or passes the event on: its detail was the value, `value-change`\'s is `{ value }`' };
            }
            const modifiers = a.name.slice('@pdx-change'.length);
            const quote = a.text.includes(`="`) ? '"' : '\'';
            attrs += ` @value-change${modifiers}=${quote}${a.value.replace(a.value.trim(), () => handler)}${quote}`;
        } else {
            attrs += a.text;
        }
    }
    // What follows the attributes in the tag, a trailing space before `>`, stays.
    const trailing = g.tag.attrs.slice(g.tag.attrs.trimEnd().length);
    return `<pdx-toggle-group${attrs}${trailing}>${items}</pdx-toggle-group>`;
}

export const buttonGroupModes: LanguageChange = {
    id: 'button-group-modes',
    kind: 'removed',
    scope: 'pdx',
    issue: 286,
    message: '`pdx-button-group` lost its selection modes: selecting among buttons is `<pdx-toggle-group type="single|multiple">` with `<pdx-toggle value="…">` items, '
        + 'whose `value-change` detail is `{ value }`. A single toggle group is the same radio group, but a click on the checked toggle clears the value, which mode="single" did not. '
        + 'Without a selection, drop `mode`: the button group is the action group.',
    marker: /<pdx-button-group/i,
    detect(text): LanguageChangeFinding[] {
        return groups(text).map((g) => {
            const next = rewriteGroup(text, g);
            const finding: LanguageChangeFinding = { line: lineAt(text, g.tag.start), found: g.mode.text.trim() };
            if ('why' in next) finding.note = `Not rewritten: ${next.why}.`;
            return finding;
        });
    },
    fix(text) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const g of groups(text).reverse()) {
            const next = rewriteGroup(text, g);
            if (!('why' in next)) out = out.slice(0, g.tag.start) + next.text + out.slice(next.until);
        }
        return out;
    },
};
