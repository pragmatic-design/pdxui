// ── Immutable Node Tree ───────────────────────────────────────────
// DocNode operations: create, walk, slice, replace.
// Positions are offsets in a flattened token stream:
//   - Element open tag = 1 token
//   - Element close tag = 1 token
//   - Each character in text = 1 token
//
// Position semantics (ProseMirror-compatible):
//   For doc { paragraph { "Hello" } }:
//     pos 0: start of doc content (before paragraph)
//     pos 1: start of paragraph content (before 'H')
//     pos 6: end of paragraph content (after 'o')
//     pos 7: end of doc content (after paragraph)

import type { Attrs, DocNode, Mark, Pos, ResolvedPos, PosPathEntry, Slice } from './types.js';
import { EMPTY_MARKS, marksEq } from './mark.js';

const EMPTY_CONTENT: readonly DocNode[] = Object.freeze([]);
const EMPTY_ATTRS: Attrs = Object.freeze({});

// ── Creation ──────────────────────────────────────────────────────

/** Create an element node */
export function createNode(type: string, attrs?: Attrs, content?: readonly DocNode[], marks?: readonly Mark[]): DocNode {
  return {
    type,
    attrs: attrs ?? EMPTY_ATTRS,
    content: content && content.length > 0 ? content : EMPTY_CONTENT,
    marks: marks && marks.length > 0 ? marks : EMPTY_MARKS,
  };
}

/** Create a text node */
export function createText(text: string, marks?: readonly Mark[]): DocNode {
  return {
    type: 'text',
    attrs: EMPTY_ATTRS,
    content: EMPTY_CONTENT,
    marks: marks && marks.length > 0 ? marks : EMPTY_MARKS,
    text,
  };
}

// ── Predicates ────────────────────────────────────────────────────

export function isText(node: DocNode): boolean {
  return node.type === 'text';
}

export function isBlock(node: DocNode): boolean {
  return !isText(node) && !isInlineNode(node);
}

export function isInlineNode(node: DocNode): boolean {
  return node.type === 'hardBreak';
}

// ── Size Computation ──────────────────────────────────────────────

/** Size of a node in the offset space.
 *  Text: text.length
 *  Leaf element (no content): 1
 *  Element with content: 2 (open+close) + sum of children sizes */
export function nodeSize(node: DocNode): number {
  if (isText(node)) return node.text!.length;
  if (node.content.length === 0) return 1;
  let size = 2;
  for (const child of node.content) size += nodeSize(child);
  return size;
}

/** Content size (size of children without open/close tags) */
export function contentSize(node: DocNode): number {
  let size = 0;
  for (const child of node.content) size += nodeSize(child);
  return size;
}

// ── Position Resolution ───────────────────────────────────────────

/** Resolve an absolute position to its context in the tree.
 *  `pos` ranges from 0 to contentSize(doc). */
export function resolvePos(doc: DocNode, pos: Pos): ResolvedPos {
  const cs = contentSize(doc);
  if (pos < 0 || pos > cs) {
    throw new RangeError(`Position ${pos} out of range [0, ${cs}]`);
  }
  const path: PosPathEntry[] = [];
  return resolveInner(doc, pos, path);
}

/**
 * Resolve a content-relative position within a node.
 * `pos` is relative to the start of `node`'s content (after its open tag).
 * For the root doc node, this equals the absolute position.
 */
function resolveInner(node: DocNode, pos: Pos, path: PosPathEntry[]): ResolvedPos {
  let offset = 0; // cumulative child offset within this node's content

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    const size = nodeSize(child);

    // Check if pos falls within this child's range [offset, offset+size)
    if (pos < offset + size) {
      if (isText(child)) {
        // Position is within this text node
        return {
          pos,
          depth: path.length,
          parent: node,
          parentOffset: pos,
          index: i,
          textOffset: pos - offset,
          path,
        };
      }
      // Position is within this element child.
      // pos === offset means "at the child's open tag" — resolve as inside child at content pos 0.
      // pos > offset means "inside the child's content" at content pos (pos - offset - 1).
      const childContentPos = pos - offset - 1;
      if (childContentPos < 0) {
        // pos === offset: before this child's content (at its open tag boundary).
        // Resolve as inside this child at content position 0.
        path.push({ node, index: i, offset });
        return resolveInner(child, 0, path);
      }
      path.push({ node, index: i, offset });
      return resolveInner(child, childContentPos, path);
    }
    offset += size;
  }

  // Position is at or past all children — end of content
  return {
    pos,
    depth: path.length,
    parent: node,
    parentOffset: pos,
    index: node.content.length,
    textOffset: 0,
    path,
  };
}

