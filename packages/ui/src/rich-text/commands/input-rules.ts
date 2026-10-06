// ── Input Rules ───────────────────────────────────────────────────
// Auto-replace patterns triggered by typing. Markdown shortcuts.
// Each rule matches text before cursor + the just-typed character.

import type { InputRule, Extension } from '../state/plugin.js';
import { createNode, createText, nodeSize, isText } from '../model/node.js';
import type { DocNode } from '../model/types.js';

/** Standard markdown-like input rules */
export function markdownInputRules(): InputRule[] {
  return [
    // # → H1, ## → H2, ### → H3, etc.
    {
      pattern: /^(#{1,6})\s$/,
      handler: (state, match, from, _to) => {
        const level = match[1].length;
        return (tr) => {
          const result = transformBlock(state.doc, from, match[0].length, (text) => {
            return {
              node: createNode('heading', { level }, text ? [createText(text)] : [createText('')]),
              cursorOffset: 1 + text.length,
            };
          });
          tr.setMeta('replaceDoc', result.doc);
          tr.setMeta('historySel', { anchor: result.cursor, head: result.cursor, type: 'text' as const });
        };
      },
    },

    // > → blockquote
    {
      pattern: /^>\s$/,
      handler: (state, match, from, _to) => {
        return (tr) => {
          const result = transformBlock(state.doc, from, match[0].length, (text) => {
            const innerP = createNode('paragraph', {}, text ? [createText(text)] : [createText('')]);
            return { node: createNode('blockquote', {}, [innerP]), cursorOffset: 2 + text.length };
          });
          tr.setMeta('replaceDoc', result.doc);
          tr.setMeta('historySel', { anchor: result.cursor, head: result.cursor, type: 'text' as const });
        };
      },
    },

    // - or * → bullet list
    {
      pattern: /^[-*]\s$/,
      handler: (state, match, from, _to) => {
        return (tr) => {
          const result = transformBlock(state.doc, from, match[0].length, (text) => {
            const innerP = createNode('paragraph', {}, text ? [createText(text)] : [createText('')]);
            return { node: createNode('bulletList', {}, [createNode('listItem', {}, [innerP])]), cursorOffset: 3 + text.length };
          });
          tr.setMeta('replaceDoc', result.doc);
          tr.setMeta('historySel', { anchor: result.cursor, head: result.cursor, type: 'text' as const });
        };
      },
    },

    // 1. → ordered list
    {
      pattern: /^(\d+)\.\s$/,
      handler: (state, match, from, _to) => {
        const start = parseInt(match[1], 10);
        return (tr) => {
          const result = transformBlock(state.doc, from, match[0].length, (text) => {
            const innerP = createNode('paragraph', {}, text ? [createText(text)] : [createText('')]);
            return { node: createNode('orderedList', { start }, [createNode('listItem', {}, [innerP])]), cursorOffset: 3 + text.length };
          });
          tr.setMeta('replaceDoc', result.doc);
          tr.setMeta('historySel', { anchor: result.cursor, head: result.cursor, type: 'text' as const });
        };
      },
    },

    // --- → horizontal rule
    {
      pattern: /^---$/,
      handler: (state, _match, from, _to) => {
        return (tr) => {
          const doc = state.doc;
          let offset = 0;
          const newChildren: DocNode[] = [];
          let cursorPos = 1;
          for (const child of doc.content) {
            const size = nodeSize(child);
            const childEnd = offset + size;
            if (from >= offset && from < childEnd && child.type === 'paragraph') {
              newChildren.push(createNode('horizontalRule'));
              const emptyP = createNode('paragraph', {}, [createText('')]);
              cursorPos = offset + 1 + 1; // after HR + inside new paragraph
              newChildren.push(emptyP);
            } else {
              newChildren.push(child);
            }
            offset = childEnd;
          }
          tr.setMeta('replaceDoc', createNode(doc.type, doc.attrs, newChildren, doc.marks));
          tr.setMeta('historySel', { anchor: cursorPos, head: cursorPos, type: 'text' as const });
        };
      },
    },
  ];
}

/** Helper: find paragraph at `from` (recursively), strip prefix, transform into new node.
 *  Returns a new doc with the paragraph replaced and the cursor position. */
function transformBlock(
  doc: DocNode, from: number, prefixLen: number,
  transform: (remainingText: string) => { node: DocNode; cursorOffset: number },
): { doc: DocNode; cursor: number } {
  const result = transformBlockInner(doc, from, prefixLen, transform, 0);
  return { doc: result.node, cursor: result.cursor };
}

function transformBlockInner(
  node: DocNode, from: number, prefixLen: number,
  transform: (remainingText: string) => { node: DocNode; cursorOffset: number },
  baseOffset: number,
): { node: DocNode; cursor: number; found: boolean } {
  let offset = 0;
  const newChildren: DocNode[] = [];
  let cursor = 1;
  let found = false;

  for (const child of node.content) {
    const size = nodeSize(child);
    const childEnd = offset + size;
    const absStart = baseOffset + offset;
    const absEnd = baseOffset + childEnd;

    if (!found && from >= absStart && from < absEnd) {
      if (child.type === 'paragraph') {
        // Found the paragraph — transform it
        const text = child.content.map(c => c.text ?? '').join('').slice(prefixLen);
        const { node: newNode, cursorOffset } = transform(text);
        cursor = absStart + cursorOffset;
        newChildren.push(newNode);
        found = true;
      } else if (!isText(child) && child.content.length > 0) {
        // Recurse into wrapper blocks (blockquote, list, etc.)
        const inner = transformBlockInner(child, from, prefixLen, transform, absStart + 1);
        if (inner.found) {
          newChildren.push(inner.node);
          cursor = inner.cursor;
          found = true;
        } else {
          newChildren.push(child);
        }
      } else {
        newChildren.push(child);
      }
    } else {
      newChildren.push(child);
    }
    offset = childEnd;
  }

  return {
    node: createNode(node.type, node.attrs, newChildren, node.marks),
    cursor,
    found,
  };
}

/** Input rules extension */
export const MarkdownShortcuts: Extension = {
  name: 'markdownShortcuts',
  inputRules: () => markdownInputRules(),
};
