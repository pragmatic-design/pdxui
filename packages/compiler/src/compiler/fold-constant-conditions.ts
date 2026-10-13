// Constant condition elimination, on the template's AST (#236).
//
// In a production build `@if (true) { … }` is its body, `@if (false) { … } @else { … }` its else
// branch, `@if (false)` alone nothing, and `@show (true)` / `@show (false)` the body or nothing: no
// `when()`, no `show()`, no effect to evaluate a literal. The template path did this while generating
// (`generateIf`, `generateShow`); done on the AST, before either generator runs, it holds for every
// render path. A block's body is a list of nodes like the list it sits in — markup is flat text
// nodes, directives are its siblings — so a folded block is its body, spliced in place.

import type { TemplateNode } from '../parser/template';

/** `nodes` with every `@if` / `@show` whose condition is the literal `true` or `false` folded. */
export function foldConstantConditions(nodes: TemplateNode[]): TemplateNode[] {
    const out: TemplateNode[] = [];
    for (const node of nodes) {
        if (node.type === 'if' || node.type === 'show') {
            const cond = node.condition.trim();
            if (cond === 'true') { out.push(...foldConstantConditions(node.body)); continue; }
            if (cond === 'false') {
                if (node.type === 'if' && node.elseBody) out.push(...foldConstantConditions(node.elseBody));
                continue;
            }
        }
        out.push(foldChildren(node));
    }
    return out;
}

/** The node with every child list folded: a body, an else branch, a `@switch` case, `@defer`'s states. */
function foldChildren<T extends TemplateNode>(node: T): T {
    const copy: Record<string, unknown> = { ...node };
    for (const [key, value] of Object.entries(node)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        if (isNodeList(value)) copy[key] = foldConstantConditions(value);
        // `@switch`'s cases: `{ value, body }` each.
        else if (value.every(c => typeof c === 'object' && c !== null && Array.isArray((c as { body?: unknown }).body))) {
            copy[key] = value.map(c => ({ ...c, body: foldConstantConditions((c as { body: TemplateNode[] }).body) }));
        }
    }
    return copy as T;
}

function isNodeList(value: unknown[]): value is TemplateNode[] {
    return value.every(v => typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string');
}
