// ── Editor State ──────────────────────────────────────────────────
// Immutable state snapshot: doc + selection + schema + plugin states.
// All changes go through Transactions.

import type { Attrs, DocNode, Mark, Pos, Selection } from '../model/types.js';
import { createNode, createText, nodeSize, isText, resolvePos } from '../model/node.js';
import { createSelection, clampSelection, selFrom, selTo } from '../model/selection.js';
import { markEq } from '../model/mark.js';
import { normalizeDoc } from '../model/normalize.js';
import { Schema, defineSchema, defaultSchema, type SchemaSpec, type NodeSpec, type MarkSpec } from '../model/schema.js';
import { Transform } from '../transform/transform.js';
import { Mapping } from '../transform/mapping.js';
import type { Step } from '../transform/step.js';
import { type Extension, type CommandFn, type Keymap, type InputRule, type EditorStateRef, resolveExtensions } from './plugin.js';

// ── Editor State ──────────────────────────────────────────────────

export interface EditorState {
  readonly doc: DocNode;
  readonly selection: Selection;
  readonly schema: Schema;
  readonly extensions: readonly Extension[];
  readonly commands: Readonly<Record<string, CommandFn>>;
  readonly keymap: Readonly<Keymap>;
  readonly inputRules: readonly InputRule[];
  /**
   * Marks the next typed text takes at a collapsed caret — set by toggling a mark with no selection
   * (Ctrl+B, then type). null means "the marks of the text at the caret". Dropped when the
   * selection moves or the document changes by anything but that typing (the model
   * ProseMirror and Tiptap use).
   */
  readonly storedMarks: readonly Mark[] | null;
}

export interface EditorStateConfig {
  doc?: DocNode;
  schema?: Schema | SchemaSpec;
  selection?: Selection;
  extensions?: Extension[];
}

/** Create initial editor state */
export function createEditorState(config: EditorStateConfig = {}): EditorState {
  // Resolve schema
  let schema: Schema;
  if (!config.schema) {
    schema = defaultSchema;
  } else if ('spec' in config.schema) {
    schema = config.schema as Schema;
  } else {
    schema = defineSchema(config.schema as SchemaSpec);
  }

  // Build schema from extensions
  const extensions = resolveExtensions(config.extensions ?? []);
  const mergedSchema = mergeExtensionSchema(schema, extensions);

  // Default doc
  const doc = config.doc ?? createNode('doc', {}, [
    createNode('paragraph', {}, [createText('')]),
  ]);

  // Default selection at start
  const selection = config.selection ?? createSelection(1); // inside first paragraph

  // Build commands, keymap, input rules from extensions
  const ctx = createExtensionContext(mergedSchema, () => state, () => {});
  const commands: Record<string, CommandFn> = {};
  const keymap: Keymap = {};
  const inputRules: InputRule[] = [];

  for (const ext of extensions) {
    if (ext.commands) Object.assign(commands, ext.commands(ctx));
    if (ext.keymap) Object.assign(keymap, ext.keymap(ctx));
    if (ext.inputRules) inputRules.push(...ext.inputRules(ctx));
  }

  const state: EditorState = {
    doc,
    selection: clampSelection(selection, doc),
    schema: mergedSchema,
    extensions,
    commands,
    keymap,
    inputRules,
    storedMarks: null,
  };

  return state;
}

// ── Transaction ───────────────────────────────────────────────────

export class EditorTransaction {
  private transform: Transform;
  private _selection: Selection | null = null;
  /** undefined: not set by this transaction (applyTransaction decides); otherwise the new value. */
  private _storedMarks: readonly Mark[] | null | undefined = undefined;
  private _meta = new Map<string, unknown>();
  private _scrollIntoView = false;
  readonly schema: Schema;

  // Holds only the minimal Ref slice (doc/selection/schema) — commands pass an
  // EditorStateRef, and the transaction never needs extensions/commands/keymap.
  constructor(readonly state: EditorStateRef) {
    this.transform = new Transform(state.doc);
    this.schema = state.schema;
  }

  get doc(): DocNode { return this.transform.doc; }
  get steps(): readonly Step[] { return this.transform.steps; }
  get mapping(): Mapping { return this.transform.mapping; }

  get selection(): Selection {
    if (this._selection) return this._selection;
    // Map original selection through changes
    const sel = this.state.selection;
    if (this.transform.steps.length === 0) return sel;
    return {
      anchor: this.transform.mapping.map(sel.anchor, 1),
      head: this.transform.mapping.map(sel.head, 1),
      type: sel.type,
    };
  }

  // ── Text ────────────────────────────────────────────────────

