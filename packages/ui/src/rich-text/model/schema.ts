// ── Schema Definition & Validation ────────────────────────────────
// Declarative schema that defines valid document structure.
// Content expressions: 'block+', 'inline*', '(paragraph | heading)+', etc.

import type { Attrs, DocNode, Mark } from './types.js';

// ── Schema Spec (user-facing) ─────────────────────────────────────

export interface NodeSpec {
  /** Content expression: 'block+', 'inline*', 'listItem+', 'text*', etc. */
  content?: string;
  /** Group this node belongs to: 'block', 'inline' */
  group?: string;
  /** Whether this is an inline node */
  inline?: boolean;
  /** Attribute definitions */
  attrs?: Record<string, AttrSpec>;
  /** Which marks are allowed: '_all', 'bold italic', '' (none) */
  marks?: string;
  /** DOM parse rules (for clipboard paste) */
  parseDOM?: ParseRule[];
  /** How to render to DOM: ['tag', attrs?, content-hole(0)?] */
  toDOM?: (node: DocNode) => DOMOutputSpec;
  /** Whether the node is a leaf (no editable content) */
  leaf?: boolean;
  /** Whether the node is an atom (treated as single unit for selection) */
  atom?: boolean;
  /** Whether the node defines an isolating boundary (cursor cannot exit via arrow keys) */
  isolating?: boolean;
}

export interface MarkSpec {
  attrs?: Record<string, AttrSpec>;
  /** Whether typing at mark boundary extends the mark */
  inclusive?: boolean;
  /** Marks this excludes: '_all', 'bold italic', '' (none) */
  excludes?: string;
  /** Group for exclusion rules */
  group?: string;
  parseDOM?: ParseRule[];
  toDOM?: (mark: Mark) => DOMOutputSpec;
}

export interface AttrSpec {
  default?: unknown;
  validate?: (value: unknown) => boolean;
}

export interface ParseRule {
  tag?: string;
  style?: string;
  priority?: number;
  getAttrs?: (dom: HTMLElement | string) => Attrs | null | false;
}

export type DOMOutputSpec = string | [string, ...unknown[]];

export interface SchemaSpec {
  nodes: Record<string, NodeSpec>;
  marks?: Record<string, MarkSpec>;
}

// ── Compiled Schema ───────────────────────────────────────────────

export interface Schema {
  readonly spec: SchemaSpec;
  readonly nodes: ReadonlyMap<string, CompiledNodeType>;
  readonly marks: ReadonlyMap<string, CompiledMarkType>;
  readonly topNodeType: CompiledNodeType;
}

export interface CompiledNodeType {
  readonly name: string;
  readonly spec: NodeSpec;
  readonly groups: readonly string[];
  readonly inline: boolean;
  readonly isBlock: boolean;
  readonly isText: boolean;
  readonly isLeaf: boolean;
  readonly isAtom: boolean;
  readonly contentMatch: ContentMatch;
  readonly allowedMarks: ReadonlySet<string> | null; // null = all allowed
  readonly defaultAttrs: Attrs;
}

export interface CompiledMarkType {
  readonly name: string;
  readonly spec: MarkSpec;
  readonly inclusive: boolean;
  readonly excludes: ReadonlySet<string>;
  readonly defaultAttrs: Attrs;
}

/** Compiled content expression match */
export interface ContentMatch {
  readonly expression: string;
  matchType(typeName: string, groups: readonly string[]): boolean;
  validContent(content: readonly DocNode[], schema: Schema): boolean;
}

// ── Schema Compilation ────────────────────────────────────────────

/** Define and compile a schema from spec */
export function defineSchema(spec: SchemaSpec): Schema {
  const nodes = new Map<string, CompiledNodeType>();
  const marks = new Map<string, CompiledMarkType>();

  // Compile marks first (needed for allowedMarks resolution)
  for (const [name, markSpec] of Object.entries(spec.marks ?? {})) {
    marks.set(name, compileMarkType(name, markSpec, spec.marks ?? {}));
  }

  // Compile nodes
  for (const [name, nodeSpec] of Object.entries(spec.nodes)) {
    nodes.set(name, compileNodeType(name, nodeSpec, marks));
  }

  const topType = nodes.get('doc');
  if (!topType) throw new Error('Schema must define a "doc" node type');

  return { spec, nodes, marks, topNodeType: topType };
}

