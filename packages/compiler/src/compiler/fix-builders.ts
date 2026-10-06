// The fixes for the common mistakes, each built from where the finding is and what the file says
// there. A builder returns nothing when the right text is not determined — a value that
// mixes text with `${}`, a name used where a rename could break something — and the finding keeps
// its hint alone.

import { parseSFC } from '../parser/sfc';
import { skipNonCode } from './tokenizer';
import type { ValidationWarning, FixProposal, FixEdit } from './validate';

/** The file offset of a 1-based line and column, or undefined past the end. */
export function offsetOf(source: string, line: number, column: number): number | undefined {
    let offset = 0;
    for (let l = 1; l < line; l++) {
        const nl = source.indexOf('\n', offset);
        if (nl < 0) return undefined;
        offset = nl + 1;
    }
    return offset + column - 1;
}

/** The offset the finding points at, or undefined when it has no position. */
const at = (source: string, w: ValidationWarning): number | undefined =>
    w.line === undefined || w.column === undefined ? undefined : offsetOf(source, w.line, w.column);

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The `}` closing the `${` at `open`, counting nested braces, or -1. */
function closingBrace(source: string, open: number): number {
    let depth = 0;
    for (let i = open + 2; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            if (depth === 0) return i;
            depth--;
        } else if (source[i] === '\n' || source[i] === '<') return -1;
    }
    return -1;
}

/**
 * PDX_RAW_INTERPOLATION. An attribute whose whole value is `${x}` → `:attr="x"`; `${x}` in text →
 * `{{ x }}`. A value that mixes text and `${}` has more than one right answer, and gets no fix.
 */
export function rawInterpolationFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const open = at(source, w);
    if (open === undefined || source.slice(open, open + 2) !== '${') return undefined;
    const close = closingBrace(source, open);
    if (close < 0) return undefined;
    const expr = source.slice(open + 2, close).trim();
    if (!expr) return undefined;
    // Match: ` name="` right before the `${` — a plain attribute whose value starts with it.
    // Groups: [1]=the name [2]=the quote.
    const attr = /\s([A-Za-z_][\w.-]*)=(["'])$/.exec(source.slice(Math.max(0, open - 200), open));
    if (attr) {
        if (source[close + 1] !== attr[2]) return undefined;
        const start = open - attr[0].length + 1;
        return {
            title: `Bind ${attr[1]} with :${attr[1]}="${expr}"`,
            edits: [{ start, end: close + 2, newText: `:${attr[1]}=${attr[2]}${expr}${attr[2]}` }],
        };
    }
    // Text, not the inside of a tag: the last `>` before it comes after the last `<`.
    if (source.lastIndexOf('>', open) < source.lastIndexOf('<', open)) return undefined;
    return { title: `Write it as {{ ${expr} }}`, edits: [{ start: open, end: close + 1, newText: `{{ ${expr} }}` }] };
}

/** PDX_RAW_INTERPOLATION_IN_BINDING. A bound value that is exactly `${x}` → `x`. */
export function interpolationInBindingFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const open = at(source, w);
    if (open === undefined || source.slice(open, open + 2) !== '${') return undefined;
    const close = closingBrace(source, open);
    if (close < 0) return undefined;
    // Match: ` :name="` / `@name="` right before the `${`. Groups: [1]=the name [2]=the quote.
    const attr = /\s((?:::|:|@)[\w.:-]+)\s*=\s*(["'])$/.exec(source.slice(Math.max(0, open - 200), open));
    if (!attr || source[close + 1] !== attr[2]) return undefined;
    return {
        title: `Drop the \${ } in ${attr[1]}`,
        edits: [{ start: open, end: open + 2, newText: '' }, { start: close, end: close + 1, newText: '' }],
    };
}

/** PDX_UNKNOWN_PROP, PDX_PROP_NAME_CASE: the bound name → the declared prop the finding names. */
export function boundNameFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const name = /has no prop "([^"]+)"/.exec(w.message)?.[1];
    const colon = at(source, w);
    if (!name || !w.suggestion || colon === undefined) return undefined;
    const start = colon + (source.startsWith('::', colon) ? 2 : 1);
    if (source.slice(start, start + name.length) !== name) return undefined;
    return {
        title: `Rename :${name} to :${w.suggestion}`,
        edits: [{ start, end: start + name.length, newText: w.suggestion }],
    };
}

/**
 * PDX_UNDECLARED_REF: the misspelt read → the one declared name near it, at the place
 * the finding points to. Another read of the same name is found and fixed on `--fix`'s next round.
 */
export function undeclaredRefFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const name = /^'([\w$]+)'/.exec(w.message)?.[1];
    const start = at(source, w);
    if (!name || !w.suggestion || start === undefined || source.slice(start, start + name.length) !== name) return undefined;
    return { title: `Rename ${name} to ${w.suggestion}`, edits: [{ start, end: start + name.length, newText: w.suggestion }] };
}

/** PDX_UNRESOLVED_COMPONENT: every `<tag` and `</tag` in the template → the one known tag near it. */
export function tagRenameFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const tag = /^<([\w-]+)>/.exec(w.message)?.[1];
    const template = parseSFC(source).template;
    if (!tag || !w.suggestion || !template || template.src) return undefined;
    const text = source.slice(template.start, template.end);
    // Match: `<tag` or `</tag`, not a longer tag that starts with it. Groups: [1]=`<` or `</`.
    const re = new RegExp(`(</?)${escape(tag)}(?![\\w-])`, 'g');
    const edits: FixEdit[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const start = template.start + m.index + m[1].length;
        edits.push({ start, end: start + tag.length, newText: w.suggestion });
    }
    return edits.length ? { title: `Rename <${tag}> to <${w.suggestion}>`, edits } : undefined;
}

/**
 * PDX_EVENT_NAME_CASE: the event's name → lowercase, in its declaration and every call of its
 * emitter in the script. The name is also a JS identifier; if the template uses it, the rename is
 * not offered — a template expression is not rewritten blind.
 */
export function eventNameFix(source: string, w: ValidationWarning): FixProposal | undefined {
    const name = /@event '([\w$]+)'/.exec(w.message)?.[1];
    const sfc = parseSFC(source);
    if (!name || !w.suggestion || !sfc.script || sfc.script.src) return undefined;
    const word = new RegExp(`(?<![\\w$.])${escape(name)}(?![\\w$])`);
    if (sfc.template && word.test(source.slice(sfc.template.start, sfc.template.end))) return undefined;
    const text = source.slice(sfc.script.start, sfc.script.end);
    const edits: FixEdit[] = [];
    for (let i = 0; i < text.length; ) {
        const skipped = skipNonCode(text, i);
        if (skipped !== null) { i = skipped; continue; }
        if (text.startsWith(name, i) && !/[\w$.]/.test(text[i - 1] ?? '') && !/[\w$]/.test(text[i + name.length] ?? '')) {
            const start = sfc.script.start + i;
            edits.push({ start, end: start + name.length, newText: w.suggestion });
            i += name.length;
            continue;
        }
        i++;
    }
    return edits.length ? { title: `Rename the event ${name} to ${w.suggestion}`, edits } : undefined;
}