  insertText(text: string, pos?: Pos): this {
    const p = pos ?? selFrom(this.selection);
    // If there's a range selection, delete it first
    const from = selFrom(this.selection);
    const to = selTo(this.selection);
    if (pos === undefined && from !== to) {
      this.transform.delete(from, to);
      this.transform.insertText(text, from);
      this._selection = createSelection(from + text.length);
    } else {
      this.transform.insertText(text, p);
      this._selection = createSelection(p + text.length);
      // Typed at the caret with marks pending: the text takes exactly those marks — not the ones
      // of the text it was spliced into — and they stay pending for the next letter, since the
      // caret follows the typing.
      const stored = this.state.storedMarks;
      if (pos === undefined && stored) {
        this.setMarksExactly(p, p + text.length, stored);
        this._storedMarks = stored;
      }
    }
    return this;
  }

  /**
   * Make freshly inserted text [from, to] carry exactly `marks`: remove the others, add the missing
   * ones. The inserted text sits in one text node (it took that node's marks), so its marks are that
   * node's, read directly.
   */
  private setMarksExactly(from: Pos, to: Pos, marks: readonly Mark[]): void {
    const at = resolvePos(this.transform.doc, from);
    const node = at.parent.content[at.index];
    const current = node && isText(node) ? node.marks : [];
    for (const m of current) {
      if (!marks.some(s => markEq(s, m))) this.transform.removeMark(from, to, m);
    }
    for (const m of marks) {
      if (!current.some(c => markEq(c, m))) this.transform.addMark(from, to, m);
    }
  }

  delete(from: Pos, to: Pos): this {
    this.transform.delete(from, to);
    this._selection = createSelection(from);
    return this;
  }

  deleteSelection(): this {
    const from = selFrom(this.selection);
    const to = selTo(this.selection);
    if (from === to) return this;
    return this.delete(from, to);
  }

  replaceWith(from: Pos, to: Pos, content: DocNode | readonly DocNode[]): this {
    this.transform.replaceWith(from, to, content);
    return this;
  }

  insert(pos: Pos, content: DocNode | readonly DocNode[]): this {
    this.transform.insert(pos, content);
    return this;
  }

  // ── Marks ───────────────────────────────────────────────────

  addMark(from: Pos, to: Pos, mark: Mark): this {
    this.transform.addMark(from, to, mark);
    return this;
  }

  removeMark(from: Pos, to: Pos, mark: Mark): this {
    this.transform.removeMark(from, to, mark);
    return this;
  }

  toggleMark(markType: string, attrs?: Attrs): this {
    const from = selFrom(this.selection);
    const to = selTo(this.selection);
    if (from === to) return this; // can't toggle mark on cursor (stored marks handled in view)
    this.transform.toggleMark(from, to, markType, attrs);
    return this;
  }

  // ── Blocks ──────────────────────────────────────────────────

  setNodeAttrs(pos: Pos, attrs: Attrs): this {
    this.transform.setNodeAttrs(pos, attrs);
    return this;
  }

  split(pos?: Pos): this {
    const p = pos ?? selFrom(this.selection);
    this.transform.split(p);
    // Find the first editable position after the split point in the new doc
    const newDoc = this.transform.doc;
    const cursorPos = findFirstEditableAfter(newDoc, p);
    this._selection = createSelection(cursorPos);
    return this;
  }

  wrap(wrapperType: string, attrs?: Attrs): this {
    const from = selFrom(this.selection);
    const to = selTo(this.selection);
    this.transform.wrap(from, to, wrapperType, attrs);
    return this;
  }

  lift(): this {
    const from = selFrom(this.selection);
    const to = selTo(this.selection);
    this.transform.lift(from, to);
    return this;
  }

  // ── Selection & Meta ────────────────────────────────────────

  setSelection(sel: Selection): this {
    this._selection = sel;
    return this;
  }

  /** Set the marks the next typed text takes (null: those of the text at the caret). */
  setStoredMarks(marks: readonly Mark[] | null): this {
    this._storedMarks = marks;
    return this;
  }

  /** The stored marks this transaction sets, or undefined when it leaves them to applyTransaction. */
  get storedMarks(): readonly Mark[] | null | undefined { return this._storedMarks; }

  setMeta(key: string, value: unknown): this {
    this._meta.set(key, value);
    return this;
  }

  getMeta(key: string): unknown {
    return this._meta.get(key);
  }

  scrollIntoView(): this {
    this._scrollIntoView = true;
    return this;
  }

  get shouldScrollIntoView(): boolean { return this._scrollIntoView; }
  get meta(): ReadonlyMap<string, unknown> { return this._meta; }
  get docChanged(): boolean { return this.transform.steps.length > 0; }
}