function compileNodeType(
  name: string,
  spec: NodeSpec,
  _allMarks: ReadonlyMap<string, CompiledMarkType>,
): CompiledNodeType {
  const groups = spec.group ? spec.group.split(' ').filter(Boolean) : [];
  const inline = spec.inline ?? false;
  const isBlock = !inline && name !== 'text';
  const isLeaf = spec.leaf ?? (spec.content === undefined || spec.content === '');
  const isAtom = spec.atom ?? false;

  // Resolve allowed marks
  let allowedMarks: ReadonlySet<string> | null = null;
  if (spec.marks !== undefined) {
    if (spec.marks === '') {
      allowedMarks = new Set();
    } else if (spec.marks === '_all') {
      allowedMarks = null; // all
    } else {
      allowedMarks = new Set(spec.marks.split(' ').filter(Boolean));
    }
  }

  // Default attrs
  const defaultAttrs: Record<string, unknown> = {};
  if (spec.attrs) {
    for (const [attrName, attrSpec] of Object.entries(spec.attrs)) {
      if (attrSpec.default !== undefined) defaultAttrs[attrName] = attrSpec.default;
    }
  }

  return {
    name,
    spec,
    groups,
    inline,
    isBlock,
    isText: name === 'text',
    isLeaf,
    isAtom,
    contentMatch: compileContentMatch(spec.content ?? ''),
    allowedMarks,
    defaultAttrs: Object.freeze(defaultAttrs),
  };
}

function compileMarkType(
  name: string,
  spec: MarkSpec,
  allMarkSpecs: Record<string, MarkSpec>,
): CompiledMarkType {
  const inclusive = spec.inclusive !== false; // default true

  // Resolve excludes
  const excludes = new Set<string>();
  if (spec.excludes !== undefined) {
    if (spec.excludes === '_all') {
      for (const markName of Object.keys(allMarkSpecs)) excludes.add(markName);
    } else if (spec.excludes !== '') {
      for (const e of spec.excludes.split(' ').filter(Boolean)) excludes.add(e);
    }
  }

  // Default attrs
  const defaultAttrs: Record<string, unknown> = {};
  if (spec.attrs) {
    for (const [attrName, attrSpec] of Object.entries(spec.attrs)) {
      if (attrSpec.default !== undefined) defaultAttrs[attrName] = attrSpec.default;
    }
  }

  return { name, spec, inclusive, excludes, defaultAttrs: Object.freeze(defaultAttrs) };
}

// ── Content Expression Matching ───────────────────────────────────

/**
 * Compile a content expression string into a matcher.
 * Supports: 'block+', 'inline*', 'text*', 'paragraph+', 'listItem+',
 *           '(paragraph | heading)+', 'block*'
 * Quantifiers: + (one or more), * (zero or more), ? (optional), none (exactly one)
 */
function compileContentMatch(expr: string): ContentMatch {
  if (!expr) {
    return {
      expression: expr,
      matchType: () => false,
      validContent: (content) => content.length === 0,
    };
  }

  const parts = parseContentExpr(expr);

  return {
    expression: expr,

    matchType(typeName: string, groups: readonly string[]): boolean {
      return parts.some(part =>
        part.types.some(t => t === typeName || groups.includes(t)),
      );
    },

    validContent(content: readonly DocNode[], schema: Schema): boolean {
      return validateContent(parts, content, schema);
    },
  };
}

interface ContentPart {
  types: string[]; // type names or group names
  min: number;     // 0 for *, ?, 1 for +, none
  max: number;     // Infinity for +, *, 1 for ?, none
}

function parseContentExpr(expr: string): ContentPart[] {
  const parts: ContentPart[] = [];
  // Match patterns like: word+, word*, word?, (word | word)+, etc.
  const regex = /(?:\(([^)]+)\)|(\w+))([+*?])?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(expr)) !== null) {
    const groupContent = match[1]; // inside parentheses
    const singleType = match[2];  // single type name
    const quantifier = match[3];

    const types = groupContent
      ? groupContent.split('|').map(t => t.trim())
      : [singleType];

    let min = 1, max = 1;
    if (quantifier === '+') { min = 1; max = Infinity; }
    else if (quantifier === '*') { min = 0; max = Infinity; }
    else if (quantifier === '?') { min = 0; max = 1; }

    parts.push({ types, min, max });
  }

  return parts;
}

