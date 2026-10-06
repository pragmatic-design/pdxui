// ── Selection Model ───────────────────────────────────────────────
// Selections are immutable and part of editor state.

import type { DocNode, Mark, Pos, Selection } from './types.js';
import { contentSize, resolvePos, walkNode } from './node.js';

/** Create a text (cursor or range) selection */
export function createSelection(anchor: Pos, head?: Pos): Selection {
  return { anchor, head: head ?? anchor, type: 'text' };
}

/** Create a node selection (selects an entire node) */
export function createNodeSelection(pos: Pos): Selection {
  return { anchor: pos, head: pos, type: 'node' };
}

/** Create a block selection */
export function createBlockSelection(anchor: Pos, head: Pos): Selection {
  return { anchor, head, type: 'block' };
}

/** Select all content */
export function selectAll(doc: DocNode): Selection {
  return { anchor: 0, head: contentSize(doc), type: 'all' };
}

/** Is selection collapsed (cursor, no range)? */
export function isCollapsed(sel: Selection): boolean {
  return sel.anchor === sel.head;
}

/** Get the from/to (ordered) positions */
export function selFrom(sel: Selection): Pos {
  return Math.min(sel.anchor, sel.head);
}

export function selTo(sel: Selection): Pos {
  return Math.max(sel.anchor, sel.head);
}

/** Is the selection empty? */
export function selEmpty(sel: Selection): boolean {
  return sel.anchor === sel.head;
}

/** Map a selection through a position change */
export function mapSelection(sel: Selection, map: (pos: Pos) => Pos): Selection {
  return {
    anchor: map(sel.anchor),
    head: map(sel.head),
    type: sel.type,
  };
}

/** Clamp selection to valid document range */
export function clampSelection(sel: Selection, doc: DocNode): Selection {
  const maxPos = contentSize(doc);
  const clamp = (p: Pos) => Math.max(0, Math.min(maxPos, p));
  return {
    anchor: clamp(sel.anchor),
    head: clamp(sel.head),
    type: sel.type,
  };
}

/** Find the nearest valid cursor position at or after the given position */
export function nearestValidPos(doc: DocNode, pos: Pos, bias: 1 | -1 = 1): Pos {
  const maxPos = contentSize(doc);
  if (pos < 0) return 0;
  if (pos > maxPos) return maxPos;

  // Try to resolve — if it works, the position is valid
  try {
    resolvePos(doc, pos);
    return pos;
  } catch {
    // Position is invalid (inside a node boundary token), search in bias direction
    const step = bias;
    let p = pos + step;
    while (p >= 0 && p <= maxPos) {
      try {
        resolvePos(doc, p);
        return p;
      } catch {
        p += step;
      }
    }
    // Fallback: search other direction
    p = pos - step;
    while (p >= 0 && p <= maxPos) {
      try {
        resolvePos(doc, p);
        return p;
      } catch {
        p -= step;
      }
    }
    return 0;
  }
}

/** Get marks active at selection (intersection for ranges, exact for cursor) */
export function marksAtSelection(doc: DocNode, sel: Selection): readonly Mark[] {
  const resolved = resolvePos(doc, selFrom(sel));
  const parent = resolved.parent;
  if (!parent.content.length) return [];

  // For cursor: marks of the character before cursor (or after if at start)
  if (isCollapsed(sel)) {
    const idx = resolved.index;
    if (idx > 0) {
      const before = parent.content[idx - 1];
      if (before.type === 'text') return before.marks;
    }
    if (idx < parent.content.length) {
      const at = parent.content[idx];
      if (at.type === 'text') return at.marks;
    }
    return [];
  }

  // For range: intersection of all text marks in range
  const from = selFrom(sel);
  const to = selTo(sel);
  let result: readonly Mark[] | null = null;

  walkNode(doc, (node, pos) => {
    if (node.type === 'text' && pos + (node.text?.length ?? 0) > from && pos < to) {
      if (result === null) {
        result = node.marks;
      } else {
        result = result.filter(m => node.marks.some(nm => nm.type === m.type));
      }
    }
  });

  return result ?? [];
}
