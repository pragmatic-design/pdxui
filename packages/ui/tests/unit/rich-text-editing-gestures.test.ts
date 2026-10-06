// Three editing gestures of pdx-rich-text, through the view's own keydown and beforeinput
// listeners — not by building selections and calling commands.
//
// 1. Bold at a caret: a collapsed selection stores the mark, so Ctrl+B then typing gives bold text.
// 2. A shortcut on a fresh selection: selectionchange is asynchronous, so a model that caught up
//    only there would make Shift+Ctrl+Left then Ctrl+B act on the old caret.
// 3. Select-all then delete must not leave the selection before the paragraph, or the next letter
//    lands in a paragraph of its own: Ctrl+A, Backspace, «Abc» would give <p>bc</p><p>A</p>.
import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from '../../src/rich-text/view/view';
import { StarterKit } from '../../src/rich-text/extensions/starter-kit';
import { createNode, createText } from '../../src/rich-text/model/node';
import { createSelection } from '../../src/rich-text/model/selection';
import { renderToolbar, parseToolbarConfig, updateToolbarState } from '../../src/rich-text/toolbar/toolbar';
import type { DocNode } from '../../src/rich-text/model/types';

const para = (txt: string): DocNode => createNode('paragraph', {}, [createText(txt)]);
const docOf = (...children: DocNode[]): DocNode => createNode('doc', {}, children);

function viewWith(doc: DocNode, anchor: number, head = anchor): EditorView {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return new EditorView({ element, doc, extensions: [StarterKit], selection: createSelection(anchor, head) });
}

function keydown(view: EditorView, key: string, mod = false): void {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: mod, bubbles: true, cancelable: true }));
}

function input(view: EditorView, inputType: string, data: string | null = null): void {
    const e = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
    // Chromium's InputEvent has getTargetRanges(); happy-dom's does not.
    Object.defineProperty(e, 'getTargetRanges', { value: () => [] });
    view.contentDOM.dispatchEvent(e);
}

/** What a browser sends for each typed character: keydown, then beforeinput insertText. */
function type(view: EditorView, text: string): void {
    for (const ch of text) {
        keydown(view, ch);
        input(view, 'insertText', ch);
    }
}

const html = (view: EditorView): string => view.contentDOM.innerHTML;

afterEach(() => { document.body.innerHTML = ''; document.getSelection()?.removeAllRanges(); });

describe('pdx-rich-text — bold at a caret (stored marks)', () => {
    it('Ctrl+B at a caret, then typing, writes bold text there', () => {
        const view = viewWith(docOf(para('abc')), 3); // ab|c
        keydown(view, 'b', true);
        type(view, 'X');
        expect(html(view)).toBe('<p>ab<strong>X</strong>c</p>');
    });

    it('the bold carries on for every letter typed, not only the first', () => {
        const view = viewWith(docOf(para('abc')), 3);
        keydown(view, 'b', true);
        type(view, 'XY');
        expect(html(view)).toBe('<p>ab<strong>XY</strong>c</p>');
    });

    it('Ctrl+B twice before typing toggles it back off: plain text', () => {
        const view = viewWith(docOf(para('abc')), 3);
        keydown(view, 'b', true);
        keydown(view, 'b', true);
        type(view, 'X');
        expect(html(view)).toBe('<p>abXc</p>');
    });

    it('moving the caret drops the pending bold', () => {
        const view = viewWith(docOf(para('abc')), 3);
        keydown(view, 'b', true);
        view.dispatch(view.createTransaction().setSelection(createSelection(2)));
        type(view, 'X');
        expect(html(view)).toBe('<p>aXbc</p>');
    });

    it('the toolbar shows the pending bold as pressed', () => {
        const view = viewWith(docOf(para('abc')), 3);
        const bar = document.createElement('div');
        renderToolbar(parseToolbarConfig('bold italic'), view, bar);
        keydown(view, 'b', true);
        updateToolbarState(bar, view.state);
        expect(bar.querySelector('[data-command="toggleBold"]')!.getAttribute('aria-pressed')).toBe('true');
        expect(bar.querySelector('[data-command="toggleItalic"]')!.getAttribute('aria-pressed')).toBe('false');
    });

    it('the control: Ctrl+B on a range still bolds the range, as before', () => {
        const view = viewWith(docOf(para('abc')), 1, 3); // [ab]c
        keydown(view, 'b', true);
        expect(html(view)).toBe('<p><strong>ab</strong>c</p>');
    });
});

describe('pdx-rich-text — a shortcut reads the DOM selection first', () => {
    it('a DOM selection set with no selectionchange yet is the one Ctrl+B bolds', () => {
        const view = viewWith(docOf(para('abc def')), 1); // model caret at the start
        // The browser has moved the selection over «def» (Shift+Ctrl+Right, a mouse drag) and the
        // selectionchange event has not been delivered yet. In Chromium it is queued as a task;
        // happy-dom fires it synchronously, so it is held back here to reproduce the real order.
        const holdBack = (e: Event): void => e.stopPropagation();
        window.addEventListener('selectionchange', holdBack, true);
        document.addEventListener('selectionchange', holdBack, true);
        try {
            const text = view.contentDOM.querySelector('p')!.firstChild!;
            const range = document.createRange();
            range.setStart(text, 4);
            range.setEnd(text, 7);
            const domSel = document.getSelection()!;
            domSel.removeAllRanges();
            domSel.addRange(range);
            expect(view.state.selection.anchor, 'the model already caught up: this test measures nothing').toBe(1);
            keydown(view, 'b', true);
        } finally {
            window.removeEventListener('selectionchange', holdBack, true);
            document.removeEventListener('selectionchange', holdBack, true);
        }
        expect(html(view)).toBe('<p>abc <strong>def</strong></p>');
    });
});

describe('pdx-rich-text — select-all then delete', () => {
    it('Ctrl+A, Backspace, then «Abc» gives one paragraph «Abc»', () => {
        const view = viewWith(docOf(para('Hello'), para('world')), 3);
        keydown(view, 'a', true);
        input(view, 'deleteContentBackward');
        type(view, 'Abc');
        expect(html(view)).toBe('<p>Abc</p>');
    });

    it('after the delete the caret is inside the empty paragraph, not before it', () => {
        const view = viewWith(docOf(para('Hello')), 3);
        keydown(view, 'a', true);
        input(view, 'deleteContentBackward');
        expect(view.state.selection.anchor).toBe(1);
        expect(view.state.selection.head).toBe(1);
    });
});
