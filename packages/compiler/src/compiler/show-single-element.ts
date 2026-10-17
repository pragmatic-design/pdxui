// `@show (c) { <one element> }` built as the element it holds (#129).
//
// `show()` builds its body as a block of its own and hides each top-level node: right for several
// nodes or a text node, which cannot take a style. A body that is exactly one element needs none of
// it — its display bound where the element is built is the same effect, and costs what the removed
// `:show` attribute cost. This file only recognises that body; the inline generator binds it.

import type { TemplateNode } from '../parser/template';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

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
