// What is written between `<component :is>` and `</component>` (#358).
//
// `dynamic()` takes no children, so that content has nowhere to go. One scanner says where it is,
// for the two places that need it: the template path — the legacy mode's — drops it from the nodes
// it generates (the inline path discards it on its own, in a sink of its static tree), and
// validation reports it once, read off the template's text, as PDX_DYNAMIC_CONTENT.

import type { HtmlNode, TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { findTagEnd } from './codegen-template-rewrite';

// Match: an opening `<component` or a closing `</component>` tag. Groups: [1]=the slash of a close
const COMPONENT_TAG = /<(\/?)component(?=[\s/>])/gi;

/** Whether an opening `<component …>` tag is a dynamic component that encloses content. */
function opensDynamic(tag: string): boolean {
    return /\s:is=/.test(tag) && !/\/\s*>$/.test(tag);
}

/**
 * Scan `text` from `from` for the end of what a dynamic component opened earlier encloses: the
 * index past its `</component>`, counting the `<component>` tags nested inside, or -1 when the text
 * ends first. `depth` is how many closes are still owed, and is updated for a caller that scans on.
 */
function closeOf(text: string, from: number, state: { depth: number }): number {
    COMPONENT_TAG.lastIndex = from;
    let m: RegExpExecArray | null;
    while ((m = COMPONENT_TAG.exec(text)) !== null) {
        const end = findTagEnd(text, m.index);
        if (m[1]) {
            if (--state.depth === 0) return end + 1;
        } else if (!/\/\s*>$/.test(text.slice(m.index, end + 1))) {
            state.depth++;
        }
        COMPONENT_TAG.lastIndex = end + 1;
    }
    return -1;
}

/** The node's text from `from` on, with its place in the template kept. */
function tailOf(node: HtmlNode, from: number): HtmlNode | null {
    const content = node.content.slice(from);
    if (!content) return null;
    const shifts = node.shifts ?? [];
    const before = shifts.filter((s) => s <= from).length;
    const tail: HtmlNode = { ...node, content };
    if (node.loc?.offset != null) {
        const skipped = node.content.slice(0, from);
        const lines = skipped.split('\n');
        tail.loc = {
            offset: node.loc.offset + from + before,
            line: node.loc.line + lines.length - 1,
            column: lines.length > 1 ? lines[lines.length - 1].length : node.loc.column + from,
        };
    }
    const kept = shifts.filter((s) => s > from).map((s) => s - from);
    if (kept.length) tail.shifts = kept; else delete tail.shifts;
    return tail;
}

/**
 * The nodes without what any dynamic component encloses: each `<component :is …>` keeps its opening
 * tag, and its content and closing tag are gone — whatever nodes they span. Only the template path
 * uses it: the inline path keeps the closing tag to close the sink it opened.
 */
export function dropDynamicContent(nodes: TemplateNode[]): TemplateNode[] {
    const out: TemplateNode[] = [];
    const state = { depth: 0 };
    for (const node of nodes) {
        if (node.type !== 'html' || node.raw) {
            if (state.depth === 0) out.push(node);
            continue;
        }
        let rest: HtmlNode | null = node;
        while (rest) {
            if (state.depth > 0) {
                const end = closeOf(rest.content, 0, state);
                if (end === -1) break;
                rest = tailOf(rest, end);
                continue;
            }
            const open = firstDynamicOpen(rest.content);
            if (open === -1) { out.push(rest); break; }
            out.push({ ...rest, content: rest.content.slice(0, open) });
            state.depth = 1;
            rest = tailOf(rest, open);
        }
    }
    return out.filter((n) => n.type !== 'html' || n.content !== '');
}

/** Index just past the first `<component :is …>` tag of `text` that encloses content, or -1. */
function firstDynamicOpen(text: string): number {
    COMPONENT_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COMPONENT_TAG.exec(text)) !== null) {
        const end = findTagEnd(text, m.index);
        if (!m[1] && opensDynamic(text.slice(m.index, end + 1))) return end + 1;
        COMPONENT_TAG.lastIndex = end + 1;
    }
    return -1;
}

/**
 * PDX_DYNAMIC_CONTENT — content between `<component :is>` and `</component>`, which no render path
 * renders. Read off the template's text, so content made of `{{ … }}` or a block directive counts;
 * whitespace alone does not. `start` is where the template begins in `source`, for the line.
 */
export function validateDynamicContent(template: string, start: number, source: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    COMPONENT_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COMPONENT_TAG.exec(template)) !== null) {
        const tagEnd = findTagEnd(template, m.index);
        const tag = template.slice(m.index, tagEnd + 1);
        if (m[1] || !opensDynamic(tag)) { COMPONENT_TAG.lastIndex = tagEnd + 1; continue; }
        const state = { depth: 1 };
        const after = closeOf(template, tagEnd + 1, state);
        const close = after === -1 ? template.length : template.lastIndexOf('<', after - 1);
        if (template.slice(tagEnd + 1, close).trim() !== '') {
            const quoted = tag.replace(/\s+/g, ' ');
            const lines = source.slice(0, start + m.index).split('\n');
            warnings.push({
                code: 'PDX_DYNAMIC_CONTENT',
                severity: 'warn',
                message: `Content inside '${quoted}' is not rendered — the component it becomes takes no children.`,
                hint: 'Move the content beside the tag, or pass it to the component as a prop.',
                line: lines.length,
                column: lines[lines.length - 1].length + 1,
            });
        }
        COMPONENT_TAG.lastIndex = after === -1 ? template.length : after;
    }
    return warnings;
}