// ── Absolute Position Helpers ─────────────────────────────────────

/** Convert a content-relative position in the doc to an absolute position.
 *  For the root doc, content positions ARE absolute positions. */
export function absolutePos(_doc: DocNode, contentPos: Pos): Pos {
  return contentPos; // doc content starts at offset 0 (no parent open tag)
}

/** Get the content-relative start position of a child at index `childIndex`
 *  within `parent`. Returns the position just inside the child (after open tag). */
export function childContentStart(parent: DocNode, childIndex: number): Pos {
  let offset = 0;
  for (let i = 0; i < childIndex; i++) {
    offset += nodeSize(parent.content[i]);
  }
  // offset is the child's start in parent content.
  // +1 for the child's open tag → first content position inside child
  return offset + 1;
}

// ── Child Access ──────────────────────────────────────────────────

export function childAt(node: DocNode, index: number): DocNode | null {
  return node.content[index] ?? null;
}

export function childAtOffset(node: DocNode, offset: number): [DocNode, number, number] | null {
  let pos = 0;
  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    const size = nodeSize(child);
    if (pos + size > offset) {
      return [child, offset - pos, i];
    }
    pos += size;
  }
  return null;
}

// ── Tree Walking ──────────────────────────────────────────────────

/** Walk all nodes depth-first. Callback receives (node, pos, parent, index).
 *  `pos` is the content-relative position within the root: the root's content starts at
 *  `startPos`, so for a doc these are the positions resolvePos and every command use. */
export function walkNode(
  node: DocNode,
  callback: (node: DocNode, pos: Pos, parent: DocNode | null, index: number) => boolean | void,
  startPos: Pos = 0,
): void {
  if (callback(node, startPos, null, 0) === false || isText(node)) return;
  // The root has no open tag in its own positions: its first child opens at startPos. Starting it
  // at startPos + 1 would put every position one high.
  let childPos = startPos;
  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    if (!walkInner(child, callback, childPos, node, i)) return;
    childPos += nodeSize(child);
  }
}

function walkInner(
  node: DocNode,
  callback: (node: DocNode, pos: Pos, parent: DocNode | null, index: number) => boolean | void,
  pos: Pos,
  parent: DocNode | null,
  index: number,
): boolean {
  if (callback(node, pos, parent, index) === false) return false;
  if (isText(node) || node.content.length === 0) return true;

  let childPos = pos + 1; // skip open tag
  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    if (!walkInner(child, callback, childPos, node, i)) return false;
    childPos += nodeSize(child);
  }
  return true;
}

/** Walk all text nodes */
export function walkText(
  node: DocNode,
  callback: (text: string, pos: Pos, marks: readonly Mark[]) => void,
  startPos: Pos = 0,
): void {
  walkNode(node, (n, p) => {
    if (isText(n)) callback(n.text!, p, n.marks);
  }, startPos);
}

/** Up to `length` characters of the text node that holds model position `pos`. */
export function textAt(doc: DocNode, pos: Pos, length: number): string {
  let result = '';
  walkText(doc, (text, at) => {
    if (at <= pos && at + text.length > pos) result = text.slice(pos - at, pos - at + length);
  });
  return result;
}

// ── Replacement ───────────────────────────────────────────────────

/**
 * Replace content between `from` and `to` (content-relative positions in the doc)
 * with `insertNodes`.
 *
 * For the root doc, content-relative === absolute.
 *
 * Algorithm: recursively find the deepest node containing [from, to], then
 * splice the children at that level.
 */
