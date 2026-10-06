// ── JSON Serialization ────────────────────────────────────────────
// Native JSON format for pdx-rich-text documents.
// Compact: omits empty attrs/marks/content, text nodes are just {type:'text', text:'...'}

import type { Attrs, DocNode, Mark } from '../model/types.js';
import { createNode, createText } from '../model/node.js';
import { EMPTY_MARKS } from '../model/mark.js';

// ── Serialization ─────────────────────────────────────────────────

export interface JSONNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: JSONMark[];
  content?: JSONNode[];
}

export interface JSONMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Serialize a document node to JSON */
export function toJSON(node: DocNode): JSONNode {
  const json: JSONNode = { type: node.type };

  if (node.text !== undefined) json.text = node.text;

  if (Object.keys(node.attrs).length > 0) {
    json.attrs = { ...node.attrs };
  }

  if (node.marks.length > 0) {
    json.marks = node.marks.map(m => {
      const jm: JSONMark = { type: m.type };
      if (Object.keys(m.attrs).length > 0) jm.attrs = { ...m.attrs };
      return jm;
    });
  }

  if (node.content.length > 0) {
    json.content = node.content.map(toJSON);
  }

  return json;
}

/** Deserialize a JSON object to a document node */
export function fromJSON(json: JSONNode): DocNode {
  const marks: readonly Mark[] = json.marks
    ? json.marks.map(m => ({ type: m.type, attrs: Object.freeze(m.attrs ?? {}) }))
    : EMPTY_MARKS;

  if (json.type === 'text') {
    return createText(json.text ?? '', marks);
  }

  const content = json.content ? json.content.map(fromJSON) : [];
  const attrs: Attrs = json.attrs ? Object.freeze({ ...json.attrs }) : Object.freeze({});

  return createNode(json.type, attrs, content, marks);
}

/** Serialize document to JSON string */
export function toJSONString(node: DocNode, pretty = false): string {
  return JSON.stringify(toJSON(node), null, pretty ? 2 : undefined);
}

/** Deserialize JSON string to document */
export function fromJSONString(jsonStr: string): DocNode {
  return fromJSON(JSON.parse(jsonStr));
}

/** Validate JSON structure (basic structural check) */
export function validateJSON(json: unknown): json is JSONNode {
  if (!json || typeof json !== 'object') return false;
  const obj = json as Record<string, unknown>;
  if (typeof obj.type !== 'string') return false;
  if (obj.text !== undefined && typeof obj.text !== 'string') return false;
  if (obj.content !== undefined) {
    if (!Array.isArray(obj.content)) return false;
    for (const child of obj.content) {
      if (!validateJSON(child)) return false;
    }
  }
  if (obj.marks !== undefined) {
    if (!Array.isArray(obj.marks)) return false;
    for (const mark of obj.marks) {
      if (!mark || typeof mark !== 'object' || typeof (mark as any).type !== 'string') return false;
    }
  }
  return true;
}
