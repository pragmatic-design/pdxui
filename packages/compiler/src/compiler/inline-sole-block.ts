// A block that is one control-flow node alone (#685).
//
// Every block — an `@if` branch, a `@for` row — clones its own static markup and binds into it. A
// block whose only content is another control-flow node, `@else if` and a row that is one `@if` chain
// above all, cloned a markup of one marker (and the whitespace around it), walked to it, and replaced
// it with the node: per row, a clone, a walk and a `replaceWith` that place nothing of their own. The
// pilot's filter popover spent most of its mount there (packages/ui/PILOT.md, #685). Such a block now
// returns the node itself, with the whitespace it had kept as text.

import type { TemplateNode } from '../parser/template';
import { isSingleElementBody } from './show-single-element';

/** The control-flow nodes whose generator puts exactly one node where they stand (`place`). */
const PLACED = new Set<TemplateNode['type']>(['if', 'for', 'switch', 'require', 'portal', 'defer', 'try', 'await', 'render']);

/** An `html` node of whitespace alone: text a block keeps as one space. */
const blank = (n: TemplateNode | undefined): boolean => n?.type === 'html' && !n.raw && /^\s*$/.test(n.content);

/**
 * The one control-flow node `nodes` hold, and whether whitespace stands before (`lead`) and after
 * (`trail`) it; null when the block holds anything else. A one-element `@show` binds the element in
 * place rather than placing a node, so it is not one.
 */
export function soleControlFlow(nodes: readonly TemplateNode[]): { node: TemplateNode; edges: ('lead' | 'trail')[] } | null {
    let from = 0, to = nodes.length;
    const edges: ('lead' | 'trail')[] = [];
    if (blank(nodes[from])) { if ((nodes[from] as { content: string }).content) edges.push('lead'); from++; }
    if (to > from && blank(nodes[to - 1])) { if ((nodes[to - 1] as { content: string }).content) edges.push('trail'); to--; }
    if (to - from !== 1) return null;
    const node = nodes[from];
    if (PLACED.has(node.type)) return { node, edges };
    if (node.type === 'show' && !isSingleElementBody(node.body)) return { node, edges };
    return null;
}
