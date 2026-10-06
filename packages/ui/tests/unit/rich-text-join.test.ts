import { describe, it, expect } from 'vitest';
import { createNode, createText, nodeSize } from '../../src/rich-text/model/node';
import { joinBlockAfterContainer } from '../../src/rich-text/commands/join';

const para = (txt: string) => createNode('paragraph', {}, [createText(txt)]);
const item = (txt: string) => createNode('listItem', {}, [para(txt)]);
const list = (...items: any[]) => createNode('bulletList', {}, items);
const docOf = (...children: any[]) => createNode('doc', {}, children);

// Cursor position at the start of the top-level block at index `i`.
function startOfBlock(doc: any, i: number): number {
  let off = 0;
  for (let k = 0; k < i; k++) off += nodeSize(doc.content[k]);
  return off + 1;
}

describe('rich-text joinBlockAfterContainer (backspace at start of block after a list)', () => {
  it('merges an empty trailing paragraph into the last list item, cursor at its end', () => {
    const doc = docOf(list(item('Primo'), item('Secondo')), para(''));
    const pos = startOfBlock(doc, 1); // start of the trailing paragraph
    const r = joinBlockAfterContainer(doc, pos);
    expect(r).not.toBeNull();
    // trailing paragraph absorbed → only the list remains, still 2 items
    expect(r!.doc.content.map((n: any) => n.type)).toEqual(['bulletList']);
    expect(r!.doc.content[0].content.length).toBe(2);
    // cursor sits at the end of "Secondo" (pos 19 in this tree)
    expect(r!.selPos).toBe(19);
  });

  it('merges a trailing paragraph WITH text into the last list item', () => {
    const doc = docOf(list(item('Primo'), item('Secondo')), para('Tail'));
    const pos = startOfBlock(doc, 1);
    const r = joinBlockAfterContainer(doc, pos);
    expect(r).not.toBeNull();
    const lastItemText = r!.doc.content[0].content[1].content[0].content
      .map((t: any) => t.text).join('');
    expect(lastItemText).toBe('SecondoTail');
  });

  it('merges into a blockquote\'s last paragraph', () => {
    const doc = docOf(createNode('blockquote', {}, [para('Quote')]), para('after'));
    const pos = startOfBlock(doc, 1);
    const r = joinBlockAfterContainer(doc, pos);
    expect(r).not.toBeNull();
    expect(r!.doc.content.map((n: any) => n.type)).toEqual(['blockquote']);
    const merged = r!.doc.content[0].content[0].content.map((t: any) => t.text).join('');
    expect(merged).toBe('Quoteafter');
  });

  it('returns null between two plain paragraphs (handled elsewhere)', () => {
    const doc = docOf(para('a'), para('b'));
    expect(joinBlockAfterContainer(doc, startOfBlock(doc, 1))).toBeNull();
  });

  it('returns null when the cursor is not at the block start', () => {
    const doc = docOf(list(item('Primo')), para('xx'));
    const pos = startOfBlock(doc, 1) + 1; // mid-text
    expect(joinBlockAfterContainer(doc, pos)).toBeNull();
  });
});
