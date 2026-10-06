// pdx-rich-text list indentation, through the view's own keydown listener.
//
// Tab nests the item at the caret into its previous sibling, and Shift+Tab lifts that one item
// one level: out of a nested list into its parent list, or out of an outermost list, splitting it —
// not every item of the list around the caret, and without moving the caret to the start of the
// document.
import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from '../../src/rich-text/view/view';
import { StarterKit } from '../../src/rich-text/extensions/starter-kit';
import { createNode, createText, isText } from '../../src/rich-text/model/node';
import { createSelection } from '../../src/rich-text/model/selection';
import { serializeToClipboardHTML, parseClipboardHTML } from '../../src/rich-text/view/clipboard';
import type { DocNode } from '../../src/rich-text/model/types';

const para = (txt: string): DocNode => createNode('paragraph', {}, [createText(txt)]);
const item = (txt: string, ...sub: DocNode[]): DocNode => createNode('listItem', {}, [para(txt), ...sub]);
const ul = (...items: DocNode[]): DocNode => createNode('bulletList', {}, items);
const ol = (...items: DocNode[]): DocNode => createNode('orderedList', {}, items);
const docOf = (...children: DocNode[]): DocNode => createNode('doc', {}, children);

/** The tree as a string: `ul(li(p(a)),li(p(b)))`. */
const NAMES: Record<string, string> = { bulletList: 'ul', orderedList: 'ol', listItem: 'li', paragraph: 'p' };
function shape(node: DocNode): string {
    if (isText(node)) return node.text ?? '';
    const inner = node.content.map(shape).join(',');
    return node.type === 'doc' ? inner : `${NAMES[node.type] ?? node.type}(${inner})`;
}

function viewWith(doc: DocNode, caret: number): EditorView {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return new EditorView({ element, doc, extensions: [StarterKit], selection: createSelection(caret) });
}

function tab(view: EditorView, shiftKey = false): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(e);
    return e;
}

/** Type one letter at the caret, the way a browser does: keydown, then beforeinput. */
function typeX(view: EditorView): void {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', bubbles: true, cancelable: true }));
    const e = new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'getTargetRanges', { value: () => [] });
    view.contentDOM.dispatchEvent(e);
}

afterEach(() => { document.body.innerHTML = ''; document.getSelection()?.removeAllRanges(); });

// Positions in ul(a, b, c): item a is [1,6), b is [6,11), c is [11,16). After «b» is 9.

describe('pdx-rich-text — Tab nests the list item at the caret', () => {
    it('Tab on b nests it under a, keeps focus, and keeps the caret in b', () => {
        const view = viewWith(docOf(ul(item('a'), item('b'), item('c'))), 9);
        expect(tab(view).defaultPrevented).toBe(true);
        expect(shape(view.state.doc)).toBe('ul(li(p(a),ul(li(p(b)))),li(p(c)))');
        typeX(view);
        expect(shape(view.state.doc)).toBe('ul(li(p(a),ul(li(p(bX)))),li(p(c)))');
    });

    it('Tab on c after b was nested joins b\'s sublist, not a second one', () => {
        // ul(li(p(a),ul(li(p(b)))),li(p(c))): c's text starts at 15.
        const view = viewWith(docOf(ul(item('a', ul(item('b'))), item('c'))), 15);
        expect(tab(view).defaultPrevented).toBe(true);
        expect(shape(view.state.doc)).toBe('ul(li(p(a),ul(li(p(b)),li(p(c)))))');
        typeX(view);
        expect(shape(view.state.doc)).toBe('ul(li(p(a),ul(li(p(b)),li(p(Xc)))))');
    });

    it('a nested list is of the same kind as its parent list', () => {
        const view = viewWith(docOf(ol(item('a'), item('b'))), 9);
        tab(view);
        expect(shape(view.state.doc)).toBe('ol(li(p(a),ol(li(p(b)))))');
    });

    it('the control: Tab on the first item has nowhere to go — the default is kept, nothing changes', () => {
        const view = viewWith(docOf(ul(item('a'), item('b'))), 3);
        const before = view.state.doc;
        expect(tab(view).defaultPrevented).toBe(false);
        expect(view.state.doc).toBe(before);
    });
});

describe('pdx-rich-text — Shift+Tab lifts the list item at the caret, not the list', () => {
    it('Shift+Tab on b in a flat list gives list a, paragraph b, list c, with the caret in b', () => {
        const view = viewWith(docOf(ul(item('a'), item('b'), item('c'))), 9);
        expect(tab(view, true).defaultPrevented).toBe(true);
        expect(shape(view.state.doc)).toBe('ul(li(p(a))),p(b),ul(li(p(c)))');
        typeX(view);
        expect(shape(view.state.doc)).toBe('ul(li(p(a))),p(bX),ul(li(p(c)))');
    });

    it('the caret may be anywhere in the item, not only at its start', () => {
        // ul(li(p(abc)), li(p(def))): «def» starts at 10; the caret sits after «d».
        const view = viewWith(docOf(ul(item('abc'), item('def'))), 11);
        tab(view, true);
        expect(shape(view.state.doc)).toBe('ul(li(p(abc))),p(def)');
        typeX(view);
        expect(shape(view.state.doc)).toBe('ul(li(p(abc))),p(dXef)');
    });

    it('Shift+Tab on a nested item moves it one level up, after its parent item', () => {
        // ul(li(p(a),ul(li(p(b)))),li(p(c))): after «b» is 9.
        const view = viewWith(docOf(ul(item('a', ul(item('b'))), item('c'))), 9);
        expect(tab(view, true).defaultPrevented).toBe(true);
        expect(shape(view.state.doc)).toBe('ul(li(p(a)),li(p(b)),li(p(c)))');
        typeX(view);
        expect(shape(view.state.doc)).toBe('ul(li(p(a)),li(p(bX)),li(p(c)))');
    });

    it('the nested items after the lifted one become its children', () => {
        const view = viewWith(docOf(ul(item('a', ul(item('b'), item('c'))))), 9);
        tab(view, true);
        expect(shape(view.state.doc)).toBe('ul(li(p(a)),li(p(b),ul(li(p(c)))))');
    });

    it('Tab then Shift+Tab gives back the list it started from', () => {
        const start = docOf(ul(item('a'), item('b'), item('c')));
        const view = viewWith(start, 9);
        tab(view);
        tab(view, true);
        expect(shape(view.state.doc)).toBe(shape(start));
    });
});

describe('pdx-rich-text — a nested list survives the HTML round trip', () => {
    it('getHTML → setHTML keeps the nesting', () => {
        // The serializer and the parser on their own, on a document that is nested to begin with.
        const view = viewWith(docOf(ul(item('a', ol(item('b'), item('c', ul(item('d'))))), item('e'))), 3);
        const html = serializeToClipboardHTML(view.state.doc.content);
        const back = createNode('doc', {}, parseClipboardHTML(html, view.state.schema));
        expect(shape(back)).toBe('ul(li(p(a),ol(li(p(b)),li(p(c),ul(li(p(d)))))),li(p(e)))');
    });
});
