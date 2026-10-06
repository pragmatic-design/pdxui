// walkNode reports the positions every other part of pdx-rich-text uses.
//
// It visits the root's children at the root's position, since the doc has no open tag: the text of
// the first paragraph starts at 1 for resolvePos and every command, and walkNode must report 1, not 2.
// marksAtSelection compares those positions with a range's, so one past would make it count, over
// «Y» in ab·X·Yc (X bold), the bold X ending where the range starts, and the toolbar would show Bold
// pressed over plain text.
import { describe, it, expect, afterEach } from 'vitest';
import { createNode, createText, resolvePos, walkNode, walkText, textAt } from '../../src/rich-text/model/node';
import { createMark } from '../../src/rich-text/model/mark';
import { createSelection, marksAtSelection } from '../../src/rich-text/model/selection';
import { EditorView } from '../../src/rich-text/view/view';
import { StarterKit } from '../../src/rich-text/extensions/starter-kit';
import { renderToolbar, parseToolbarConfig, updateToolbarState } from '../../src/rich-text/toolbar/toolbar';
import type { DocNode } from '../../src/rich-text/model/types';

const bold = createMark('bold');
const docOf = (...children: DocNode[]): DocNode => createNode('doc', {}, children);
/** ab·X·Yc with X bold. Positions: the paragraph opens at 0; «ab» is [1,3), «X» [3,4), «Yc» [4,6). */
const abXYc = (): DocNode => docOf(createNode('paragraph', {}, [createText('ab'), createText('X', [bold]), createText('Yc')]));
const types = (marks: readonly { type: string }[]): string[] => marks.map(m => m.type);

afterEach(() => { document.body.innerHTML = ''; document.getSelection()?.removeAllRanges(); });

describe('walkNode — model positions', () => {
    it('the first paragraph\'s text is visited at 1, where resolvePos resolves into it', () => {
        const doc = docOf(createNode('paragraph', {}, [createText('abc')]));
        const seen: Array<[string, number]> = [];
        walkNode(doc, (node, pos) => { seen.push([node.type === 'text' ? node.text! : node.type, pos]); });
        expect(seen).toEqual([['doc', 0], ['paragraph', 0], ['abc', 1]]);
        const at = resolvePos(doc, 1);
        expect(at.parent.type).toBe('paragraph');
        expect(at.parent.content[at.index].text).toBe('abc');
    });

    it('a second block starts after the first one\'s size', () => {
        const doc = docOf(createNode('paragraph', {}, [createText('ab')]), createNode('paragraph', {}, [createText('cd')]));
        const texts: Array<[string, number]> = [];
        walkText(doc, (text, pos) => { texts.push([text, pos]); });
        expect(texts).toEqual([['ab', 1], ['cd', 5]]);
    });

    it('textAt reads the text at a model position', () => {
        const doc = abXYc();
        expect(textAt(doc, 1, 2)).toBe('ab');
        expect(textAt(doc, 3, 1)).toBe('X');
        expect(textAt(doc, 4, 2)).toBe('Yc');
    });
});

describe('marksAtSelection — a range', () => {
    it('over «Y» it is plain: the bold X before it is not counted', () => {
        expect(types(marksAtSelection(abXYc(), createSelection(4, 5)))).toEqual([]);
    });

    it('over «X» it is bold', () => {
        expect(types(marksAtSelection(abXYc(), createSelection(3, 4)))).toEqual(['bold']);
    });

    it('over «bXY» it is the intersection: none', () => {
        expect(types(marksAtSelection(abXYc(), createSelection(2, 5)))).toEqual([]);
    });

    it('over the first letter of a later text node, that node is counted', () => {
        // «X» alone starts where «ab» ends; a range [3,4) must see X, not stop short of it.
        const doc = docOf(createNode('paragraph', {}, [createText('ab', [bold]), createText('X', [bold, createMark('italic')])]));
        expect(types(marksAtSelection(doc, createSelection(3, 4)))).toEqual(['bold', 'italic']);
    });

    it('the control: a collapsed caret keeps the marks of the letter before it', () => {
        expect(types(marksAtSelection(abXYc(), createSelection(4)))).toEqual(['bold']);
        expect(types(marksAtSelection(abXYc(), createSelection(2)))).toEqual([]);
    });
});

describe('the toolbar over a range', () => {
    it('Bold is not pressed over plain text that follows bold text', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);
        const view = new EditorView({ element, doc: abXYc(), extensions: [StarterKit], selection: createSelection(4, 5) });
        const bar = document.createElement('div');
        renderToolbar(parseToolbarConfig('bold'), view, bar);
        updateToolbarState(bar, view.state);
        expect(bar.querySelector('[data-command="toggleBold"]')!.getAttribute('aria-pressed')).toBe('false');
    });
});
