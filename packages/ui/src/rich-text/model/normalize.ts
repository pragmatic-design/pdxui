// ── Document Normalization ────────────────────────────────────────
// Schema-invariant safety net applied after every transaction.
//
// Editing transforms (split/join/delete/insert) can momentarily produce a tree
// that violates the schema — most commonly TEXT or inline nodes sitting directly
// inside a block CONTAINER (doc, blockquote, listItem) that should only hold
// block nodes. An invalid tree corrupts position math and rendering, which is
// what makes the editor "collapse" after a backspace across nested blocks.
//
// normalizeDoc walks the tree and re-establishes the invariant:
//   - a block container that holds stray inline/text runs → each run is wrapped
//     in a `paragraph`;
//   - the doc never ends up empty → it keeps one empty paragraph.
// Valid trees pass through structurally unchanged.

import type { DocNode } from './types.js';
import type { Schema } from './schema.js';
import { createNode, createText, isText, isInlineNode } from './node.js';

/** A node type "holds inline" when its content expression accepts inline/text
 *  (paragraph, heading, codeBlock). Everything else (doc, blockquote, list,
 *  listItem) is a block container. */
function holdsInline(type: string, schema: Schema): boolean {
  const content = schema.nodes.get(type)?.spec.content ?? '';
  return /\b(inline|text)\b/.test(content);
}

function normalizeNode(node: DocNode, schema: Schema): DocNode {
  if (isText(node)) return node;

  // Empty nodes pass through, except the doc itself which must always keep one
  // editable paragraph (an empty doc breaks the cursor and rendering).
  if (node.content.length === 0) {
    if (node.type === 'doc') {
      return createNode('doc', node.attrs, [createNode('paragraph', {}, [createText('')])], node.marks);
    }
    return node;
  }

  // Normalize children depth-first. STRUCTURAL SHARING: when no child has
  // changed, the ORIGINAL node is returned — not a reallocated tree, which would
  // leave updateChildren no identical nodes to find and make the diff
  // O(the document) per keystroke.
  const normalized = node.content.map(c => normalizeNode(c, schema));
  const childrenUnchanged = normalized.every((c, i) => c === node.content[i]);

  // Textblocks (paragraph/heading/codeBlock) keep their inline content as-is.
  if (holdsInline(node.type, schema)) {
    return childrenUnchanged ? node : createNode(node.type, node.attrs, normalized, node.marks);
  }

  // Block container: wrap consecutive inline/text runs into paragraphs.
  const out: DocNode[] = [];
  let run: DocNode[] = [];
  const flush = () => {
    if (run.length > 0) { out.push(createNode('paragraph', {}, run)); run = []; }
  };
  for (const child of normalized) {
    if (isText(child) || isInlineNode(child)) run.push(child);
    else { flush(); out.push(child); }
  }
  flush();

  // The doc must never be empty — keep a single editable paragraph.
  if (node.type === 'doc' && out.length === 0) {
    out.push(createNode('paragraph', {}, [createText('')]));
  }

  // No re-wrap happened and the children are unchanged → the original node is already valid
  if (childrenUnchanged && out.length === normalized.length && out.every((c, i) => c === normalized[i])) {
    return node;
  }

  return createNode(node.type, node.attrs, out, node.marks);
}

/** Re-establish schema invariants on a document tree. Idempotent: a valid
 *  document is returned with the same structure. */
export function normalizeDoc(doc: DocNode, schema: Schema): DocNode {
  return normalizeNode(doc, schema);
}