/** Apply a transaction to produce a new state */
export function applyTransaction(state: EditorState, tr: EditorTransaction): EditorState {
  // Direct doc replacement (history undo/redo, list commands, etc.)
  const replaceDoc = (tr.getMeta('replaceDoc') ?? tr.getMeta('historyDoc')) as DocNode | undefined;
  if (replaceDoc) {
    const normalized = normalizeDoc(replaceDoc, state.schema);
    const replaceSel = tr.getMeta('historySel') as Selection | undefined;
    const sel = replaceSel ? clampSelection(replaceSel, normalized) : clampSelection(state.selection, normalized);
    return {
      ...state,
      doc: normalized,
      selection: caretIntoTextblock(normalized, sel),
      storedMarks: tr.storedMarks !== undefined ? tr.storedMarks : null,
    };
  }

  // Normalize the transform result so editing operations can never leave the
  // tree in a schema-invalid state (stray text under doc, empty doc, etc.).
  const newDoc = normalizeDoc(tr.doc, state.schema);
  const newSel = caretIntoTextblock(newDoc, clampSelection(tr.selection, newDoc));

  // Stored marks: what the transaction set, else kept only while nothing moved.
  const moved = tr.docChanged || newSel.anchor !== state.selection.anchor || newSel.head !== state.selection.head;
  const storedMarks = tr.storedMarks !== undefined ? tr.storedMarks : (moved ? null : state.storedMarks);

  return {
    ...state,
    doc: newDoc,
    selection: newSel,
    storedMarks,
  };
}

/** Block types whose content is text: a caret belongs inside them, never beside them. */
const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock']);

/**
 * A collapsed caret on a boundary between the doc's children, next to a textblock, moves inside it.
 * Deleting everything (select-all, Backspace) leaves the caret at 0 — before the paragraph, not in
 * it — so without this the next letter is inserted at the doc level and normalized into a paragraph
 * of its own: Ctrl+A, Backspace, «Abc» would give <p>bc</p><p>A</p>. resolvePos cannot tell: it resolves 0
 * as inside the first child, while an insertion at 0 lands beside it.
 */
function caretIntoTextblock(doc: DocNode, sel: Selection): Selection {
  if (sel.type !== 'text' || sel.anchor !== sel.head) return sel;
  let offset = 0;
  for (const child of doc.content) {
    if (sel.anchor === offset) return TEXTBLOCKS.has(child.type) ? createSelection(offset + 1) : sel;
    offset += nodeSize(child);
    if (offset > sel.anchor) return sel;
  }
  // At the very end: into the last block, if it takes text.
  const last = doc.content[doc.content.length - 1];
  if (sel.anchor === offset && last && TEXTBLOCKS.has(last.type)) return createSelection(offset - 1);
  return sel;
}

/** Find the first editable (text) position after `pos` in the new doc.
 *  Walks the tree content-relative and finds the next text node start. */
function findFirstEditableAfter(doc: DocNode, pos: Pos): Pos {
  const walk = (node: DocNode, base: number): number | null => {
    for (const child of node.content) {
      const size = nodeSize(child);
      const childEnd = base + size;
      if (base > pos) {
        // This child is after the split point
        if (isText(child)) return base;
        // Element: first content position
        return findInner(child, base + 1);
      }
      if (childEnd > pos && !isText(child)) {
        // Recurse
        const inner = walk(child, base + 1);
        if (inner !== null) return inner;
      }
      base += size;
    }
    return null;
  };

  const findInner = (node: DocNode, base: number): number => {
    for (const child of node.content) {
      if (isText(child)) return base;
      return findInner(child, base + 1);
    }
    return base; // empty block
  };

  const result = walk(doc, 0);
  return result ?? pos + 2; // fallback
}

/** Create a transaction for a state */
export function createTransaction(state: EditorStateRef): EditorTransaction {
  return new EditorTransaction(state);
}

// ── Helpers ───────────────────────────────────────────────────────

function mergeExtensionSchema(base: Schema, extensions: readonly Extension[]): Schema {
  const nodes: Record<string, NodeSpec> = { ...base.spec.nodes };
  const marks: Record<string, MarkSpec> = { ...base.spec.marks };

  for (const ext of extensions) {
    if (ext.nodes) Object.assign(nodes, ext.nodes);
    if (ext.marks) Object.assign(marks, ext.marks);
  }

  // Only recompile if extensions added new types
  const baseNodeCount = Object.keys(base.spec.nodes).length;
  const baseMarkCount = Object.keys(base.spec.marks ?? {}).length;
  if (Object.keys(nodes).length === baseNodeCount && Object.keys(marks).length === baseMarkCount) {
    return base;
  }

  return defineSchema({ nodes, marks });
}

function createExtensionContext(
  schema: Schema,
  getState: () => EditorState,
  dispatch: (tr: EditorTransaction) => void,
) {
  return {
    schema,
    getState,
    dispatch: dispatch as any,
    getEditorElement: () => null,
  };
}
