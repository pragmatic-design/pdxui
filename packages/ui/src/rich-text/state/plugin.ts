// ── Plugin / Extension Interface ──────────────────────────────────
// Extensions add nodes, marks, commands, key bindings, and view behavior.

import type { Attrs, DocNode, Mark, Pos, Selection } from '../model/types.js';
import type { Schema, NodeSpec, MarkSpec } from '../model/schema.js';

/** Command function: returns true if applicable, dispatches if dispatch is provided */
export type CommandFn = (
  state: EditorStateRef,
  dispatch?: (tr: TransactionRef) => void,
) => boolean;

/** Simplified references to avoid circular deps */
export interface EditorStateRef {
  readonly doc: DocNode;
  readonly selection: Selection;
  readonly schema: Schema;
  /** Marks the next typed text takes at a collapsed caret, or null (see EditorState). */
  readonly storedMarks?: readonly Mark[] | null;
}

export interface TransactionRef {
  readonly doc: DocNode;
  readonly selection: Selection;
  insertText(text: string, pos: Pos): TransactionRef;
  delete(from: Pos, to: Pos): TransactionRef;
  addMark(from: Pos, to: Pos, mark: Mark): TransactionRef;
  removeMark(from: Pos, to: Pos, mark: Mark): TransactionRef;
  setNodeAttrs(pos: Pos, attrs: Attrs): TransactionRef;
  setSelection(sel: Selection): TransactionRef;
  setMeta(key: string, value: unknown): TransactionRef;
}

/** Input rule: pattern + handler */
export interface InputRule {
  /** Regex to match against text before cursor (must end with $) */
  pattern: RegExp;
  /** Handler: return replacement text, or null to skip */
  handler: (
    state: EditorStateRef,
    match: RegExpMatchArray,
    from: Pos,
    to: Pos,
  ) => ((tr: TransactionRef) => void) | null;
}

/** Key binding map */
export type Keymap = Record<string, CommandFn>;

/** Decoration types — reuse the real discriminated union from the view layer.
 *  Type-only import: no runtime cycle (view/decoration only pulls model types). */
export type { Decoration } from '../view/decoration.js';
import type { Decoration } from '../view/decoration.js';

export type DecorationSet = readonly Decoration[];

/** The Extension interface — the primary extension point */
export interface Extension {
  readonly name: string;

  /** Node type contributions */
  nodes?: Record<string, NodeSpec>;

  /** Mark type contributions */
  marks?: Record<string, MarkSpec>;

  /** Commands (keyed by command name) */
  commands?: (ctx: ExtensionContext) => Record<string, CommandFn>;

  /** Key bindings */
  keymap?: (ctx: ExtensionContext) => Keymap;

  /** Input rules (auto-replace patterns) */
  inputRules?: (ctx: ExtensionContext) => InputRule[];

  /** View lifecycle hooks */
  onInit?: (ctx: ExtensionContext) => void;
  onUpdate?: (ctx: ExtensionContext, prevState: EditorStateRef) => void;
  onDestroy?: (ctx: ExtensionContext) => void;

  /** Pure decorations (don't mutate document) */
  decorations?: (state: EditorStateRef) => DecorationSet;

  /** Extensions this depends on */
  dependencies?: Extension[];

  /** Priority (higher = runs first) */
  priority?: number;
}

/** Context passed to extension methods */
export interface ExtensionContext {
  readonly schema: Schema;
  getState(): EditorStateRef;
  dispatch(tr: TransactionRef): void;
  getEditorElement(): HTMLElement | null;
}

/** Bundle multiple extensions into one */
export function bundle(extensions: Extension[]): Extension {
  const nodes: Record<string, NodeSpec> = {};
  const marks: Record<string, MarkSpec> = {};
  const deps = new Set<Extension>();

  for (const ext of extensions) {
    if (ext.nodes) Object.assign(nodes, ext.nodes);
    if (ext.marks) Object.assign(marks, ext.marks);
    if (ext.dependencies) ext.dependencies.forEach(d => deps.add(d));
  }

  return {
    name: 'bundle',
    nodes: Object.keys(nodes).length > 0 ? nodes : undefined,
    marks: Object.keys(marks).length > 0 ? marks : undefined,

    commands(ctx) {
      const cmds: Record<string, CommandFn> = {};
      for (const ext of extensions) {
        if (ext.commands) Object.assign(cmds, ext.commands(ctx));
      }
      return cmds;
    },

    keymap(ctx) {
      const km: Keymap = {};
      for (const ext of extensions) {
        if (ext.keymap) Object.assign(km, ext.keymap(ctx));
      }
      return km;
    },

    inputRules(ctx) {
      const rules: InputRule[] = [];
      for (const ext of extensions) {
        if (ext.inputRules) rules.push(...ext.inputRules(ctx));
      }
      return rules;
    },

    onInit(ctx) {
      for (const ext of extensions) ext.onInit?.(ctx);
    },

    onUpdate(ctx, prev) {
      for (const ext of extensions) ext.onUpdate?.(ctx, prev);
    },

    onDestroy(ctx) {
      for (const ext of extensions) ext.onDestroy?.(ctx);
    },

    decorations(state) {
      const all: Decoration[] = [];
      for (const ext of extensions) {
        if (ext.decorations) all.push(...ext.decorations(state));
      }
      return all;
    },

    dependencies: [...deps],
  };
}

/** Resolve extension dependencies (topological sort) */
export function resolveExtensions(extensions: Extension[]): Extension[] {
  const seen = new Set<string>();
  const result: Extension[] = [];

  function visit(ext: Extension) {
    if (seen.has(ext.name)) return;
    seen.add(ext.name);
    if (ext.dependencies) {
      for (const dep of ext.dependencies) visit(dep);
    }
    result.push(ext);
  }

  // Sort by priority (higher first)
  const sorted = [...extensions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const ext of sorted) visit(ext);
  return result;
}
