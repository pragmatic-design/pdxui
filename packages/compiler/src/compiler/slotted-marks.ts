// The elements of a template that sit inside a child component's tag, marked for the donut scope (#152).
//
// Under `target: 'baseline-2026'` a `<style scoped>` block stops at nested components
// (./scope-donut): what a child renders is out of the parent's reach. What the parent writes INSIDE
// the child's tag is the parent's content — the child projects it into a slot, into its own DOM — and
// stays in the parent's scope. Every such element gets `data-pdx-<hash>-in`, which the donut takes as
// a root of the parent's scope. Marked here, in the template, it travels with the static markup: a row
// a `@for` adds inside the child's tag later carries it too, which a mark set at projection time
// would miss. The owner is the template that wrote it, by construction.
//
// The mark is text the source does not have: each html node records where it went (`insertions`),
// so the origins of what follows it still point at the source (./codegen-origins).

import type { HtmlNode, TemplateNode } from '../parser/template';
import { VOID_ELEMENTS } from './codegen-template-inline';

/**
 * An html node with `attr` written into each opening tag that has a component among its open
 * ancestors. `opened` is the stack of open elements across the template — whether each is, or is
 * under, a component — and is updated as the markup opens and closes tags.
 */
function markHtml(node: HtmlNode, attr: string, opened: boolean[]): HtmlNode {
    if (node.raw) return node;
    const content = node.content;
    const insert = ` ${attr}`;
    let out = '';
    let i = 0;
    const from: number[] = []; // where, in the original content, each mark went
    while (i < content.length) {
        const lt = content.indexOf('<', i);
        if (lt === -1) break;
        let j = lt + 1;
        const closing = content[j] === '/';
        if (closing) j++;
        const nameStart = j;
        while (j < content.length && /[\w-]/.test(content[j])) j++;
        if (j === nameStart) { out += content.slice(i, lt + 1); i = lt + 1; continue; }
        // The end of the tag, quoted values skipped.
        let quote = '';
        let k = j;
        for (; k < content.length; k++) {
            const c = content[k];
            if (quote) { if (c === quote) quote = ''; continue; }
            if (c === '"' || c === "'") { quote = c; continue; }
            if (c === '>') break;
        }
        if (k >= content.length) break;
        const name = content.slice(nameStart, j).toLowerCase();
        if (closing) {
            opened.pop();
            out += content.slice(i, k + 1);
        } else {
            const under = opened.length > 0 && opened[opened.length - 1];
            const selfClosing = content[k - 1] === '/';
            const at = selfClosing ? k - 1 : k;
            out += content.slice(i, at);
            if (under) { from.push(at); out += insert; }
            out += content.slice(at, k + 1);
            if (!VOID_ELEMENTS.has(name) && !selfClosing) opened.push(name.includes('-') || under);
        }
        i = k + 1;
    }
    if (from.length === 0) return node;
    out += content.slice(i);
    // In the marked content: each mark's index, and the `@@` shifts moved past the marks before them.
    const insertions = from.map((f, n) => ({ at: f + n * insert.length, length: insert.length }));
    const before = (s: number) => from.filter((f) => f <= s).length * insert.length;
    return {
        ...node,
        content: out,
        insertions: [...(node.insertions ?? []), ...insertions],
        ...(node.shifts ? { shifts: node.shifts.map((s) => s + before(s)) } : {}),
    };
}

/** The template with its slotted elements marked `attr` (`data-pdx-<hash>-in`). */
export function markSlotted(nodes: TemplateNode[], attr: string): TemplateNode[] {
    const opened: boolean[] = [];
    /** A body walked from the stack as it was at its block, which it leaves so: a branch closes what it opens. */
    const body = (list: TemplateNode[]): TemplateNode[] => {
        const at = opened.slice();
        const marked = walk(list);
        opened.splice(0, opened.length, ...at);
        return marked;
    };
    const optional = (list: TemplateNode[] | undefined) => (list ? body(list) : undefined);
    const walk = (list: TemplateNode[]): TemplateNode[] => list.map((node): TemplateNode => {
        switch (node.type) {
            case 'html': return markHtml(node, attr, opened);
            case 'if': case 'require': return { ...node, body: body(node.body), elseBody: optional(node.elseBody) };
            case 'for': return { ...node, body: body(node.body), emptyBody: optional(node.emptyBody) };
            case 'switch': return { ...node, cases: node.cases.map((c) => ({ ...c, body: body(c.body) })), defaultBody: optional(node.defaultBody) };
            case 'defer': return { ...node, body: body(node.body), placeholder: optional(node.placeholder), loading: optional(node.loading), error: optional(node.error) };
            case 'try': return { ...node, body: body(node.body), catchBody: body(node.catchBody) };
            case 'await': return { ...node, body: body(node.body), loading: optional(node.loading), errorBody: optional(node.errorBody) };
            case 'show': case 'portal': case 'slot-template': case 'scoped-slot': case 'snippet': case 'custom-directive':
                return { ...node, body: body(node.body) };
            case 'render': return { ...node, fallback: optional(node.fallback) };
            default: return node;
        }
    });
    return walk(nodes);
}
