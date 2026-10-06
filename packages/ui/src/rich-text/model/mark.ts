// ── Mark Operations ───────────────────────────────────────────────
// Marks are inline formatting applied to text nodes.
// Mark sets are immutable sorted arrays (sorted by type name for canonical order).

import type { Attrs, Mark } from './types.js';

/** Create a mark */
export function createMark(type: string, attrs: Attrs = {}): Mark {
  return { type, attrs };
}

/** Compare two marks for equality */
export function markEq(a: Mark, b: Mark): boolean {
  if (a.type !== b.type) return false;
  const aKeys = Object.keys(a.attrs);
  const bKeys = Object.keys(b.attrs);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a.attrs[k] !== b.attrs[k]) return false;
  }
  return true;
}

/** Check if a mark set contains a mark of given type */
export function markHasType(marks: readonly Mark[], type: string): Mark | undefined {
  return marks.find(m => m.type === type);
}

/** Add a mark to a set (maintaining sorted order, replacing same type) */
export function markAdd(marks: readonly Mark[], mark: Mark): readonly Mark[] {
  const result: Mark[] = [];
  let added = false;
  for (const m of marks) {
    if (m.type === mark.type) {
      // Replace existing mark of same type
      if (!added) { result.push(mark); added = true; }
    } else if (!added && m.type > mark.type) {
      result.push(mark);
      added = true;
      result.push(m);
    } else {
      result.push(m);
    }
  }
  if (!added) result.push(mark);
  return result;
}

/** Remove a mark from a set by type */
export function markRemove(marks: readonly Mark[], type: string): readonly Mark[] {
  return marks.filter(m => m.type !== type);
}

/** Remove a specific mark (type + attrs match) from a set */
export function markRemoveExact(marks: readonly Mark[], mark: Mark): readonly Mark[] {
  return marks.filter(m => !markEq(m, mark));
}

/** Check if two mark sets are equal */
export function marksEq(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!markEq(a[i], b[i])) return false;
  }
  return true;
}

/** Compute marks that are in both sets */
export function marksIntersect(a: readonly Mark[], b: readonly Mark[]): readonly Mark[] {
  return a.filter(am => b.some(bm => markEq(am, bm)));
}

/** Check if set `a` is a subset of set `b` */
export function marksSubset(a: readonly Mark[], b: readonly Mark[]): boolean {
  return a.every(am => b.some(bm => markEq(am, bm)));
}

/** Empty mark set (constant, reuse to avoid allocations) */
export const EMPTY_MARKS: readonly Mark[] = Object.freeze([]);
