// ── Transform (Fluent API) ────────────────────────────────────────
// A Transform accumulates steps and their mappings, producing a new document.
// Usage: new Transform(doc).insert(pos, text).addMark(from, to, mark).doc

import type { Attrs, DocNode, Mark, Pos } from '../model/types.js';
import { createNode, createText, nodeSize, isText, mergeAdjacentText } from '../model/node.js';
import { createMark } from '../model/mark.js';
import { Mapping } from './mapping.js';
import { Step, ReplaceStep, AddMarkStep, RemoveMarkStep, SetNodeAttrsStep } from './step.js';

export class Transform {
  doc: DocNode;
  readonly steps: Step[] = [];
  readonly mapping: Mapping = new Mapping();

  constructor(doc: DocNode) {
    this.doc = doc;
  }

  /** Apply a step, updating doc and mapping */
  step(s: Step): this {
    const result = s.apply(this.doc);
    if (result.failed) throw new Error(`Step failed: ${result.failed}`);
    this.steps.push(s);
    const stepMapping = s.getMapping();
    if (!stepMapping.empty) {
      // Merge step mapping into our accumulated mapping
      for (const r of (stepMapping as any).ranges ?? []) {
        this.mapping.addRange(r.from, r.to, r.size);
      }
    }
    this.doc = result.doc!;
    return this;
  }

  // ── Text Operations ───────────────────────────────────────────

  /** Insert text at position */
  insertText(text: string, pos: Pos): this {
    return this.step(new ReplaceStep(pos, pos, [createText(text)]));
  }

  /** Delete range */
  delete(from: Pos, to: Pos): this {
    if (from === to) return this;
    return this.step(new ReplaceStep(from, to, []));
  }

  /** Replace range with content */
  replaceWith(from: Pos, to: Pos, content: DocNode | readonly DocNode[]): this {
    const nodes = Array.isArray(content) ? content : [content];
    return this.step(new ReplaceStep(from, to, nodes));
  }

  /** Insert node(s) at position */
  insert(pos: Pos, content: DocNode | readonly DocNode[]): this {
    const nodes = Array.isArray(content) ? content : [content];
    return this.step(new ReplaceStep(pos, pos, nodes));
  }

  // ── Mark Operations ───────────────────────────────────────────

  /** Add a mark to range */
  addMark(from: Pos, to: Pos, mark: Mark): this {
    return this.step(new AddMarkStep(from, to, mark));
  }

  /** Remove a mark from range */
  removeMark(from: Pos, to: Pos, mark: Mark): this {
    return this.step(new RemoveMarkStep(from, to, mark));
  }

  /** Toggle a mark: remove if all text in range has it, add otherwise */
  toggleMark(from: Pos, to: Pos, markType: string, attrs?: Attrs): this {
    const mark = createMark(markType, attrs);
    if (rangeHasMark(this.doc, from, to, markType)) {
      return this.removeMark(from, to, mark);
    }
    return this.addMark(from, to, mark);
  }

  /** Remove all marks of a type from range */
  removeMarkType(from: Pos, to: Pos, markType: string): this {
    return this.removeMark(from, to, createMark(markType));
  }

  // ── Block Operations ──────────────────────────────────────────

  /** Set the type of blocks in range */
  setBlockType(from: Pos, _to: Pos, type: string, attrs?: Attrs): this {
    return this.step(new SetNodeAttrsStep(from, { ...attrs, __setType: type } as any));
  }

  /** Set node attributes at position */
  setNodeAttrs(pos: Pos, attrs: Attrs): this {
    return this.step(new SetNodeAttrsStep(pos, attrs));
  }

  /** Split a block node at position (e.g. Enter key) */
  split(pos: Pos, depth: number = 1, typeAfter?: string, attrsAfter?: Attrs): this {
    // Extract content after pos, create new node with it
    // This is a simplified split — the view layer handles complex splits
    return this.step(new SplitStep(pos, depth, typeAfter, attrsAfter));
  }

  /** Join two adjacent blocks at position */
  join(pos: Pos): this {
    return this.step(new JoinStep(pos));
  }

  /** Wrap range in a new parent node */
  wrap(from: Pos, to: Pos, wrapperType: string, attrs?: Attrs): this {
    return this.step(new WrapStep(from, to, wrapperType, attrs));
  }

  /** Lift content out of its parent (unwrap) */
  lift(from: Pos, to: Pos): this {
    return this.step(new LiftStep(from, to));
  }
}

// ── Split Step ────────────────────────────────────────────────────
// Split a block node at the cursor position (Enter key).
// For doc { paragraph { "Hello World" } } with cursor at pos 6 (after "Hello"):
//   Result: doc { paragraph { "Hello" }, paragraph { " World" } }

