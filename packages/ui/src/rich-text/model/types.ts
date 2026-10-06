// ── Rich Text Core Types ──────────────────────────────────────────
// Immutable document model with offset-based positions (ProseMirror-proven approach).

/** Attribute map for nodes and marks */
export type Attrs = Readonly<Record<string, unknown>>;

/** A mark (inline formatting) applied to text */
export interface Mark {
  readonly type: string;
  readonly attrs: Attrs;
}

/** An immutable document node */
export interface DocNode {
  readonly type: string;
  readonly attrs: Attrs;
  readonly content: readonly DocNode[];
  readonly marks: readonly Mark[];
  readonly text?: string;
}

/** Offset position in flattened document token stream */
export type Pos = number;

/** Selection types */
export type SelectionType = 'text' | 'node' | 'block' | 'all';

/** A selection range in the document */
export interface Selection {
  readonly anchor: Pos;
  readonly head: Pos;
  readonly type: SelectionType;
}

/** Result of resolving a position to its context */
export interface ResolvedPos {
  readonly pos: Pos;
  readonly depth: number;
  readonly parent: DocNode;
  readonly parentOffset: number;
  readonly index: number;       // child index within parent
  readonly textOffset: number;  // offset within text node (0 for element nodes)
  readonly path: readonly PosPathEntry[];
}

export interface PosPathEntry {
  readonly node: DocNode;
  readonly index: number;
  readonly offset: Pos;  // start offset of this node in the document
}

/** A contiguous slice of document content */
export interface Slice {
  readonly content: readonly DocNode[];
  readonly openStart: number;  // depth of open nesting at start
  readonly openEnd: number;    // depth of open nesting at end
}

/** Result of applying a step */
export interface StepResult {
  readonly doc: DocNode | null;
  readonly failed: string | null;
}

/** Position mapping direction */
export type MapDir = -1 | 1;

/** Command function signature */
export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

// Forward references (avoid circular imports)
export interface EditorState {
  readonly doc: DocNode;
  readonly selection: Selection;
  readonly schema: unknown;
}

export interface Transaction {
  readonly doc: DocNode;
  readonly selection: Selection;
  readonly steps: readonly unknown[];
  readonly meta: ReadonlyMap<string, unknown>;
}
