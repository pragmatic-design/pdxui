// ── List Commands ─────────────────────────────────────────────────
// Direct doc transformations for list operations.

import type { DocNode, Pos } from '../model/types.js';
import { createNode, nodeSize, isText } from '../model/node.js';
import { selFrom, selTo } from '../model/selection.js';
import type { CommandFn } from '../state/plugin.js';
import { createTransaction } from '../state/state.js';

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

/** Backspace-at-start-of-item behaviour (Word/Docs classic): outdent ONLY the
 *  list item whose content start the cursor sits at, lifting it to a paragraph
 *  and splitting the surrounding list. Returns the new doc + cursor position, or
 *  null when the cursor is not exactly at the start of a list item's content. */
export function outdentListItemAt(doc: DocNode, pos: Pos): { doc: DocNode; selPos: Pos } | null {
  let offset = 0;
  for (let i = 0; i < doc.content.length; i++) {
    const list = doc.content[i];
    const size = nodeSize(list);
    const listEnd = offset + size;

    if (pos > offset && pos < listEnd && LIST_TYPES.has(list.type)) {
      let inner = offset + 1; // position at the first item's open tag
      for (let j = 0; j < list.content.length; j++) {
        const item = list.content[j];
        const itemEnd = inner + nodeSize(item);

        if (pos > inner && pos < itemEnd) {
          // Start of the item's first (text)block content = inner + 1 (item open) + 1 (block open).
          const itemContentStart = inner + 2;
          if (pos !== itemContentStart) return null; // not at the very start → normal delete

          const before = list.content.slice(0, j);
          const after = list.content.slice(j + 1);
          const lifted = item.content; // the item's blocks, lifted out of the list

          const newChildren: DocNode[] = [...doc.content.slice(0, i)];
          if (before.length) newChildren.push(createNode(list.type, list.attrs, before, list.marks));
          newChildren.push(...lifted);
          if (after.length) newChildren.push(createNode(list.type, list.attrs, after, list.marks));
          newChildren.push(...doc.content.slice(i + 1));

          const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);

          // Cursor lands at the start of the lifted block's content (text kept intact).
          let cp = 0;
          for (const c of doc.content.slice(0, i)) cp += nodeSize(c);
          if (before.length) cp += nodeSize(createNode(list.type, list.attrs, before, list.marks));
          cp += 1; // inside the lifted block (its open tag)
          return { doc: newDoc, selPos: cp };
        }
        inner = itemEnd;
      }
    }
    offset = listEnd;
  }
  return null;
}

/** Wrap current block(s) in a bullet list */
export function wrapInBulletList(): CommandFn {
  return wrapInList('bulletList', 'listItem');
}

/** Wrap current block(s) in an ordered list */
export function wrapInOrderedList(): CommandFn {
  return wrapInList('orderedList', 'listItem');
}

/** Wrap current block(s) in a task list */
export function wrapInTaskList(): CommandFn {
  return wrapInList('taskList', 'taskItem');
}

function wrapInList(listType: string, itemType: string): CommandFn {
  return (state, dispatch) => {
    if (dispatch) {
      const from = selFrom(state.selection);
      const to = selTo(state.selection);

      // Find which block(s) contain the selection
      const doc = state.doc;
      let offset = 0;
      const newChildren: DocNode[] = [];
      const toWrap: DocNode[] = [];
      let wrapStarted = false;
      // Cursor remap: wrapping a block inserts a list-open + item-open before it,
      // so the cursor shifts by +2 per wrapped item up to and including its own.
      // shift = 2 + 2*(items wrapped before the cursor's block).
      let cursorShift = 0;

      for (const child of doc.content) {
        const size = nodeSize(child);
        const childEnd = offset + size;

        // Check if this block overlaps with selection
        const overlaps = childEnd > from && offset < to;

        if (overlaps && !isText(child)) {
          // Already a list of the same type? Unwrap (toggle off)
          if (child.type === listType) {
            // Lift: extract list items as paragraphs
            for (const item of child.content) {
              newChildren.push(...item.content);
            }
            offset = childEnd;
            continue;
          }

          // Record the cursor's wrapped-block index before pushing it.
          if (from >= offset && from <= childEnd) {
            cursorShift = 2 + 2 * toWrap.length;
          }
          wrapStarted = true;
          // Wrap this block in a list item
          toWrap.push(createNode(itemType, {}, [child]));
        } else {
          if (wrapStarted && toWrap.length > 0) {
            // Flush collected items into a list
            newChildren.push(createNode(listType, {}, toWrap.splice(0)));
            wrapStarted = false;
          }
          newChildren.push(child);
        }

        offset = childEnd;
      }

      // Flush remaining
      if (toWrap.length > 0) {
        newChildren.push(createNode(listType, {}, toWrap));
      }

      // Create new doc and dispatch
      const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
      const tr = createTransaction(state);
      // Remap the cursor through the inserted wrapper tags so a subsequent
      // Enter/typing splits at the right place (cursorShift = 0 → unchanged).
      const remappedSel = cursorShift > 0
        ? { anchor: from + cursorShift, head: to + cursorShift, type: 'text' as const }
        : state.selection;
      tr.setMeta('historySel', remappedSel);
      tr.setMeta('replaceDoc', newDoc);
      dispatch(tr);
    }
    return true;
  };
}

