// ── Transform Steps ───────────────────────────────────────────────
// Atomic, invertible operations on the document tree.
// Positions are content-relative within the doc (= absolute).

import type { Attrs, DocNode, Mark, Pos, StepResult } from '../model/types.js';
import { createNode, createText, nodeSize, isText, mergeAdjacentText, replaceRange } from '../model/node.js';
import { markAdd, markRemoveExact } from '../model/mark.js';
import { Mapping } from './mapping.js';

// ── Step Interface ────────────────────────────────────────────────

export interface Step {
  apply(doc: DocNode): StepResult;
  invert(doc: DocNode): Step;
  map(mapping: Mapping): Step | null;
  getMapping(): Mapping;
  toJSON(): StepJSON;
}

export interface StepJSON {
  type: string;
  [key: string]: unknown;
}

// ── Replace Step ──────────────────────────────────────────────────

/** Replace content between `from` and `to` with `content` */
export class ReplaceStep implements Step {
  constructor(
    readonly from: Pos,
    readonly to: Pos,
    readonly content: readonly DocNode[],
  ) {}

  apply(doc: DocNode): StepResult {
    try {
      const newDoc = replaceRange(doc, this.from, this.to, this.content);
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(doc: DocNode): Step {
    const oldContent = extractFromDoc(doc, this.from, this.to);
    const newSize = this.content.reduce((s, n) => s + nodeSize(n), 0);
    return new ReplaceStep(this.from, this.from + newSize, oldContent);
  }

  map(mapping: Mapping): Step | null {
    const from = mapping.map(this.from, 1);
    const to = mapping.map(this.to, -1);
    if (from > to) return null;
    return new ReplaceStep(from, to, this.content);
  }

  getMapping(): Mapping {
    const m = new Mapping();
    const insertSize = this.content.reduce((s, n) => s + nodeSize(n), 0);
    m.addRange(this.from, this.to, insertSize);
    return m;
  }

  toJSON(): StepJSON {
    return { type: 'replace', from: this.from, to: this.to, content: this.content };
  }
}

// ── Add Mark Step ─────────────────────────────────────────────────

export class AddMarkStep implements Step {
  constructor(
    readonly from: Pos,
    readonly to: Pos,
    readonly mark: Mark,
  ) {}

  apply(doc: DocNode): StepResult {
    try {
      const newDoc = mapTextInRange(doc, this.from, this.to, (node) => {
        return createText(node.text!, markAdd(node.marks, this.mark));
      });
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(_doc: DocNode): Step {
    return new RemoveMarkStep(this.from, this.to, this.mark);
  }

  map(mapping: Mapping): Step | null {
    const from = mapping.map(this.from, 1);
    const to = mapping.map(this.to, -1);
    if (from >= to) return null;
    return new AddMarkStep(from, to, this.mark);
  }

  getMapping(): Mapping {
    return new Mapping();
  }

  toJSON(): StepJSON {
    return { type: 'addMark', from: this.from, to: this.to, mark: this.mark };
  }
}

// ── Remove Mark Step ──────────────────────────────────────────────

export class RemoveMarkStep implements Step {
  constructor(
    readonly from: Pos,
    readonly to: Pos,
    readonly mark: Mark,
  ) {}

  apply(doc: DocNode): StepResult {
    try {
      const newDoc = mapTextInRange(doc, this.from, this.to, (node) => {
        return createText(node.text!, markRemoveExact(node.marks, this.mark));
      });
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(_doc: DocNode): Step {
    return new AddMarkStep(this.from, this.to, this.mark);
  }

  map(mapping: Mapping): Step | null {
    const from = mapping.map(this.from, 1);
    const to = mapping.map(this.to, -1);
    if (from >= to) return null;
    return new RemoveMarkStep(from, to, this.mark);
  }

  getMapping(): Mapping {
    return new Mapping();
  }

  toJSON(): StepJSON {
    return { type: 'removeMark', from: this.from, to: this.to, mark: this.mark };
  }
}

// ── Set Node Attrs Step ───────────────────────────────────────────

export class SetNodeAttrsStep implements Step {
  constructor(
    readonly pos: Pos,
    readonly attrs: Attrs,
  ) {}

  apply(doc: DocNode): StepResult {
    try {
      const newDoc = setAttrsAtPos(doc, this.pos, this.attrs);
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(doc: DocNode): Step {
    const node = nodeAtPos(doc, this.pos);
    if (!node) return new SetNodeAttrsStep(this.pos, {});
    return new SetNodeAttrsStep(this.pos, node.attrs);
  }

  map(mapping: Mapping): Step | null {
    return new SetNodeAttrsStep(mapping.map(this.pos, 1), this.attrs);
  }

  getMapping(): Mapping {
    return new Mapping();
  }

  toJSON(): StepJSON {
    return { type: 'setNodeAttrs', pos: this.pos, attrs: this.attrs };
  }
}

// ── Internal Helpers ──────────────────────────────────────────────

/** Extract content from doc between positions (for undo) */
function extractFromDoc(doc: DocNode, from: Pos, to: Pos): DocNode[] {
  if (from >= to) return [];
  const result: DocNode[] = [];
  let offset = 0;

  for (const child of doc.content) {
    const size = nodeSize(child);
    const childEnd = offset + size;

    if (childEnd > from && offset < to) {
      if (isText(child)) {
        const relFrom = Math.max(0, from - offset);
        const relTo = Math.min(child.text!.length, to - offset);
        if (relFrom < relTo) {
          result.push(createText(child.text!.slice(relFrom, relTo), child.marks));
        }
      } else if (offset >= from && childEnd <= to) {
        result.push(child);
      }
    }
    offset = childEnd;
  }
  return result;
}

/** Map text nodes overlapping a range, applying a transform function.
 *  Positions are content-relative in the doc.
 *  Text nodes that partially overlap are SPLIT into before/marked/after parts. */
function mapTextInRange(
  doc: DocNode, from: Pos, to: Pos,
  fn: (textNode: DocNode) => DocNode,
): DocNode {
  return mapTextInner(doc, from, to, fn, 0);
}

function mapTextInner(
  node: DocNode, from: Pos, to: Pos,
  fn: (textNode: DocNode) => DocNode,
  contentStart: Pos, // absolute position where this node's content begins
): DocNode {
  if (isText(node)) return node;

  let childPos = contentStart; // absolute position of current child
  let changed = false;
  const children: DocNode[] = [];

  for (const child of node.content) {
    const size = nodeSize(child);
    const childEnd = childPos + size;

    if (childEnd <= from || childPos >= to) {
      children.push(child);
    } else if (isText(child)) {
      // Text child overlaps range — split if needed
      const text = child.text!;
      const overlapStart = Math.max(0, from - childPos);
      const overlapEnd = Math.min(text.length, to - childPos);

      if (overlapStart === 0 && overlapEnd === text.length) {
        children.push(fn(child));
      } else {
        if (overlapStart > 0) {
          children.push(createText(text.slice(0, overlapStart), child.marks));
        }
        children.push(fn(createText(text.slice(overlapStart, overlapEnd), child.marks)));
        if (overlapEnd < text.length) {
          children.push(createText(text.slice(overlapEnd), child.marks));
        }
      }
      changed = true;
    } else {
      // Element child: content starts at childPos + 1 (skip open tag)
      const newChild = mapTextInner(child, from, to, fn, childPos + 1);
      children.push(newChild);
      if (newChild !== child) changed = true;
    }

    childPos = childEnd;
  }

  if (!changed) return node;
  return createNode(node.type, node.attrs, mergeAdjacentText(children), node.marks);
}

/** Find node at a content-relative position in the doc */
function nodeAtPos(doc: DocNode, pos: Pos): DocNode | null {
  let offset = 0;
  for (const child of doc.content) {
    const size = nodeSize(child);
    if (offset === pos && !isText(child)) return child;
    if (offset + size > pos && !isText(child)) {
      // Recurse
      return nodeAtPos(child, pos - offset - 1);
    }
    offset += size;
  }
  return null;
}

/** Set attributes on node at content-relative position */
function setAttrsAtPos(doc: DocNode, pos: Pos, attrs: Attrs): DocNode {
  let offset = 0;
  const children: DocNode[] = [];
  let changed = false;

  for (const child of doc.content) {
    const size = nodeSize(child);
    if (offset === pos && !isText(child)) {
      children.push(createNode(child.type, { ...child.attrs, ...attrs }, child.content, child.marks));
      changed = true;
    } else if (pos > offset && pos < offset + size && !isText(child)) {
      const newChild = setAttrsAtPos(child, pos - offset - 1, attrs);
      children.push(newChild);
      if (newChild !== child) changed = true;
    } else {
      children.push(child);
    }
    offset += size;
  }

  if (!changed) return doc;
  return createNode(doc.type, doc.attrs, children, doc.marks);
}