export function replaceRange(doc: DocNode, from: Pos, to: Pos, insertNodes: readonly DocNode[]): DocNode {
  if (from === to && insertNodes.length === 0) return doc;
  return replaceInNode(doc, from, to, insertNodes);
}

/** Replace within a node's content. `from` and `to` are content-relative. */
function replaceInNode(node: DocNode, from: Pos, to: Pos, insert: readonly DocNode[]): DocNode {
  // Find which children are affected
  let offset = 0;
  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    const size = nodeSize(child);
    const childEnd = offset + size;

    // Check if the entire [from, to] range falls within this single child
    // For insertions (from===to) at the RIGHT boundary of a text node,
    // prefer the NEXT child to avoid extending marks (e.g. bold "Hel|" → type → stays plain)
    if (from >= offset && to <= childEnd) {
      if (isText(child) && from === to && from === childEnd && i + 1 < node.content.length) {
        // At right boundary of text: skip to next child
        offset = childEnd;
        continue;
      }
      if (isText(child)) {
        // Splice within text
        const relFrom = from - offset;
        const relTo = to - offset;
        const text = child.text!;
        const insertText = insert.length === 1 && isText(insert[0]) ? insert[0].text! : '';

        if (insert.length <= 1 || (insert.length === 1 && isText(insert[0]))) {
          const newText = text.slice(0, relFrom) + insertText + text.slice(relTo);
          const newChild = createText(newText, child.marks);
          const newContent = [...node.content];
          newContent[i] = newChild;
          return createNode(node.type, node.attrs, mergeAdjacentText(newContent), node.marks);
        }
        // Complex: non-text insert into text → split text and insert
        const before = text.slice(0, relFrom);
        const after = text.slice(relTo);
        const newContent = [...node.content];
        const spliced: DocNode[] = [];
        if (before) spliced.push(createText(before, child.marks));
        spliced.push(...insert);
        if (after) spliced.push(createText(after, child.marks));
        newContent.splice(i, 1, ...spliced);
        return createNode(node.type, node.attrs, mergeAdjacentText(newContent), node.marks);
      }

      if (!isText(child) && from > offset && to < childEnd) {
        // Range is strictly INSIDE this element child (not at boundaries)
        // Convert to child-content-relative positions and recurse
        const childContentFrom = from - offset - 1;
        const childContentTo = to - offset - 1;
        const newChild = replaceInNode(child, childContentFrom, childContentTo, insert);
        if (newChild === child) return node;
        const newContent = [...node.content];
        newContent[i] = newChild;
        return createNode(node.type, node.attrs, newContent, node.marks);
      }

      // from === offset: at the child's open tag boundary
      // to === childEnd: at the child's close tag boundary
      // Handle at the current level (see below)
      break;
    }

    // Check if range starts inside this child (partial overlap start)
    if (from >= offset && from < childEnd && to > childEnd) {
      break; // handle at current level
    }

    offset += childEnd - offset; // = childEnd; just offset = childEnd
  }

  // Handle replacement at current level: splice affected children
  return spliceChildren(node, from, to, insert);
}

/** Splice children of a node, handling the replacement at the children level. */
function spliceChildren(node: DocNode, from: Pos, to: Pos, insert: readonly DocNode[]): DocNode {
  const children: DocNode[] = [];
  let offset = 0;
  let inserted = false;

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    const size = nodeSize(child);
    const childEnd = offset + size;

    if (childEnd <= from) {
      // Entirely before range — keep
      children.push(child);
    } else if (offset >= to) {
      // Entirely after range — keep
      children.push(child);
    } else {
      // Overlapping with [from, to]
      if (!inserted) {
        // Partial content before `from` in this child
        if (isText(child) && from > offset) {
          const keep = child.text!.slice(0, from - offset);
          if (keep) children.push(createText(keep, child.marks));
        }

        // Insert replacement content
        children.push(...insert);
        inserted = true;
      }

      // Partial content after `to` in this child (only for the last overlapping child)
      if (isText(child) && to > offset && to < childEnd) {
        const keep = child.text!.slice(to - offset);
        if (keep) children.push(createText(keep, child.marks));
      }
    }

    offset = childEnd;
  }

  // If no child overlapped (insertion at end of content)
  if (!inserted) {
    children.push(...insert);
  }

  return createNode(node.type, node.attrs, mergeAdjacentText(children), node.marks);
}

