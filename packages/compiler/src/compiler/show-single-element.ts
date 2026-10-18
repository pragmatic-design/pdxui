// `@show (c) { <one element> }` built as the element it holds (#129).
//
// `show()` builds its body as a block of its own and hides each top-level node: right for several
// nodes or a text node, which cannot take a style. A body that is exactly one element needs none of
// it — its display bound where the element is built is the same effect, and costs what the removed
// `:show` attribute cost. This file only recognises that body; the inline generator binds it.

import type { HtmlNode, TemplateNode } from '../parser/template';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * A one-element body without the whitespace between the braces and the element: it belongs to the
 * block, not to the markup around it, and built in place it would be text beside the element —
 * `@show (c) { <b>x</b> }`, as `pdx migrate` writes it, builds what `<b :show="c">x</b>` built. The
 * first node's location and `@@` shifts move with what is cut from its start.
 */
export function withoutEdgeWhitespace(body: TemplateNode[]): TemplateNode[] {
    const out = [...body];
    const first = out[0] as HtmlNode;
    const cut = first.content.length - first.content.trimStart().length;
    if (cut > 0) {
        const lead = first.content.slice(0, cut);
        const newlines = lead.split('\n').length - 1;
        const loc = first.loc && {
            line: first.loc.line + newlines,
            column: newlines ? cut - lead.lastIndexOf('\n') - 1 : first.loc.column + cut,
            ...(first.loc.offset != null ? { offset: first.loc.offset + cut } : {}),
        };
        out[0] = {
            ...first,
            content: first.content.slice(cut),
            ...(loc ? { loc } : {}),
            ...(first.shifts ? { shifts: first.shifts.filter(s => s >= cut).map(s => s - cut) } : {}),
            // The slotted marks (#152) sit in tags, never in the leading whitespace cut here.
            ...(first.insertions ? { insertions: first.insertions.map(ins => ({ ...ins, at: ins.at - cut })) } : {}),
        };
    }
    const lastIndex = out.length - 1;
    const last = out[lastIndex] as HtmlNode;
    out[lastIndex] = { ...last, content: last.content.trimEnd() };
    return out;
}

/**
 * Whether a `@show` body is one element and nothing beside it but whitespace: it opens with the
 * element's tag, in markup the generator reads (not `@raw`), and the element closes where the body
 * ends. A directive or an interpolation inside the element is fine; beside it, it is not.
 */
export function isSingleElementBody(body: TemplateNode[]): boolean {
    const first = body[0];
    const last = body[body.length - 1];
    if (!first || first.type !== 'html' || first.raw || last.type !== 'html' || last.raw) return false;
    if (!/^\s*<[A-Za-z]/.test(first.content) || /^\s*<component[\s>/]/.test(first.content)) return false;
    // The body's markup with every other node as one character of text: where the element ends.
    const text = body.map(n => (n.type === 'html' ? n.content : 'x')).join('').trim();
    let depth = 0;
    let i = 0;
    while (i < text.length) {
        if (text.startsWith('<!--', i)) {
            const close = text.indexOf('-->', i + 4);
            if (close === -1) return false;
            i = close + 3;
            if (depth === 0 && i < text.length) return false;
            continue;
        }
        if (text[i] !== '<') {
            if (depth === 0) return false;
            i++;
            continue;
        }
        // Match: `<name` or `</name`. Groups: [1]=`/` of a closing tag [2]=name
        const head = /^<(\/?)([A-Za-z][\w-]*)/.exec(text.slice(i, i + 64));
        if (!head) { if (depth === 0) return false; i++; continue; }
        let quote = '';
        let j = i + head[0].length;
        for (; j < text.length; j++) {
            const c = text[j];
            if (quote) { if (c === quote) quote = ''; continue; }
            if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
        }
        if (j >= text.length) return false;
        const selfClosing = text[j - 1] === '/' || VOID.has(head[2].toLowerCase());
        if (head[1]) depth--;
        else if (!selfClosing) depth++;
        i = j + 1;
        // The element closed: the body must end here.
        if (depth === 0) return i === text.length;
        if (depth < 0) return false;
    }
    return false;
}
