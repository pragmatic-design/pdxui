// ── Block Join (backspace at block start) ─────────────────────────
// Classic behaviour: Backspace at the very start of a block whose previous
// sibling is a CONTAINER (list, blockquote) merges the block's inline content
// into the LAST textblock inside that container, and puts the cursor there —
// instead of a flat token delete that strands the cursor outside the list.

import type { DocNode, Pos } from '../model/types.js';
import { createNode, nodeSize, contentSize, isText, isInlineNode } from '../model/node.js';

const TEXTBLOCK = new Set(['paragraph', 'heading', 'codeBlock']);
const CONTAINER = new Set(['bulletList', 'orderedList', 'taskList', 'blockquote']);

/** Append `inline` to the deepest last textblock of `node`, immutably.
 *  Returns the rebuilt node and the cursor offset (relative to node's open tag)
 *  pointing at the join seam (end of the original textblock content). */
function mergeAppend(node: DocNode, inline: readonly DocNode[]): { node: DocNode; cursorOffset: number } {
  if (TEXTBLOCK.has(node.type)) {
    const origLen = contentSize(node);
    const merged = [...node.content, ...inline];
    return { node: createNode(node.type, node.attrs, merged, node.marks), cursorOffset: 1 + origLen };
  }
  // Container: recurse into its last child.
  const last = node.content[node.content.length - 1];
  const { node: newLast, cursorOffset: inner } = mergeAppend(last, inline);
  const newContent = [...node.content.slice(0, -1), newLast];
  let before = 0;
  for (let k = 0; k < node.content.length - 1; k++) before += nodeSize(node.content[k]);
  return { node: createNode(node.type, node.attrs, newContent, node.marks), cursorOffset: 1 + before + inner };
}

/** Backspace at the start of a textblock that directly follows a list/blockquote:
 *  merge it into that container's last textblock. Returns the new doc + cursor, or
 *  null when the cursor is not at such a seam. */
export function joinBlockAfterContainer(doc: DocNode, pos: Pos): { doc: DocNode; selPos: Pos } | null {
  let offset = 0;
  for (let i = 0; i < doc.content.length; i++) {
    const block = doc.content[i];
    const size = nodeSize(block);

    // Cursor exactly at the start of this textblock's content?
    if (pos === offset + 1 && TEXTBLOCK.has(block.type)) {
      if (i === 0) return null;
      const prev = doc.content[i - 1];
      if (!CONTAINER.has(prev.type)) return null;

      // Only merge plain inline content (textblock cursor block).
      const inline = block.content.filter(c => isText(c) || isInlineNode(c));
      const { node: newPrev, cursorOffset } = mergeAppend(prev, inline);

      const newChildren = [...doc.content.slice(0, i - 1), newPrev, ...doc.content.slice(i + 1)];
      const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);

      let base = 0;
      for (let k = 0; k < i - 1; k++) base += nodeSize(doc.content[k]);
      return { doc: newDoc, selPos: base + cursorOffset };
    }

    offset += size;
  }
  return null;
}
