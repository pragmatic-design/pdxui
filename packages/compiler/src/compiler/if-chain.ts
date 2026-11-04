// An `@if` / `@else if` / `@else` chain, read as one choice among its branches (#685).
//
// The parser writes `@else if` as an else body that is one IfNode, so a chain is a run of IfNodes each
// in the previous one's else. The inline generator compiles such a run to core's whenChain, one
// effect for the whole chain, where it compiled a when() per link (codegen-template-inline.ts, ifN).
// A chain with a transition on any link is left to the nested when() calls, which run transitions.

import type { IfNode, TemplateNode } from '../parser/template';

/** One `@if` or `@else if` of a chain: its condition and its body. */
export interface IfChainLink { condition: string; body: TemplateNode[] }

/** A chain of two or more conditions, and the final `@else` if it has one. */
export interface IfChain { links: IfChainLink[]; elseBody?: TemplateNode[] }

/** The chain that starts at `node`, or null for an `@if` with no `@else if`, or one with a transition. */
export function ifChain(node: IfNode): IfChain | null {
    const links: IfChainLink[] = [];
    let at: IfNode = node;
    for (;;) {
        if (at.transition) return null;
        links.push({ condition: at.condition, body: at.body });
        const next = at.elseBody?.length === 1 && at.elseBody[0].type === 'if' ? at.elseBody[0] : null;
        if (!next) break;
        at = next;
    }
    return links.length > 1 ? { links, elseBody: at.elseBody } : null;
}