// ── Indent and outdent ────────────────────────────────────────────
// Tab and Shift+Tab move the one item at the caret, at any depth, with the ProseMirror
// sinkListItem/liftListItem semantics.

const ITEM_TYPES = new Set(['listItem', 'taskItem']);

/** The innermost list item around `pos`, with the list that holds it and how to reach both. */
interface ItemAt {
  item: DocNode;
  /** Child indices from the doc down to the item. */
  itemPath: number[];
  itemStart: Pos;
  list: DocNode;
  listPath: number[];
  /** The list's own parent: a list item when the list is nested, else null. */
  parentItem: DocNode | null;
}

function listItemAt(doc: DocNode, pos: Pos): ItemAt | null {
  const nodes: DocNode[] = [];
  const indices: number[] = [];
  const starts: Pos[] = [];
  let node = doc;
  let base = 0; // where `node`'s content starts
  for (;;) {
    let offset = base;
    let found = -1;
    for (let i = 0; i < node.content.length; i++) {
      const size = nodeSize(node.content[i]);
      if (!isText(node.content[i]) && pos > offset && pos < offset + size) { found = i; break; }
      offset += size;
    }
    if (found < 0) break;
    node = node.content[found];
    nodes.push(node);
    indices.push(found);
    starts.push(offset);
    base = offset + 1;
  }
  for (let k = nodes.length - 1; k >= 1; k--) {
    if (!ITEM_TYPES.has(nodes[k].type) || !LIST_TYPES.has(nodes[k - 1].type)) continue;
    return {
      item: nodes[k],
      itemPath: indices.slice(0, k + 1),
      itemStart: starts[k],
      list: nodes[k - 1],
      listPath: indices.slice(0, k),
      parentItem: k >= 2 && ITEM_TYPES.has(nodes[k - 2].type) ? nodes[k - 2] : null,
    };
  }
  return null;
}

/** `root` with the node at `path` replaced by `replacement` (none, one or several nodes). */
function replaceAt(root: DocNode, path: number[], replacement: DocNode[]): DocNode {
  const [i, ...rest] = path;
  const children = [...root.content];
  if (rest.length === 0) children.splice(i, 1, ...replacement);
  else children[i] = replaceAt(children[i], rest, replacement);
  return createNode(root.type, root.attrs, children, root.marks);
}

/** The position of the open tag of the node at `path`. */
function startOf(doc: DocNode, path: number[]): Pos {
  let pos = 0;
  let node = doc;
  path.forEach((index, depth) => {
    if (depth > 0) pos += 1; // inside the open tag of the node above
    for (let k = 0; k < index; k++) pos += nodeSize(node.content[k]);
    node = node.content[index];
  });
  return pos;
}

function withChildren(node: DocNode, children: DocNode[]): DocNode {
  return createNode(node.type, node.attrs, children, node.marks);
}

/** Replace the doc and move the selection by `delta` — all of it when it lies in the moved item. */
function dispatchMoved(
  state: Parameters<CommandFn>[0], dispatch: Parameters<CommandFn>[1],
  newDoc: DocNode, at: ItemAt, delta: number,
): void {
  if (!dispatch) return;
  const itemEnd = at.itemStart + nodeSize(at.item);
  const inItem = (p: Pos): boolean => p > at.itemStart && p < itemEnd;
  const { anchor, head } = state.selection;
  const caret = selFrom(state.selection) + delta;
  const sel = inItem(anchor) && inItem(head)
    ? { anchor: anchor + delta, head: head + delta, type: 'text' as const }
    : { anchor: caret, head: caret, type: 'text' as const };
  const tr = createTransaction(state);
  tr.setMeta('replaceDoc', newDoc);
  tr.setMeta('historySel', sel);
  dispatch(tr);
}

