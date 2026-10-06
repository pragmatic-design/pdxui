import { describe, it, expect } from 'vitest';
import { createNode, createText } from '../../src/rich-text/model/node';
import { outdentListItemAt, wrapInBulletList } from '../../src/rich-text/commands/list';
import { createSelection, selFrom } from '../../src/rich-text/model/selection';
import { createEditorState, applyTransaction } from '../../src/rich-text/state/state';

const para = (txt: string) => createNode('paragraph', {}, [createText(txt)]);
const item = (txt: string) => createNode('listItem', {}, [para(txt)]);
const list = (...items: any[]) => createNode('bulletList', {}, items);
const docOf = (...children: any[]) => createNode('doc', {}, children);

describe('rich-text outdentListItemAt (backspace at start of list item)', () => {
  it('outdents a single-item list to a plain paragraph', () => {
    const doc = docOf(list(item('abc')));
    // pos 3 = start of the item's paragraph content
    const r = outdentListItemAt(doc, 3);
    expect(r).not.toBeNull();
    expect(r!.doc.content.length).toBe(1);
    expect(r!.doc.content[0].type).toBe('paragraph');
    expect(r!.doc.content[0].content[0].text).toBe('abc');
    expect(r!.selPos).toBe(1);
  });

  it('splits the list when outdenting a middle item', () => {
    const doc = docOf(list(item('a'), item('b'), item('c')));
    // pos 8 = start of the second item's content
    const r = outdentListItemAt(doc, 8);
    expect(r).not.toBeNull();
    const c = r!.doc.content;
    expect(c.map((n: any) => n.type)).toEqual(['bulletList', 'paragraph', 'bulletList']);
    expect(c[0].content.length).toBe(1);        // first list keeps item 'a'
    expect(c[1].content[0].text).toBe('b');     // middle item became a paragraph
    expect(c[2].content.length).toBe(1);        // last list keeps item 'c'
    expect(r!.selPos).toBe(8);
  });

  it('outdents the first item, leaving the rest as a list', () => {
    const doc = docOf(list(item('a'), item('b')));
    const r = outdentListItemAt(doc, 3);
    expect(r).not.toBeNull();
    const c = r!.doc.content;
    expect(c.map((n: any) => n.type)).toEqual(['paragraph', 'bulletList']);
    expect(c[0].content[0].text).toBe('a');
    expect(c[1].content.length).toBe(1);
    expect(r!.selPos).toBe(1);
  });

  it('returns null when the cursor is NOT at the item start (mid-text)', () => {
    const doc = docOf(list(item('abc')));
    expect(outdentListItemAt(doc, 4)).toBeNull(); // between a|bc
    expect(outdentListItemAt(doc, 5)).toBeNull();
  });

  it('returns null when there is no list at the cursor', () => {
    const doc = docOf(para('hello'));
    expect(outdentListItemAt(doc, 1)).toBeNull();
  });
});

describe('rich-text wrapInBulletList cursor remap', () => {
  it('keeps the cursor at the end of the text after wrapping (no split desync)', () => {
    // doc { paragraph { "Primo" } }, cursor after 'o' (pos 6)
    const state = createEditorState({ doc: docOf(para('Primo')), selection: createSelection(6) });
    let captured: any = null;
    wrapInBulletList()(state, (tr) => { captured = tr; });
    expect(captured).not.toBeNull();
    const next = applyTransaction(state, captured);
    // After wrap, "Primo" lives at bulletList>listItem>paragraph; end of text is pos 8 (+2).
    expect(next.doc.content[0].type).toBe('bulletList');
    expect(selFrom(next.selection)).toBe(8);
  });
});