class SplitStep implements Step {
  constructor(
    readonly pos: Pos,
    readonly depth: number,
    readonly typeAfter?: string,
    readonly attrsAfter?: Attrs,
  ) {}

  apply(doc: DocNode): { doc: DocNode | null; failed: string | null } {
    try {
      const newDoc = splitBlock(doc, this.pos, this.typeAfter, this.attrsAfter);
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(_doc: DocNode): Step {
    return new JoinStep(this.pos);
  }

  map(mapping: Mapping): Step | null {
    return new SplitStep(mapping.map(this.pos, 1), this.depth, this.typeAfter, this.attrsAfter);
  }

  getMapping(): Mapping {
    const m = new Mapping();
    m.addRange(this.pos, this.pos, 2); // split inserts close+open tags
    return m;
  }

  toJSON() { return { type: 'split', pos: this.pos, depth: this.depth }; }
}

/** Split a block at position `pos` in the doc content.
 *  Recursively finds the deepest text-containing block (paragraph, heading)
 *  and splits it. For wrapper blocks (blockquote, list), splits the inner paragraph. */
function splitBlock(doc: DocNode, pos: Pos, typeAfter?: string, attrsAfter?: Attrs): DocNode {
  return splitBlockInner(doc, pos, typeAfter, attrsAfter);
}

function splitBlockInner(node: DocNode, pos: Pos, typeAfter?: string, attrsAfter?: Attrs): DocNode {
  let offset = 0;
  const newChildren: DocNode[] = [];

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];
    const size = nodeSize(child);
    const childEnd = offset + size;

    if (pos > offset && pos < childEnd && !isText(child)) {
      const contentPos = pos - offset - 1;

      // List item: split creates a NEW list item sibling
      if (child.type === 'listItem' || child.type === 'taskItem') {
        const splitResult = splitListItem(child, contentPos);
        newChildren.push(splitResult.before, splitResult.after);
        offset = childEnd;
        continue;
      }

      // Check if this child has sub-blocks (wrapper like blockquote, list)
      const hasSubBlocks = child.content.some(c => !isText(c) && c.type !== 'hardBreak');

      if (hasSubBlocks) {
        // Recurse into wrapper: split the inner block
        const splitChild = splitBlockInner(child, contentPos, typeAfter, attrsAfter);
        newChildren.push(splitChild);
      } else {
        // This is a leaf block (paragraph, heading, codeBlock) — split its text content
        const beforeContent: DocNode[] = [];
        const afterContent: DocNode[] = [];
        let childOffset = 0;

        for (const grandchild of child.content) {
          const gSize = nodeSize(grandchild);
          const gEnd = childOffset + gSize;

          if (gEnd <= contentPos) {
            beforeContent.push(grandchild);
          } else if (childOffset >= contentPos) {
            afterContent.push(grandchild);
          } else if (isText(grandchild)) {
            const splitAt = contentPos - childOffset;
            const textBefore = grandchild.text!.slice(0, splitAt);
            const textAfter = grandchild.text!.slice(splitAt);
            if (textBefore) beforeContent.push(createText(textBefore, grandchild.marks));
            if (textAfter) afterContent.push(createText(textAfter, grandchild.marks));
          } else {
            beforeContent.push(grandchild);
          }
          childOffset = gEnd;
        }

        if (beforeContent.length === 0) beforeContent.push(createText(''));
        if (afterContent.length === 0) afterContent.push(createText(''));

        const afterType = typeAfter ?? (child.type === 'heading' ? 'paragraph' : child.type);
        const afterAttrsVal = attrsAfter ?? (child.type === 'heading' ? {} : child.attrs);

        newChildren.push(createNode(child.type, child.attrs, beforeContent, child.marks));
        newChildren.push(createNode(afterType, afterAttrsVal, afterContent, child.marks));
      }
    } else {
      newChildren.push(child);
    }

    offset = childEnd;
  }

  return createNode(node.type, node.attrs, newChildren, node.marks);
}

// ── Join Step ─────────────────────────────────────────────────────
// Join two adjacent blocks into one (Backspace at block boundary).

class JoinStep implements Step {
  constructor(readonly pos: Pos) {}

