// pdx-rich-text lets Tab and Shift+Tab leave the editing area.
//
// Tab keeps its default unless a list command actually applied: a keydown handler that called
// preventDefault on every Tab would leave a keyboard user who tabbed into the text unable to tab
// out of it (WCAG 2.1.2, No Keyboard Trap).
import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from '../../src/rich-text/view/view';
import { StarterKit } from '../../src/rich-text/extensions/starter-kit';
import { createNode, createText } from '../../src/rich-text/model/node';
import { createSelection } from '../../src/rich-text/model/selection';
import type { DocNode } from '../../src/rich-text/model/types';

const para = (txt: string): DocNode => createNode('paragraph', {}, [createText(txt)]);
const item = (txt: string): DocNode => createNode('listItem', {}, [para(txt)]);
const list = (...items: DocNode[]): DocNode => createNode('bulletList', {}, items);
const docOf = (...children: DocNode[]): DocNode => createNode('doc', {}, children);

function viewWith(doc: DocNode, caret: number): EditorView {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return new EditorView({ element, doc, extensions: [StarterKit], selection: createSelection(caret) });
}

/** Press Tab on the editing area, through the view's own keydown listener. */
function tab(view: EditorView, shiftKey = false): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(e);
    return e;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-rich-text — Tab is not a keyboard trap', () => {
    it('Tab in a plain paragraph keeps its default: focus can move on', () => {
        const view = viewWith(docOf(para('Hello world')), 3);
        const before = view.state.doc;
        expect(tab(view).defaultPrevented, 'Tab was swallowed outside any list').toBe(false);
        expect(view.state.doc).toBe(before);
    });

    it('Shift+Tab in a plain paragraph keeps its default: focus can move back to the toolbar', () => {
        const view = viewWith(docOf(para('Hello world')), 3);
        expect(tab(view, true).defaultPrevented, 'Shift+Tab was swallowed outside any list').toBe(false);
    });

    it('Tab in a list item that cannot be indented keeps its default too', () => {
        // The first item has no previous sibling to nest into, so Tab has nothing to do
        // there; swallowing it would be the same trap.
        const view = viewWith(docOf(list(item('a'), item('b'))), 3);
        expect(tab(view).defaultPrevented).toBe(false);
    });

    it('the control: Shift+Tab in a list item is still handled — the item is lifted and focus stays', () => {
        const view = viewWith(docOf(list(item('a'), item('b'))), 8);
        expect(tab(view, true).defaultPrevented).toBe(true);
        expect(view.state.doc.content.map(n => n.type)).toEqual(['bulletList', 'paragraph']);
    });
});
