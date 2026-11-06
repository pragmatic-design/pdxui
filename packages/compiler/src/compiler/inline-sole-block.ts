// A block that is one control-flow node alone (#685).
//
// Every block — an `@if` branch, a `@for` row — clones its own static markup and binds into it. A
// block whose only content is another control-flow node, `@else if` and a row that is one `@if` chain
// above all, cloned a markup of one marker (and the whitespace around it), walked to it, and replaced
// it with the node: per row, a clone, a walk and a `replaceWith` that place nothing of their own. The
// pilot's filter popover spent most of its mount there (packages/ui/PILOT.md, #685). Such a block now
// returns the node itself. The whitespace around it is the block's edge, which keeps none (#907).

import type { TemplateNode } from '../parser/template';
import { isSingleElementBody } from './show-single-element';

/** The control-flow nodes whose generator puts exactly one node where they stand (`place`). */
const PLACED = new Set<TemplateNode['type']>(['if', 'for', 'switch', 'require', 'portal', 'defer', 'try', 'await', 'render']);

/** An `html` node of whitespace alone. */
const blank = (n: TemplateNode | undefined): boolean => n?.type === 'html' && !n.raw && /^\s*$/.test(n.content);

/**
 * The one control-flow node `nodes` hold, whitespace around it aside; null when the block holds
 * anything else. A one-element `@show` binds the element in place rather than placing a node, so it
 * is not one.
 */
export function soleControlFlow(nodes: readonly TemplateNode[]): { node: TemplateNode } | null {
    let from = 0, to = nodes.length;
    if (blank(nodes[from])) from++;
    if (to > from && blank(nodes[to - 1])) to--;
    if (to - from !== 1) return null;
    const node = nodes[from];
    if (PLACED.has(node.type)) return { node };
    if (node.type === 'show' && !isSingleElementBody(node.body)) return { node };
    return null;
}