  apply(doc: DocNode): { doc: DocNode | null; failed: string | null } {
    try {
      const newDoc = joinBlocks(doc, this.pos);
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(_doc: DocNode): Step {
    return new SplitStep(this.pos, 1);
  }

  map(mapping: Mapping): Step | null {
    return new JoinStep(mapping.map(this.pos, 1));
  }

  getMapping(): Mapping {
    const m = new Mapping();
    m.addRange(this.pos, this.pos, 0); // join removes 2 tags
    return m;
  }

  toJSON() { return { type: 'join', pos: this.pos }; }
}

/** Join two adjacent blocks at the boundary position `pos`.
 *  The pos should be between two sibling blocks in the doc. */
function joinBlocks(doc: DocNode, pos: Pos): DocNode {
  let offset = 0;
  const newChildren: DocNode[] = [];

  for (let i = 0; i < doc.content.length; i++) {
    const child = doc.content[i];
    const size = nodeSize(child);

    // Check if pos is at the boundary between this child and the next
    if (offset + size === pos && i + 1 < doc.content.length) {
      const next = doc.content[i + 1];
      if (!isText(child) && !isText(next)) {
        // Merge child and next
        const merged = createNode(child.type, child.attrs,
          mergeAdjacentText([...child.content, ...next.content]), child.marks);
        newChildren.push(merged);
        i++; // skip next
        offset += size + nodeSize(next);
        continue;
      }
    }

    newChildren.push(child);
    offset += size;
  }

  return createNode(doc.type, doc.attrs, newChildren, doc.marks);
}

// ── Wrap Step ─────────────────────────────────────────────────────

class WrapStep implements Step {
  constructor(
    readonly from: Pos,
    readonly to: Pos,
    readonly wrapperType: string,
    readonly attrs?: Attrs,
  ) {}

  apply(doc: DocNode): { doc: DocNode | null; failed: string | null } {
    try {
      const newDoc = wrapRange(doc, this.from, this.to, this.wrapperType, this.attrs, 0);
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  invert(_doc: DocNode): Step {
    return new LiftStep(this.from + 1, this.to + 1);
  }

  map(mapping: Mapping): Step | null {
    return new WrapStep(
      mapping.map(this.from, 1),
      mapping.map(this.to, -1),
      this.wrapperType,
      this.attrs,
    );
  }

  getMapping(): Mapping {
    const m = new Mapping();
    m.addRange(this.from, this.to, this.to - this.from + 2); // +2 for open+close
    return m;
  }

  toJSON() { return { type: 'wrap', from: this.from, to: this.to, wrapperType: this.wrapperType }; }
}

// ── Lift Step ─────────────────────────────────────────────────────

class LiftStep implements Step {
  constructor(readonly from: Pos, readonly to: Pos) {}

  apply(doc: DocNode): { doc: DocNode | null; failed: string | null } {
    try {
      const info: { wrapperType?: string } = {};
      const newDoc = liftRange(doc, this.from, this.to, 0, info);
      if (info.wrapperType) this.liftedWrapperType = info.wrapperType;
      return { doc: newDoc, failed: null };
    } catch (e) {
      return { doc: null, failed: (e as Error).message };
    }
  }

  /** The type of the wrapper dissolved by the apply — the invert re-creates it with the
   *  REAL type instead of hardcoding 'blockquote' (which would re-wrap a lift out
   *  of a list as a blockquote on undo). */
  private liftedWrapperType: string | null = null;

  invert(_doc: DocNode): Step {
    return new WrapStep(this.from - 1, this.to - 1, this.liftedWrapperType ?? 'blockquote');
  }

  map(mapping: Mapping): Step | null {
    return new LiftStep(mapping.map(this.from, 1), mapping.map(this.to, -1));
  }

  getMapping(): Mapping {
    const m = new Mapping();
    m.addRange(this.from - 1, this.to + 1, this.to - this.from);
    return m;
  }

  toJSON() { return { type: 'lift', from: this.from, to: this.to }; }
}

// ── Implementation Helpers ────────────────────────────────────────

/** Check if all text in range has a given mark type */
function rangeHasMark(doc: DocNode, from: Pos, to: Pos, markType: string): boolean {
  let allHave = true;
  let foundText = false;

  walkTextInRange(doc, from, to, 0, (node) => {
    foundText = true;
    if (!node.marks.some(m => m.type === markType)) allHave = false;
  });

  return foundText && allHave;
}

/** Walk text nodes overlapping a range */
function walkTextInRange(
  node: DocNode, from: Pos, to: Pos, base: Pos,
  fn: (textNode: DocNode) => void,
): void {
  if (isText(node)) {
    const nodeEnd = base + node.text!.length;
    if (nodeEnd > from && base < to) fn(node);
    return;
  }

  let childBase = base + (node.content.length > 0 ? 1 : 1);
  for (const child of node.content) {
    const childEnd = childBase + nodeSize(child);
    if (childEnd > from && childBase < to) {
      walkTextInRange(child, from, to, childBase, fn);
    }
    childBase = childEnd;
  }
}

/** Split a listItem at contentPos, producing two listItems.
 *  The split happens at the paragraph level inside the listItem. */
function splitListItem(item: DocNode, contentPos: Pos): { before: DocNode; after: DocNode } {
  // Find the paragraph inside the list item that contains the cursor
  let offset = 0;
  const beforeContent: DocNode[] = [];
  const afterContent: DocNode[] = [];
  let splitDone = false;

  for (const child of item.content) {
    const size = nodeSize(child);
    const childEnd = offset + size;

    if (!splitDone && contentPos > offset && contentPos < childEnd) {
      // Split this child (should be a paragraph)
      if (isText(child)) {
        const splitAt = contentPos - offset;
        beforeContent.push(createText(child.text!.slice(0, splitAt), child.marks));
        afterContent.push(createText(child.text!.slice(splitAt), child.marks));
      } else {
        // Split paragraph's text content
        const innerPos = contentPos - offset - 1;
        const textBefore: DocNode[] = [];
        const textAfter: DocNode[] = [];
        let innerOffset = 0;

        for (const gc of child.content) {
          const gSize = nodeSize(gc);
          const gEnd = innerOffset + gSize;
          if (gEnd <= innerPos) {
            textBefore.push(gc);
          } else if (innerOffset >= innerPos) {
            textAfter.push(gc);
          } else if (isText(gc)) {
            const sp = innerPos - innerOffset;
            if (gc.text!.slice(0, sp)) textBefore.push(createText(gc.text!.slice(0, sp), gc.marks));
            if (gc.text!.slice(sp)) textAfter.push(createText(gc.text!.slice(sp), gc.marks));
          }
          innerOffset = gEnd;
        }

        if (textBefore.length === 0) textBefore.push(createText(''));
        if (textAfter.length === 0) textAfter.push(createText(''));

        beforeContent.push(createNode(child.type, child.attrs, textBefore, child.marks));
        afterContent.push(createNode(child.type, child.attrs, textAfter, child.marks));
      }
      splitDone = true;
    } else if (!splitDone) {
      beforeContent.push(child);
    } else {
      afterContent.push(child);
    }
    offset = childEnd;
  }

  // If split not done (cursor at boundary), put everything before
  if (!splitDone) {
    return {
      before: item,
      after: createNode(item.type, item.attrs, [createNode('paragraph', {}, [createText('')])]),
    };
  }

  return {
    before: createNode(item.type, item.attrs, beforeContent.length > 0 ? beforeContent : [createNode('paragraph', {}, [createText('')])]),
    after: createNode(item.type, item.attrs, afterContent.length > 0 ? afterContent : [createNode('paragraph', {}, [createText('')])]),
  };
}

/** Wrap range in a new node */
function wrapRange(
  node: DocNode, from: Pos, to: Pos,
  wrapperType: string, attrs: Attrs | undefined,
  base: Pos,
): DocNode {
  if (isText(node)) return node;

  let childBase = base + 1;
  const children: DocNode[] = [];
  const wrappedChildren: DocNode[] = [];
  let wrapping = false;
  let wrapped = false;

  for (const child of node.content) {
    const childEnd = childBase + nodeSize(child);

    if (!wrapped && childBase >= from && childEnd <= to) {
      wrapping = true;
      wrappedChildren.push(child);
    } else {
      if (wrapping) {
        // Flush wrapped children
        children.push(createNode(wrapperType, attrs ?? {}, wrappedChildren));
        wrapping = false;
        wrapped = true;
      }
      children.push(child);
    }

    childBase = childEnd;
  }

  if (wrapping) {
    children.push(createNode(wrapperType, attrs ?? {}, wrappedChildren));
  }

  return createNode(node.type, node.attrs, children, node.marks);
}

/** Lift content out of wrapper */
function liftRange(node: DocNode, from: Pos, to: Pos, base: Pos, info?: { wrapperType?: string }): DocNode {
  if (isText(node)) return node;

  let childBase = base + 1;
  const children: DocNode[] = [];
  let changed = false;

  for (const child of node.content) {
    const childEnd = childBase + nodeSize(child);

    if (!isText(child) && childBase < from && childEnd > to) {
      // This child contains the range — lift its children
      if (info) info.wrapperType = child.type; // for the invert
      children.push(...child.content);
      changed = true;
    } else if (childBase >= from && childEnd <= to && !isText(child)) {
      // Recurse
      const newChild = liftRange(child, from, to, childBase, info);
      children.push(newChild);
      if (newChild !== child) changed = true;
    } else {
      children.push(child);
    }

    childBase = childEnd;
  }

  if (!changed) return node;
  return createNode(node.type, node.attrs, children, node.marks);
}