function validateContent(parts: ContentPart[], content: readonly DocNode[], schema: Schema): boolean {
  let contentIdx = 0;

  for (const part of parts) {
    let count = 0;
    while (contentIdx < content.length && count < part.max) {
      const child = content[contentIdx];
      const nodeType = schema.nodes.get(child.type);
      if (!nodeType) break;

      const matches = part.types.some(t =>
        t === child.type || nodeType.groups.includes(t),
      );
      if (!matches) break;

      count++;
      contentIdx++;
    }

    if (count < part.min) return false;
  }

  // All content should be consumed
  return contentIdx === content.length;
}

// ── Schema Utilities ──────────────────────────────────────────────

/** Check if a mark is allowed on a node type */
export function isMarkAllowed(schema: Schema, nodeTypeName: string, markType: string): boolean {
  const nodeType = schema.nodes.get(nodeTypeName);
  if (!nodeType) return false;
  if (nodeType.allowedMarks === null) return true; // all allowed
  return nodeType.allowedMarks.has(markType);
}

/** Get node type, throw if not in schema */
export function getNodeType(schema: Schema, name: string): CompiledNodeType {
  const type = schema.nodes.get(name);
  if (!type) throw new Error(`Unknown node type: ${name}`);
  return type;
}

/** Get mark type, throw if not in schema */
export function getMarkType(schema: Schema, name: string): CompiledMarkType {
  const type = schema.marks.get(name);
  if (!type) throw new Error(`Unknown mark type: ${name}`);
  return type;
}

/** Create a node with schema-validated default attrs */
export function createSchemaNode(schema: Schema, type: string, attrs?: Attrs, content?: readonly DocNode[], marks?: readonly Mark[]): DocNode {
  const nodeType = getNodeType(schema, type);
  const finalAttrs = { ...nodeType.defaultAttrs, ...attrs };
  return { type, attrs: Object.freeze(finalAttrs), content: content ?? [], marks: marks ?? [] };
}

// ── Default Schema ────────────────────────────────────────────────

/** The standard rich-text schema used by pdx-rich-text */
export const defaultSchema = defineSchema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', marks: '_all' },
    heading: {
      content: 'inline*', group: 'block', marks: '_all',
      attrs: { level: { default: 1, validate: (v) => typeof v === 'number' && v >= 1 && v <= 6 } },
    },
    blockquote: { content: 'block+', group: 'block' },
    codeBlock: {
      content: 'text*', group: 'block', marks: '',
      attrs: { language: { default: '' } },
    },
    bulletList: { content: 'listItem+', group: 'block' },
    orderedList: {
      content: 'listItem+', group: 'block',
      attrs: { start: { default: 1 } },
    },
    taskList: { content: 'taskItem+', group: 'block' },
    listItem: { content: 'paragraph block*' },
    taskItem: {
      content: 'paragraph block*',
      attrs: { checked: { default: false } },
    },
    table: { content: 'tableRow+', group: 'block', isolating: true },
    tableRow: { content: 'tableCell+' },
    tableCell: {
      content: 'block+', isolating: true,
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, header: { default: false } },
    },
    image: {
      group: 'block', leaf: true, atom: true,
      attrs: {
        src: { default: '' },
        alt: { default: '' },
        title: { default: '' },
        width: { default: null },
        align: { default: 'center' }, // left, center, right, full
        caption: { default: '' },
      },
    },
    horizontalRule: { group: 'block', leaf: true, atom: true },
    hardBreak: { group: 'inline', inline: true },
    text: { group: 'inline' },
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    strike: {},
    code: { excludes: '_all' },
    link: {
      attrs: { href: { default: '' }, title: { default: '' }, target: { default: '' } },
      inclusive: false,
    },
    highlight: { attrs: { color: { default: 'yellow' } } },
    textColor: { attrs: { color: { default: '' } } },
    subscript: { excludes: 'superscript' },
    superscript: { excludes: 'subscript' },
  },
});