/** Lift (outdent) the list item at the caret: out of a nested list into the parent list, after its
 *  parent item, taking the items that followed it as its children; out of an outermost list as its
 *  own blocks, splitting the list around them. */
export function liftListItem(): CommandFn {
  return (state, dispatch) => {
    const doc = state.doc;
    // No list at the caret: the command does not apply, and Shift+Tab keeps its default.
    const at = listItemAt(doc, selFrom(state.selection));
    if (!at) return false;
    const j = at.itemPath[at.itemPath.length - 1];
    const before = at.list.content.slice(0, j);
    const after = at.list.content.slice(j + 1);

    if (at.parentItem) {
      // Nested: the item moves up next to its parent item; its later siblings go with it.
      const last = at.item.content[at.item.content.length - 1];
      const children = !after.length ? [...at.item.content]
        : last && last.type === at.list.type
          ? [...at.item.content.slice(0, -1), withChildren(last, [...last.content, ...after])]
          : [...at.item.content, withChildren(at.list, after)];
      const lifted = withChildren(at.item, children);
      const listIndex = at.listPath[at.listPath.length - 1];
      const parentPath = at.listPath.slice(0, -1);
      const parentChildren = [...at.parentItem.content];
      if (before.length) parentChildren[listIndex] = withChildren(at.list, before);
      else parentChildren.splice(listIndex, 1);
      const newDoc = replaceAt(doc, parentPath, [withChildren(at.parentItem, parentChildren), lifted]);
      const liftedPath = [...parentPath.slice(0, -1), parentPath[parentPath.length - 1] + 1];
      dispatchMoved(state, dispatch, newDoc, at, startOf(newDoc, liftedPath) - at.itemStart);
      return true;
    }

    // Outermost: the item's blocks replace it, between the two halves of the list.
    const replacement: DocNode[] = [];
    if (before.length) replacement.push(withChildren(at.list, before));
    replacement.push(...at.item.content);
    if (after.length) replacement.push(withChildren(at.list, after));
    const newDoc = replaceAt(doc, at.listPath, replacement);
    const listIndex = at.listPath[at.listPath.length - 1];
    const firstBlock = [...at.listPath.slice(0, -1), listIndex + (before.length ? 1 : 0)];
    // The item's wrapper is gone: its content started one past its open tag.
    dispatchMoved(state, dispatch, newDoc, at, startOf(newDoc, firstBlock) - (at.itemStart + 1));
    return true;
  };
}

/** Sink (indent) the list item at the caret into its previous sibling: at the end of that item's
 *  sublist of the same kind, or in a new one. The first item of a list has nowhere to go: false, so
 *  Tab keeps its default and focus moves on. */
export function sinkListItem(): CommandFn {
  return (state, dispatch) => {
    const doc = state.doc;
    const at = listItemAt(doc, selFrom(state.selection));
    if (!at) return false;
    const j = at.itemPath[at.itemPath.length - 1];
    if (j === 0) return false;

    const prev = at.list.content[j - 1];
    const last = prev.content[prev.content.length - 1];
    let newPrev: DocNode;
    let inPrev: number[]; // the item's path below `prev`
    if (last && last.type === at.list.type) {
      newPrev = withChildren(prev, [...prev.content.slice(0, -1), withChildren(last, [...last.content, at.item])]);
      inPrev = [prev.content.length - 1, last.content.length];
    } else {
      newPrev = withChildren(prev, [...prev.content, createNode(at.list.type, {}, [at.item])]);
      inPrev = [prev.content.length, 0];
    }
    const items = [...at.list.content.slice(0, j - 1), newPrev, ...at.list.content.slice(j + 1)];
    const newDoc = replaceAt(doc, at.listPath, [withChildren(at.list, items)]);
    const newItemPath = [...at.listPath, j - 1, ...inPrev];
    dispatchMoved(state, dispatch, newDoc, at, startOf(newDoc, newItemPath) - at.itemStart);
    return true;
  };
}

