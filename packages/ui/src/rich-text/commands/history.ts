// ── History (Undo/Redo) ───────────────────────────────────────────
// Operation-based undo/redo. Stores previous doc snapshots (compact).
// Consecutive typing within 500ms is merged into a single undo step.
//
// PER-INSTANCE state: module variables would be shared by ALL the editors on
// the page — the second one's init would zero the first one's history, and an
// undo in B could restore A's document.
// The key is the editor element (ExtensionContext.getEditorElement()).

import type { DocNode, Selection } from '../model/types.js';
import type { Extension, CommandFn, ExtensionContext } from '../state/plugin.js';
import { createTransaction } from '../state/state.js';

interface HistoryEntry {
  doc: DocNode;
  selection: Selection;
  timestamp: number;
}

interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  lastTimestamp: number;
  lastDoc: DocNode | null;
  isHistoryOperation: boolean; // flag to skip recording during undo/redo
}

const MERGE_WINDOW = 500;
const MAX_HISTORY = 100;

const _stores = new WeakMap<object, HistoryState>();
// An editor with no element (a very early init, or a test): a single shared fallback.
const _fallbackKey = {};

function freshState(): HistoryState {
  return { undoStack: [], redoStack: [], lastTimestamp: 0, lastDoc: null, isHistoryOperation: false };
}

function storeFor(key: object | null | undefined): HistoryState {
  const k = key ?? _fallbackKey;
  let s = _stores.get(k);
  if (!s) {
    s = freshState();
    _stores.set(k, s);
  }
  return s;
}

function resetFor(key: object | null | undefined): void {
  _stores.set(key ?? _fallbackKey, freshState());
}

export function undo(ctx?: ExtensionContext): CommandFn {
  return (state, dispatch) => {
    const h = storeFor(ctx?.getEditorElement());
    if (h.undoStack.length === 0) return false;

    if (dispatch) {
      const entry = h.undoStack.pop()!;

      h.redoStack.push({
        doc: state.doc,
        selection: state.selection,
        timestamp: Date.now(),
      });

      h.isHistoryOperation = true;
      const tr = createTransaction(state);
      tr.setMeta('historyDoc', entry.doc);
      tr.setMeta('historySel', entry.selection);
      dispatch(tr);
    }
    return true;
  };
}

export function redo(ctx?: ExtensionContext): CommandFn {
  return (state, dispatch) => {
    const h = storeFor(ctx?.getEditorElement());
    if (h.redoStack.length === 0) return false;

    if (dispatch) {
      const entry = h.redoStack.pop()!;

      h.undoStack.push({
        doc: state.doc,
        selection: state.selection,
        timestamp: Date.now(),
      });

      h.isHistoryOperation = true;
      const tr = createTransaction(state);
      tr.setMeta('historyDoc', entry.doc);
      tr.setMeta('historySel', entry.selection);
      dispatch(tr);
    }
    return true;
  };
}

export const History: Extension = {
  name: 'history',

  commands: (ctx) => ({
    undo: undo(ctx),
    redo: redo(ctx),
  }),

  keymap: (ctx) => ({
    'Mod-z': undo(ctx),
    'Mod-Shift-z': redo(ctx),
    'Mod-y': redo(ctx),
  }),

  onInit: (ctx) => {
    resetFor(ctx.getEditorElement());
  },

  onUpdate: (ctx, prevState) => {
    const state = ctx.getState();
    if (state.doc === prevState.doc) return;

    const h = storeFor(ctx.getEditorElement());

    // Skip recording if this is an undo/redo operation
    if (h.isHistoryOperation) {
      h.isHistoryOperation = false;
      h.lastDoc = state.doc;
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - h.lastTimestamp;

    // Merge with last entry if within merge window
    if (timeSinceLast < MERGE_WINDOW && h.undoStack.length > 0 && h.lastDoc === prevState.doc) {
      // Don't push new entry — the existing one already has the right restore point
      h.lastTimestamp = now;
      h.lastDoc = state.doc;
      return;
    }

    // Push previous state to undo stack
    h.undoStack.push({
      doc: prevState.doc,
      selection: prevState.selection,
      timestamp: now,
    });

    if (h.undoStack.length > MAX_HISTORY) h.undoStack.shift();

    // Clear redo stack on new changes
    h.redoStack.length = 0;

    h.lastTimestamp = now;
    h.lastDoc = state.doc;
  },
};

/** True when the editor bound to the element has undo steps available. */
export function canUndo(editorEl?: HTMLElement | null): boolean {
  return storeFor(editorEl).undoStack.length > 0;
}

/** True when the editor bound to the element has redo steps available. */
export function canRedo(editorEl?: HTMLElement | null): boolean {
  return storeFor(editorEl).redoStack.length > 0;
}
