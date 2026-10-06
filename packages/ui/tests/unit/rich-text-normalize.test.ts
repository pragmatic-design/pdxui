import { describe, it, expect } from 'vitest';
import { createNode, createText, isText } from '../../src/rich-text/model/node';
import { defaultSchema } from '../../src/rich-text/model/schema';
import { normalizeDoc } from '../../src/rich-text/model/normalize';
import { createEditorState, createTransaction, applyTransaction } from '../../src/rich-text/state/state';

/** Invariant: no TEXT node may be a direct child of a block container
 *  (doc, blockquote, list, listItem). Text must live inside a textblock. */
function textNeverBareUnderContainer(doc: any): boolean {
  const CONTAINER = new Set(['doc', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem']);
  let ok = true;
  const walk = (node: any) => {
    if (isText(node)) return;
    if (CONTAINER.has(node.type)) {
      for (const c of node.content) if (isText(c)) ok = false;
    }
    for (const c of node.content) walk(c);
  };
  walk(doc);
  return ok;
}

describe('rich-text normalizeDoc', () => {
  it('wraps text sitting directly under doc into a paragraph', () => {
    // The malformed tree the engine produced after select-all+delete then typing.
    const malformed = createNode('doc', {}, [createText('Primo')]);
    expect(textNeverBareUnderContainer(malformed)).toBe(false); // red precondition

    const fixed = normalizeDoc(malformed, defaultSchema);
    expect(textNeverBareUnderContainer(fixed)).toBe(true);
    expect(fixed.content[0].type).toBe('paragraph');
    expect(fixed.content[0].content[0].text).toBe('Primo');
  });

  it('keeps an empty paragraph for an empty doc', () => {
    const empty = createNode('doc', {}, []);
    const fixed = normalizeDoc(empty, defaultSchema);
    expect(fixed.content.length).toBe(1);
    expect(fixed.content[0].type).toBe('paragraph');
  });

  it('wraps stray text inside a blockquote', () => {
    const bq = createNode('doc', {}, [createNode('blockquote', {}, [createText('quoted')])]);
    const fixed = normalizeDoc(bq, defaultSchema);
    const quote = fixed.content[0];
    expect(quote.type).toBe('blockquote');
    expect(quote.content[0].type).toBe('paragraph');
    expect(textNeverBareUnderContainer(fixed)).toBe(true);
  });

  it('leaves a valid document structurally intact', () => {
    const valid = createNode('doc', {}, [
      createNode('paragraph', {}, [createText('a')]),
      createNode('blockquote', {}, [createNode('paragraph', {}, [createText('b')])]),
    ]);
    const fixed = normalizeDoc(valid, defaultSchema);
    expect(fixed.content.length).toBe(2);
    expect(fixed.content[0].content[0].text).toBe('a');
    expect(fixed.content[1].content[0].type).toBe('paragraph');
  });

  it('select-all delete then re-apply never yields a bare/empty doc', () => {
    let state = createEditorState();
    // type "Primo"
    let tr = createTransaction(state);
    tr.insertText('Primo');
    state = applyTransaction(state, tr);
    expect(textNeverBareUnderContainer(state.doc)).toBe(true);

    // select all + delete
    tr = createTransaction(state);
    tr.delete(0, state.doc.content.reduce((s: number, c: any) => s + (isText(c) ? c.text.length : nodeSizeApprox(c)), 0));
    state = applyTransaction(state, tr);
    // doc must still hold a paragraph, never bare text or nothing
    expect(textNeverBareUnderContainer(state.doc)).toBe(true);
    expect(state.doc.content.length).toBeGreaterThan(0);
  });
});

function nodeSizeApprox(node: any): number {
  if (isText(node)) return node.text.length;
  if (node.content.length === 0) return 1;
  let s = 2;
  for (const c of node.content) s += nodeSizeApprox(c);
  return s;
}
