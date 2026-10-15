// The blocks static-markup-html.ts keeps out of the HTML form (#369), shared by its unit test and by
// the browser test that parses them. `parses` says what the parse does with the block written as HTML:
// 'differs' — the parser builds another tree, which is why the case is excluded; 'conservative' — it
// may give the same tree, and the case is excluded all the same, because the rule errs towards the
// DOM calls.

import type { MarkupNode } from '../../src/compiler/static-markup-html';

export const el = (tag: string, kids: MarkupNode[] = [], attrs: Array<[string, string]> = [], extra: Partial<MarkupNode> = {}): MarkupNode =>
    ({ kind: 'element', tag, kids, attrs, isVoid: false, ...extra });
export const text = (data: string): MarkupNode => ({ kind: 'text', kids: [], data });
export const anchor = (): MarkupNode => ({ kind: 'anchor', kids: [] });
export const comment = (data: string): MarkupNode => ({ kind: 'comment', kids: [], data });
export const root = (...kids: MarkupNode[]): MarkupNode => ({ kind: 'root', kids });

export interface ExcludedCase { name: string; tree: MarkupNode; parses: 'differs' | 'conservative' }

export const EXCLUDED_CASES: ExcludedCase[] = [
    { name: 'a <tr> straight in a <table>: the parser adds a <tbody>', tree: root(el('table', [el('tr', [el('td', [text('x')])])])), parses: 'differs' },
    { name: 'text in a <tbody>: the parser moves it out of the table', tree: root(el('table', [el('tbody', [text('x')])])), parses: 'differs' },
    { name: 'a <div> in a <tr>: the parser moves it out of the table', tree: root(el('table', [el('tbody', [el('tr', [el('div')])])])), parses: 'differs' },
    { name: 'a <td> outside a row: the parser drops the tag', tree: root(el('div', [el('td', [text('x')])])), parses: 'differs' },
    { name: 'a <tr> at the root after another element: the parser drops the tag', tree: root(el('div'), el('tr', [el('td', [text('x')])])), parses: 'differs' },
    { name: 'a <tr> at the root before another element', tree: root(el('tr', [el('td', [text('x')])]), el('div')), parses: 'conservative' },
    { name: 'a <col> at the root', tree: root(el('col', [], [], { isVoid: true })), parses: 'conservative' },
    { name: 'a <p> holding a block element', tree: root(el('p', [el('div', [text('x')])])), parses: 'differs' },
    { name: 'a <p> holding a block element deeper down', tree: root(el('p', [el('span', [el('div')])])), parses: 'differs' },
    { name: 'an <a> inside an <a>', tree: root(el('a', [el('span', [el('a')])])), parses: 'differs' },
    { name: 'a <button> inside a <button>', tree: root(el('button', [el('button')])), parses: 'differs' },
    { name: 'a <form> inside a <form>', tree: root(el('form', [el('div', [el('form')])])), parses: 'differs' },
    { name: 'an <li> inside an <li> with no list between', tree: root(el('li', [el('li')])), parses: 'differs' },
    { name: 'a <dt> inside a <dd>', tree: root(el('dd', [el('dt')])), parses: 'differs' },
    { name: 'a heading inside a heading', tree: root(el('h1', [el('h2')])), parses: 'differs' },
    { name: 'a <select>', tree: root(el('select', [el('option', [text('a')])])), parses: 'conservative' },
    { name: 'raw text: <textarea>', tree: root(el('textarea', [text('a')])), parses: 'conservative' },
    { name: 'raw text: <style>, which decodes no entity', tree: root(el('style', [text('a&b')])), parses: 'differs' },
    { name: '<template>, whose children are its content', tree: root(el('template', [el('p')])), parses: 'differs' },
    { name: '<image>, renamed <img> by the parser', tree: root(el('image', [], [], { isVoid: true })), parses: 'differs' },
    { name: 'a <pre> whose text starts with a newline', tree: root(el('pre', [text('\nx')])), parses: 'differs' },
    { name: 'SVG with a name the parser renames', tree: root(el('svg', [el('lineargradient', [], [], { svg: true }), el('linearGradient', [], [], { svg: true })], [], { svg: true })), parses: 'differs' },
    { name: 'SVG with an attribute the parser renames', tree: root(el('svg', [], [['viewbox', '0 0 1 1']], { svg: true })), parses: 'differs' },
    { name: 'SVG with a mixed-case name the parser does not know', tree: root(el('svg', [], [['dataValue', 'x']], { svg: true })), parses: 'differs' },
    { name: 'SVG xmlns, which the parser puts in a namespace', tree: root(el('svg', [], [['xmlns', 'http://www.w3.org/2000/svg']], { svg: true })), parses: 'differs' },
    { name: 'SVG with a prefixed attribute', tree: root(el('svg', [el('use', [], [['xlink:href', '#a']], { svg: true })], [], { svg: true })), parses: 'differs' },
    { name: 'two attributes of one name', tree: root(el('div', [], [['id', 'a'], ['ID', 'b']])), parses: 'differs' },
    { name: 'two text nodes side by side', tree: root(el('p', [text('a'), text('b')])), parses: 'differs' },
    { name: 'an empty text node that is not an anchor', tree: root(el('p', [text('')])), parses: 'differs' },
    { name: 'a carriage return in text', tree: root(el('p', [text('a\r\nb')])), parses: 'differs' },
    { name: 'a comment the parser ends early', tree: root(comment('a--!>b')), parses: 'differs' },
    { name: 'content of <component :is>', tree: root({ kind: 'sink', kids: [] }), parses: 'conservative' },
];

/**
 * Table content the parser keeps, written as HTML (#435): each element under the parent its content
 * model asks for, nothing but whitespace, comments and anchors beside them. The browser test parses
 * each with core's `staticMarkup` and compares it with the tree its DOM calls build.
 */
export const KEPT_TABLE_CASES: Array<{ name: string; tree: MarkupNode }> = [
    { name: 'a @for row: a <tr> at the root', tree: root(el('tr', [el('td', [anchor()]), el('td', [el('a', [anchor()])])])) },
    { name: 'a row with whitespace around and between its cells', tree: root(text(' '), el('tr', [text(' '), el('td', [text('a')]), text(' '), el('th', [text('b')]), text(' ')]), text(' ')) },
    { name: 'cells at the root', tree: root(el('td', [text('a')]), el('th', [anchor()])) },
    { name: 'sections at the root', tree: root(el('thead', [el('tr', [el('th', [text('h')])])]), el('tbody', [anchor()])) },
    { name: 'a table with its sections and the anchor of its rows', tree: root(el('div', [el('table', [
        text(' '), el('thead', [el('tr', [el('th', [text('Name')])])]), text(' '), el('tbody', [anchor()]), text(' '),
    ], [['class', 't']])])) },
    { name: 'a caption, a column group and a comment in a section', tree: root(el('table', [
        el('caption', [text('c')]), el('colgroup', [el('col', [], [['span', '2']], { isVoid: true })]),
        el('tbody', [comment(' rows '), el('tr', [el('td', [text('1')])])]),
    ])) },
    { name: 'a table inside a cell', tree: root(el('tr', [el('td', [el('table', [el('tbody', [el('tr', [el('td', [text('x')])])])])])])) },
];
