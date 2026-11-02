// `pdx-button` loses its toggle mode: the on/off button is `pdx-toggle` (#291, the owner's decision of
// 2026-10-11, decision 53 for the variants).
//
// `pdx migrate` rewrites `<pdx-button toggle>` to `<pdx-toggle>`. `toggle` is dropped; `pressed` —
// static, `:pressed` or `::pressed` — `disabled`, `size` and `aria-label` are kept as written, since
// pdx-toggle declares the same names. `variant` primary and solid are `solid`, outline and ghost are
// kept, and a button with none takes `variant="solid"`: the button's default was primary, filled, and
// the toggle's is outline. `label="…"` becomes the text after the children, where the button rendered
// it. An `@pdx-toggle` handler becomes a `@pressed-change` handler, the model event of pdx-toggle, its
// `detail.pressed` read as `detail.value`. A button that also has what pdx-toggle has no counterpart
// for — `loading`, `type`, `full`, `aria-labelledby`, `action`, `action-arg`, a variant among secondary,
// link, danger, success, warning and info, a bound variant, label or toggle, a handler that is a
// reference — is flagged and left: dropping it would change what the button does. A `pressed` on a
// button without `toggle` never had an effect: it is removed.

import { escapeForRegExp } from '../compiler/regexp-escape';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** One attribute of a tag, as written. */
interface Attr {
    /** The name with its prefix: `pressed`, `:pressed`, `@pdx-toggle.stop`. */
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

/** An attribute's name without its binding prefix and modifiers: `::pressed` → `pressed`. */
function bare(name: string): string {
    return name.replace(/^[:@]+/, '').split('.')[0];
}

// Match: the opening tag of a pdx-button, quoted values read whole — a handler holds `=>`. Groups:
// [1]=its attributes
const BUTTON_TAG = /<pdx-button(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** A `<pdx-button>` that names `toggle` or `pressed`, with where its element ends. */
interface Button {
    start: number;
    /** Just past the opening tag's `>`. */
    open: number;
    attrs: Attr[];
    /** The opening tag's attribute text, as written. */
    attrText: string;
    /** Offset of `</pdx-button`, or -1 for a self-closing tag. */
    close: number;
    /** Just past the closing tag's `>`, or the opening tag's end when self-closing. */
    end: number;
    toggle: Attr | undefined;
    pressed: Attr[];
}

/** Every `<pdx-button>` that names `toggle` or `pressed`, in order. */
function buttons(text: string): Button[] {
    const lower = text.toLowerCase();
    const out: Button[] = [];
    for (const m of text.matchAll(BUTTON_TAG)) {
        const attrs = parseAttrs(m[1]);
        const toggle = attrs.find((a) => bare(a.name) === 'toggle' && !a.name.startsWith('@'));
        const pressed = attrs.filter((a) => bare(a.name) === 'pressed' && !a.name.startsWith('@'));
        if (!toggle && pressed.length === 0) continue;
        const open = m.index + m[0].length;
        const selfClosing = m[1].trimEnd().endsWith('/');
        const close = selfClosing ? -1 : lower.indexOf('</pdx-button', open);
        const end = close === -1 ? open : text.indexOf('>', close) + 1;
        out.push({ start: m.index, open, attrs, attrText: m[1], close, end, toggle, pressed });
    }
    return out;
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** The variants pdx-toggle draws: the button's primary and solid are its solid. */
const VARIANT_OF: Record<string, string> = { primary: 'solid', solid: 'solid', outline: 'outline', ghost: 'ghost' };

/** The button's props pdx-toggle has no counterpart for: dropped, they would change what it does. */
const NO_COUNTERPART = new Set(['loading', 'type', 'full', 'aria-labelledby', 'action', 'action-arg', 'actionArg']);

/** A handler that is a reference: `onToggle`, `form.save`. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
// Match: an arrow with one plain parameter, or none. Groups: [1]=the parameter in parentheses [2]=the
// bare parameter [3]=the body
const ARROW = /^(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*(\S[\s\S]*)$/;

/**
 * The `@pdx-toggle` handler with each `detail.pressed` read as `detail.value`, or null when a person
 * must rewrite it: a reference, the event or its detail passed on whole, a parameter list this does
 * not read.
 */
function rewriteHandler(value: string): string | null {
    const handler = value.trim();
    if (REFERENCE.test(handler)) return null;
    let event = '$event';
    let head = '';
    let body = handler;
    if (/^(?:async\s+)?(?:\(|[A-Za-z_$][\w$]*\s*=>)/.test(handler) && handler.includes('=>')) {
        const arrow = ARROW.exec(handler);
        if (!arrow) return null;
        const name = arrow[1] ?? arrow[2];
        if (!name) return handler; // `() => …` reads no event
        event = name;
        body = arrow[3];
        head = handler.slice(0, handler.length - body.length);
    }
    let failed = false;
    // Match: the event name standing alone, with what is read off it. Groups: [1]=`?.detail?.pressed`,
    // or any other first member
    const reads = new RegExp(`(?<![\\w$.])${escapeForRegExp(event)}(?![\\w$])(\\??\\.detail\\??\\.pressed(?![\\w$])|\\??\\.[A-Za-z_$][\\w$]*)?`, 'g');
    const next = body.replace(reads, (whole, member: string | undefined) => {
        if (!member) { failed = true; return whole; } // the event passed on whole
        if (/\.pressed$/.test(member)) return whole.slice(0, -'pressed'.length) + 'value';
        if (/^\??\.detail$/.test(member)) failed = true; // the detail passed on whole
        return whole; // `e.target`: not the detail
    });
    return failed ? null : head + next;
}

/** Why a button is left for a person to rewrite. */
interface Why {
    why: string;
}

/** The `<pdx-button toggle>` element as a `<pdx-toggle>`, or why a person must rewrite it. */
function rewriteToggle(text: string, b: Button): string | Why {
    if (b.toggle!.name !== 'toggle') return { why: 'its `toggle` is bound' };
    if (b.close === -1) return { why: 'it is self-closing' };
    const variant = b.attrs.find((a) => bare(a.name) === 'variant');
    if (variant && variant.name !== 'variant') return { why: 'its variant is bound: a toggle takes outline, ghost or solid' };
    if (variant && !VARIANT_OF[variant.value ?? '']) return { why: `\`variant="${variant.value}"\` has no pdx-toggle counterpart` };

    let attrs = '';
    let label = '';
    for (const a of b.attrs) {
        const name = bare(a.name);
        if (a === b.toggle) {
            if (!variant) attrs += ' variant="solid"';
        } else if (a === variant) {
            attrs += ` variant="${VARIANT_OF[a.value!]}"`;
        } else if (NO_COUNTERPART.has(name) && !a.name.startsWith('@')) {
            return { why: `\`${name}\` has no pdx-toggle counterpart` };
        } else if (name === 'label' && !a.name.startsWith('@')) {
            if (a.name !== 'label' || a.value === null) return { why: 'its `label` is bound' };
            label = a.value;
        } else if (a.name.startsWith('@') && name === 'pdx-toggle') {
            const handler = a.value === null ? null : rewriteHandler(a.value);
            if (handler === null || a.value === null) {
                return { why: 'its `@pdx-toggle` handler is a reference or passes the event on: its detail was `{ pressed }`, `pressed-change`\'s is `{ value }`' };
            }
            const modifiers = a.name.slice('@pdx-toggle'.length);
            const quote = a.text.includes('="') ? '"' : '\'';
            attrs += ` @pressed-change${modifiers}=${quote}${a.value.replace(a.value.trim(), () => handler)}${quote}`;
        } else {
            attrs += a.text;
        }
    }
    const trailing = b.attrText.slice(b.attrText.trimEnd().length);
    return `<pdx-toggle${attrs}${trailing}>${text.slice(b.open, b.close)}${label}</pdx-toggle>`;
}

/** The button without its `pressed`, which did nothing without `toggle`. */
function dropPressed(text: string, b: Button): string {
    let tag = text.slice(b.start, b.open);
    for (const p of b.pressed) tag = tag.replace(p.text, '');
    return tag;
}

export const buttonToggleRemoved: LanguageChange = {
    id: 'button-toggle-removed',
    kind: 'removed',
    scope: 'pdx',
    issue: 291,
    message: '`pdx-button` has no toggle mode: an on/off button is `<pdx-toggle>`, whose model `pressed` announces `pressed-change` `{ value }`. '
        + 'A `pressed` on a `pdx-button` without `toggle` never had an effect: remove it.',
    marker: /<pdx-button(?=[\s/>])/i,
    detect(text): LanguageChangeFinding[] {
        return buttons(text).map((b) => {
            const finding: LanguageChangeFinding = { line: lineAt(text, b.start), found: (b.toggle ?? b.pressed[0]).text.trim() };
            if (b.toggle) {
                const next = rewriteToggle(text, b);
                if (typeof next !== 'string') finding.note = `Not rewritten: ${next.why}.`;
            }
            return finding;
        });
    },
    fix(text) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const b of buttons(text).reverse()) {
            if (!b.toggle) {
                out = out.slice(0, b.start) + dropPressed(text, b) + out.slice(b.open);
                continue;
            }
            const next = rewriteToggle(text, b);
            if (typeof next === 'string') out = out.slice(0, b.start) + next + out.slice(b.end);
        }
        return out;
    },
};
