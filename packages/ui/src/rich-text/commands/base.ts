// ── Base Commands ─────────────────────────────────────────────────
// Core editing commands: mark toggling, block type changing, wrapping.
// Commands return true if they can apply, false otherwise.
// If dispatch is provided, they execute. If not, they just check applicability.

import type { Attrs, DocNode } from '../model/types.js';
import { createMark } from '../model/mark.js';
import { selFrom, selTo, createSelection, marksAtSelection } from '../model/selection.js';
import { createNode, contentSize, nodeSize, isText } from '../model/node.js';
import type { CommandFn } from '../state/plugin.js';
import { createTransaction } from '../state/state.js';

// ── Mark Commands ─────────────────────────────────────────────

/** Create a toggle-mark command for a given mark type */
export function toggleMark(markType: string, attrs?: Attrs): CommandFn {
  return (state, dispatch) => {
    const from = selFrom(state.selection);
    const to = selTo(state.selection);
    if (from === to) {
      // At a caret the mark is toggled for what is typed next: it goes into the stored marks,
      // starting from the ones pending, else those of the text at the caret, so Ctrl+B then typing
      // gives bold text.
      if (dispatch) {
        const current = state.storedMarks ?? marksAtSelection(state.doc, state.selection);
        const next = current.some(m => m.type === markType)
          ? current.filter(m => m.type !== markType)
          : [...current, createMark(markType, attrs)];
        dispatch(createTransaction(state).setStoredMarks(next));
      }
      return true;
    }

    if (dispatch) {
      const tr = createTransaction(state);
      tr.toggleMark(markType, attrs);
      tr.scrollIntoView();
      dispatch(tr);
    }
    return true;
  };
}

/** Add a mark to the current selection */
export function addMark(markType: string, attrs?: Attrs): CommandFn {
  return (state, dispatch) => {
    const from = selFrom(state.selection);
    const to = selTo(state.selection);
    if (from === to) return false;

    if (dispatch) {
      const tr = createTransaction(state);
      tr.addMark(from, to, createMark(markType, attrs));
      dispatch(tr);
    }
    return true;
  };
}

/** Remove a mark from the current selection */
export function removeMark(markType: string): CommandFn {
  return (state, dispatch) => {
    const from = selFrom(state.selection);
    const to = selTo(state.selection);
    if (from === to) return false;

    if (dispatch) {
      const tr = createTransaction(state);
      tr.removeMark(from, to, createMark(markType));
      dispatch(tr);
    }
    return true;
  };
}

// ── Block Commands ────────────────────────────────────────────

/** Toggle heading: paragraph → heading(level), or heading → paragraph */
export function toggleHeading(level: number): CommandFn {
  return (state, dispatch) => {
    if (dispatch) {
      const from = selFrom(state.selection);
      const doc = state.doc;
      let offset = 0;
      const newChildren: DocNode[] = [];

      for (const child of doc.content) {
        const size = nodeSize(child);
        const childEnd = offset + size;

        if (childEnd > from && offset <= from && !isText(child)) {
          if (child.type === 'heading' && child.attrs.level === level) {
            // Toggle off: heading → paragraph
            newChildren.push(createNode('paragraph', {}, child.content, child.marks));
          } else if (child.type === 'paragraph' || child.type === 'heading') {
            // Toggle on: paragraph/other heading → heading(level)
            newChildren.push(createNode('heading', { level }, child.content, child.marks));
          } else {
            newChildren.push(child);
          }
        } else {
          newChildren.push(child);
        }
        offset = childEnd;
      }

      const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
      const tr = createTransaction(state);
      tr.setMeta('replaceDoc', newDoc);
      dispatch(tr);
    }
    return true;
  };
}

/** Wrap selected blocks in a new parent node (e.g. blockquote) */
export function wrapIn(type: string, attrs?: Attrs): CommandFn {
  return (state, dispatch) => {
    if (dispatch) {
      const from = selFrom(state.selection);
      const to = selTo(state.selection);
      const doc = state.doc;
      let offset = 0;
      const newChildren: DocNode[] = [];
      const toWrap: DocNode[] = [];

      for (const child of doc.content) {
        const size = nodeSize(child);
        const childEnd = offset + size;
        const overlaps = childEnd > from && offset < to;

        if (overlaps && !isText(child)) {
          // If already wrapped in this type, unwrap (toggle)
          if (child.type === type) {
            newChildren.push(...child.content);
            offset = childEnd;
            continue;
          }
          toWrap.push(child);
        } else {
          if (toWrap.length > 0) {
            newChildren.push(createNode(type, attrs ?? {}, toWrap.splice(0)));
          }
          newChildren.push(child);
        }
        offset = childEnd;
      }
      if (toWrap.length > 0) {
        newChildren.push(createNode(type, attrs ?? {}, toWrap));
      }

      const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
      const tr = createTransaction(state);
      tr.setMeta('replaceDoc', newDoc);
      // Recalculate cursor: find position of the text we wrapped
      // When wrapping, text shifts by +1 (wrapper open tag)
      // When unwrapping, text shifts by -1
      // Simple heuristic: place cursor inside the first block of the wrapper
      let newOffset = 0;
      for (const child of newChildren) {
        const s = nodeSize(child);
        if (child.type === type) {
          // Cursor inside first child of wrapper: offset + 1 (wrapper) + 1 (child paragraph)
          const innerText = child.content[0]?.content?.[0]?.text ?? '';
          tr.setMeta('historySel', {
            anchor: newOffset + 2 + innerText.length,
            head: newOffset + 2 + innerText.length,
            type: 'text' as const,
          });
          break;
        }
        newOffset += s;
      }
      dispatch(tr);
    }
    return true;
  };
}

/** Lift selected content out of its parent wrapper */
export function lift(): CommandFn {
  return (state, dispatch) => {
    if (dispatch) {
      const from = selFrom(state.selection);
      const doc = state.doc;
      let offset = 0;
      const newChildren: DocNode[] = [];
      let changed = false;

      for (const child of doc.content) {
        const size = nodeSize(child);
        const childEnd = offset + size;

        if (childEnd > from && offset <= from && !isText(child) &&
            child.type !== 'paragraph' && child.type !== 'heading') {
          // Unwrap: replace this node with its children
          newChildren.push(...child.content);
          changed = true;
        } else {
          newChildren.push(child);
        }
        offset = childEnd;
      }

      if (changed) {
        const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
        const tr = createTransaction(state);
        tr.setMeta('replaceDoc', newDoc);
        dispatch(tr);
      }
    }
    return true;
  };
}

/** Select all content */
export function selectAllCommand(): CommandFn {
  return (state, dispatch) => {
    if (dispatch) {
      const tr = createTransaction(state);
      tr.setSelection(createSelection(0, contentSize(state.doc)));
      dispatch(tr);
    }
    return true;
  };
}
