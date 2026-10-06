// The view writes the DOM selection after every transaction, and each write fires selectionchange.
// The view must not read its own write back as if the user had moved: removeAllRanges, addRange and
// extend are three steps, and the collapsed range between the second and the third would sync a
// collapsed model back, which syncs again — one Ctrl+A recursing until the stack runs out. An empty
// catch around the write would swallow the RangeError, and the selection left behind would depend on
// the frame where the stack ended: Ctrl+A, Backspace, «Abc» giving <p>Abcworld</p> intermittently.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorView } from '../../src/rich-text/view/view';
import { StarterKit } from '../../src/rich-text/extensions/starter-kit';
import { createNode, createText } from '../../src/rich-text/model/node';
import { createSelection } from '../../src/rich-text/model/selection';
import type { DocNode } from '../../src/rich-text/model/types';

const para = (txt: string): DocNode => createNode('paragraph', {}, [createText(txt)]);
const docOf = (...children: DocNode[]): DocNode => createNode('doc', {}, children);

function viewWith(doc: DocNode, anchor: number, onUpdate?: () => void): EditorView {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return new EditorView({ element, doc, extensions: [StarterKit], selection: createSelection(anchor), onUpdate });
}

function keydown(view: EditorView, key: string, mod = false): void {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: mod, bubbles: true, cancelable: true }));
}

function input(view: EditorView, inputType: string, data: string | null = null): void {
    const e = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'getTargetRanges', { value: () => [] });
    view.contentDOM.dispatchEvent(e);
}

function type(view: EditorView, text: string): void {
    for (const ch of text) {
        keydown(view, ch);
        input(view, 'insertText', ch);
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.getSelection()?.removeAllRanges();
});

describe('pdx-rich-text — the view does not read its own DOM selection write as a user move', () => {
    it('one Ctrl+A is one update, not a recursion through selectionchange', () => {
        let updates = 0;
        const view = viewWith(docOf(para('Hello'), para('world')), 3, () => { updates++; });
        updates = 0;
        keydown(view, 'a', true);
        expect(updates).toBe(1);
        expect(view.state.selection.head).toBe(14);
    });

    it('a DOM selection write that fails is reported, and the editor keeps its selection', () => {
        const view = viewWith(docOf(para('Hello'), para('world')), 3);
        const domSel = document.getSelection()!;
        // extend() is the step that leaves the DOM selection half-written: collapsed at the anchor.
        vi.spyOn(domSel, 'extend').mockImplementation(() => {
            throw new DOMException('extend failed', 'InvalidStateError');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        keydown(view, 'a', true);
        const selected = { anchor: view.state.selection.anchor, head: view.state.selection.head };
        expect(selected.head, 'Ctrl+A did not select to the end: this test measures nothing').toBe(14);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('[pdx-rich-text]');

        // What a browser delivers next: the queued selectionchange, then a key. Both read the DOM
        // selection, which is the collapsed half of the failed write.
        document.dispatchEvent(new Event('selectionchange'));
        keydown(view, 'Shift');
        expect({ anchor: view.state.selection.anchor, head: view.state.selection.head }).toEqual(selected);

        vi.mocked(domSel.extend).mockRestore();
        input(view, 'deleteContentBackward');
        type(view, 'Abc');
        expect(view.contentDOM.innerHTML).toBe('<p>Abc</p>');
    });

    it('the control: a DOM selection the user moves is still read into the model', () => {
        const view = viewWith(docOf(para('Hello'), para('world')), 3);
        const text = view.contentDOM.querySelector('p')!.firstChild!;
        const range = document.createRange();
        range.setStart(text, 2);
        range.setEnd(text, 5);
        const domSel = document.getSelection()!;
        domSel.removeAllRanges();
        domSel.addRange(range); // happy-dom fires selectionchange here, synchronously
        expect({ anchor: view.state.selection.anchor, head: view.state.selection.head }).toEqual({ anchor: 3, head: 6 });
    });
});
