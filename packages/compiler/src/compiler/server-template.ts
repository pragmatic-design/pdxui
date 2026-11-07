// A block's markup as an html`` literal, for the module compiled for the server (#160).
//
// On the server the render does not build DOM: it returns html``, and core renders that to a string
// with the same rules as a hand-written template (`core/src/server/render-string.ts`). The markup is
// the block's static tree, the one the client's builder makes, so the two agree node for node: the
// same elements, attributes and text, the whitespace trimmed by the same rule. Where the client has
// an anchor the render replaces — an interpolation, a block a helper renders — the literal has a
// hole, `${expr}`; where the client's render binds an element, its tag has the binding, `:name=${expr}`.

import { escapeAttr, escapeText, PARSER_VOID, type MarkupNode } from './static-markup-html';

/** A node of the static tree, with what the server writes for its holes and bindings. */
export interface ServerMarkupNode extends MarkupNode {
    kids: ServerMarkupNode[];
    /** A hole's expression. */
    expr?: string;
    /** An element's bindings, `[name, expression]`. */
    bound?: Array<[string, string]>;
}

// Match: what a template literal reads as other than itself — a backslash, a backtick, `${`.
const UNLITERAL = /\\|`|\$\{/g;

/** Static markup as template-literal text: read back as written, and a `</script` defused. */
function literalText(s: string): string {
    return s.replace(UNLITERAL, (m) => `\\${m}`).replace(/<\/(script)/gi, '<\\/$1');
}

/** `root` as the html`` that renders it: `html\`…\``. */
export function serverTemplate(root: ServerMarkupNode): string {
    return `html\`${write(root)}\``;
}

function write(n: ServerMarkupNode): string {
    switch (n.kind) {
        case 'text': return literalText(escapeText(n.data!));
        case 'comment': return literalText(`<!--${n.data}-->`);
        // An anchor the client's render replaced with nothing it bound: an empty text, no markup.
        case 'anchor': return '';
        case 'hole': return `\${${n.expr}}`;
        case 'sink': return '';
        case 'element': {
            const statics = (n.attrs ?? []).map(([name, value]) => literalText(value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)).join('');
            const bound = (n.bound ?? []).map(([name, expr]) => ` ${name}=\${${expr}}`).join('');
            const open = `<${n.tag}${statics}${bound}>`;
            if (!n.svg && PARSER_VOID.has(n.tag!.toLowerCase())) return open;
            return `${open}${n.kids.map(write).join('')}</${n.tag}>`;
        }
        default: return n.kids.map(write).join('');
    }
}