/** Merge adjacent text nodes that have the same marks */
export function mergeAdjacentText(nodes: DocNode[]): DocNode[] {
  const result: DocNode[] = [];
  for (const node of nodes) {
    const last = result.length > 0 ? result[result.length - 1] : null;
    if (last && isText(last) && isText(node) && marksEq(last.marks, node.marks)) {
      result[result.length - 1] = createText(last.text! + node.text!, last.marks);
    } else if (isText(node) && node.text!.length === 0) {
      continue;
    } else {
      result.push(node);
    }
  }
  return result;
}

// ── Slicing ───────────────────────────────────────────────────────

/** Extract a slice between two positions (content-relative in doc) */
export function sliceBetween(node: DocNode, from: Pos, to: Pos): Slice {
  if (from === to) return { content: EMPTY_CONTENT, openStart: 0, openEnd: 0 };
  const content = extractContent(node, from, to);
  return { content, openStart: 0, openEnd: 0 };
}

/** Extract content nodes between two content-relative positions */
function extractContent(node: DocNode, from: Pos, to: Pos): DocNode[] {
  const result: DocNode[] = [];
  let offset = 0;

  for (const child of node.content) {
    const size = nodeSize(child);
    const childEnd = offset + size;

    if (childEnd <= from || offset >= to) {
      offset = childEnd;
      continue;
    }

    if (isText(child)) {
      const relFrom = Math.max(0, from - offset);
      const relTo = Math.min(child.text!.length, to - offset);
      if (relFrom < relTo) {
        result.push(createText(child.text!.slice(relFrom, relTo), child.marks));
      }
    } else if (offset >= from && childEnd <= to) {
      // Entirely contained
      result.push(child);
    } else {
      // Partially contained — recurse into element child
      const childContentFrom = Math.max(0, from - offset - 1);
      const childContentTo = Math.min(contentSize(child), to - offset - 1);
      if (childContentFrom < childContentTo) {
        const inner = extractContent(child, childContentFrom, childContentTo);
        result.push(...inner);
      }
    }

    offset = childEnd;
  }

  return result;
}

// ── Node Updates ──────────────────────────────────────────────────

export function setNodeAttrs(node: DocNode, attrs: Attrs): DocNode {
  return createNode(node.type, { ...node.attrs, ...attrs }, node.content, node.marks);
}

export function setNodeContent(node: DocNode, content: readonly DocNode[]): DocNode {
  return createNode(node.type, node.attrs, content, node.marks);
}

export function setNodeMarks(node: DocNode, marks: readonly Mark[]): DocNode {
  if (isText(node)) return createText(node.text!, marks);
  return createNode(node.type, node.attrs, node.content, marks);
}

// ── Text Content ──────────────────────────────────────────────────

export function textContent(node: DocNode): string {
  if (isText(node)) return node.text!;
  let result = '';
  for (const child of node.content) {
    result += textContent(child);
  }
  return result;
}

export function textLength(node: DocNode): number {
  if (isText(node)) return node.text!.length;
  let len = 0;
  for (const child of node.content) len += textLength(child);
  return len;
}

// ── Comparison ────────────────────────────────────────────────────

export function nodeEq(a: DocNode, b: DocNode): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  if (a.text !== b.text) return false;
  if (!marksEq(a.marks, b.marks)) return false;
  const aKeys = Object.keys(a.attrs);
  const bKeys = Object.keys(b.attrs);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a.attrs[k] !== b.attrs[k]) return false;
  }
  if (a.content.length !== b.content.length) return false;
  for (let i = 0; i < a.content.length; i++) {
    if (!nodeEq(a.content[i], b.content[i])) return false;
  }
  return true;
}
