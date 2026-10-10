// ── Clipboard Handler ─────────────────────────────────────────────
// Copy, cut, paste with sanitization for Word, Google Docs, and web content.
// Paste handling is one of the hardest problems in rich text editing.
// This sanitizer handles the most common sources of pasted content.

import { sanitizeUrl } from '@pdxui/core';
import { sanitizeHTML as whitelistHTML } from '../../shared/sanitize.js';
import type { DocNode, Mark } from '../model/types.js';
import { createNode, createText } from '../model/node.js';
import { createMark, EMPTY_MARKS } from '../model/mark.js';
import type { Schema } from '../model/schema.js';

/** Strip dangerous schemes from a link href at the model frontier / on export. */
function safeHref(href: string): string {
  return sanitizeUrl(href) ?? '';
}

// ── Copy/Cut ──────────────────────────────────────────────────

/** Serialize nodes to HTML for clipboard */
export function serializeToClipboardHTML(nodes: readonly DocNode[]): string {
  return nodes.map(nodeToHTML).join('');
}

function nodeToHTML(node: DocNode): string {
  if (node.type === 'text') {
    let html = escapeHTML(node.text!);
    // Wrap in mark tags (innermost first)
    for (let i = node.marks.length - 1; i >= 0; i--) {
      html = wrapMarkHTML(node.marks[i], html);
    }
    return html;
  }

  const tag = nodeToTag(node);
  const attrs = nodeToHTMLAttrs(node);
  const attrStr = attrs ? ` ${attrs}` : '';
  const children = node.content.map(nodeToHTML).join('');

  if (isSelfClosing(node.type)) return `<${tag}${attrStr} />`;
  return `<${tag}${attrStr}>${children}</${tag}>`;
}

function nodeToTag(node: DocNode): string {
  switch (node.type) {
    case 'paragraph': return 'p';
    case 'heading': return `h${node.attrs.level || 1}`;
    case 'blockquote': return 'blockquote';
    case 'codeBlock': return 'pre';
    case 'bulletList': return 'ul';
    case 'orderedList': return 'ol';
    case 'taskList': return 'ul';
    case 'listItem': return 'li';
    case 'taskItem': return 'li';
    case 'image': return 'img';
    case 'horizontalRule': return 'hr';
    case 'hardBreak': return 'br';
    case 'table': return 'table';
    case 'tableRow': return 'tr';
    case 'tableCell': return node.attrs.header ? 'th' : 'td';
    default: return 'div';
  }
}

function nodeToHTMLAttrs(node: DocNode): string {
  const parts: string[] = [];
  if (node.type === 'image') {
    if (node.attrs.src) parts.push(`src="${escapeAttr(node.attrs.src as string)}"`);
    if (node.attrs.alt) parts.push(`alt="${escapeAttr(node.attrs.alt as string)}"`);
  }
  if (node.type === 'orderedList' && node.attrs.start && node.attrs.start !== 1) {
    parts.push(`start="${node.attrs.start}"`);
  }
  if (node.type === 'codeBlock' && node.attrs.language) {
    parts.push(`data-language="${escapeAttr(node.attrs.language as string)}"`);
  }
  return parts.join(' ');
}

function wrapMarkHTML(mark: Mark, html: string): string {
  switch (mark.type) {
    case 'bold': return `<strong>${html}</strong>`;
    case 'italic': return `<em>${html}</em>`;
    case 'underline': return `<u>${html}</u>`;
    case 'strike': return `<s>${html}</s>`;
    case 'code': return `<code>${html}</code>`;
    case 'link': return `<a href="${escapeAttr(safeHref(mark.attrs.href as string))}">${html}</a>`;
    case 'highlight': return `<mark>${html}</mark>`;
    case 'subscript': return `<sub>${html}</sub>`;
    case 'superscript': return `<sup>${html}</sup>`;
    default: return `<span>${html}</span>`;
  }
}

function isSelfClosing(type: string): boolean {
  return type === 'image' || type === 'horizontalRule' || type === 'hardBreak';
}

// ── Paste Sanitization ────────────────────────────────────────

/** Parse pasted HTML into document nodes */
export function parseClipboardHTML(html: string, schema: Schema): DocNode[] {
  // 1. Sanitize HTML — Word/GDocs cleanup first, then the shared DOMParser whitelist
  //    (strips scripts/handlers/iframes) as defense in depth before we trust the DOM.
  const cleaned = whitelistHTML(sanitizeHTML(html));

  // 2. Parse to DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleaned, 'text/html');
  const body = doc.body;

  // 3. Convert DOM → model nodes
  return domToNodes(body, schema);
}

/** Parse plain text into paragraphs */
export function parsePlainText(text: string): DocNode[] {
  if (!text) return [];

  // Split on double newlines for paragraphs
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map(p => {
    const lines = p.split('\n');
    const content: DocNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) content.push(createNode('hardBreak'));
      if (lines[i]) content.push(createText(lines[i]));
    }
    return createNode('paragraph', {}, content.length > 0 ? content : [createText('')]);
  });
}

// ── HTML Sanitizer ────────────────────────────────────────────
//
// The cleanup for Word and Google Docs works on the parsed tree, not on the string: a regex over
// markup misses `</script >`, a tag whose attributes come in another order, and its own order of
// passes — the mso- styles were stripped before Word's list paragraphs were recognised by them, so
// a pasted list never became one (#64). Parsing with DOMParser runs nothing: no script executes, no
// image loads.

/** Elements whose whole subtree is dropped: not content. */
const DROPPED_TAGS = new Set(['style', 'script', 'meta', 'link', 'title', 'noscript', 'template']);
/** Office XML namespaces whose tags are unwrapped, their content kept. */
const OFFICE_PREFIX = /^(o|w|m|st1|v):/;

function sanitizeHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  cleanPastedTree(doc.body);
  // Text split by a dropped comment or tag is one text again: `a<!-- x -->b` is "ab".
  doc.body.normalize();
  return doc.body.innerHTML;
}

/** Clean `root`'s subtree in place: drop what is not content, unwrap what only wraps it. */
function cleanPastedTree(root: Element): void {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    let el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (DROPPED_TAGS.has(tag)) { el.remove(); continue; }

    // Word's list items are paragraphs marked by an mso-list style: read it BEFORE the mso- styles go.
    if (tag === 'p' && /mso-list/i.test(el.getAttribute('style') ?? '')) el = renameElement(el, 'li');

    cleanPastedTree(el);

    if (OFFICE_PREFIX.test(tag) || isGoogleDocsWrapper(el)) { unwrap(el); continue; }
    cleanPastedAttributes(el);
    if (tag === 'span' && el.attributes.length === 0 && !el.textContent?.trim() && el.children.length === 0) el.remove();
  }
}

/** Google Docs wraps a whole paste in a `<b>` whose font-weight is normal: a wrapper, not bold. */
function isGoogleDocsWrapper(el: HTMLElement): boolean {
  if (el.tagName.toLowerCase() !== 'b') return false;
  return /font-weight\s*:\s*(normal|400)\b/i.test(el.getAttribute('style') ?? '');
}

/** Word's mso- styles and Mso classes, Google Docs' guid ids, foreign data-* attributes. */
function cleanPastedAttributes(el: HTMLElement): void {
  const style = el.getAttribute('style');
  if (style !== null) {
    const kept = style.split(';').map(d => d.trim()).filter(d => d && !/^mso-/i.test(d));
    if (kept.length > 0) el.setAttribute('style', kept.join('; '));
    else el.removeAttribute('style');
  }
  if (/^Mso/.test(el.getAttribute('class') ?? '')) el.removeAttribute('class');
  if ((el.getAttribute('id') ?? '').startsWith('docs-internal-guid-')) el.removeAttribute('id');
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-') && !attr.name.startsWith('data-pdx')) el.removeAttribute(attr.name);
  }
}

/** Replace `el` by its children. */
function unwrap(el: Element): void {
  while (el.firstChild) el.before(el.firstChild);
  el.remove();
}

/** Replace `el` by an element named `tag` holding the same children and attributes. */
function renameElement(el: HTMLElement, tag: string): HTMLElement {
  const next = el.ownerDocument.createElement(tag);
  for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

// ── DOM → Model Conversion ────────────────────────────────────

function domToNodes(element: Element, schema: Schema): DocNode[] {
  const nodes: DocNode[] = [];

  for (const child of element.childNodes) {
    const converted = domNodeToModel(child, schema, EMPTY_MARKS);
    if (converted) nodes.push(...converted);
  }

  return nodes;
}

function domNodeToModel(
  dom: Node, schema: Schema, inheritedMarks: readonly Mark[],
): DocNode[] | null {
  // Text node
  if (dom.nodeType === Node.TEXT_NODE) {
    const text = dom.textContent ?? '';
    if (!text.trim() && !text.includes(' ')) return null; // skip empty whitespace
    const normalizedText = text.replace(/\s+/g, ' ');
    if (!normalizedText) return null;
    return [createText(normalizedText, inheritedMarks)];
  }

  // Element node
  if (dom.nodeType !== Node.ELEMENT_NODE) return null;
  const el = dom as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // Skip invisible elements
  if (tag === 'head' || tag === 'style' || tag === 'script' || tag === 'noscript') return null;

  // Determine marks from this element
  const marks = resolveMarksFromElement(el, inheritedMarks);

  // Convert based on tag
  switch (tag) {
    case 'p':
      return [createNode('paragraph', {}, childrenToNodes(el, schema, marks))];

    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return [createNode('heading', { level: parseInt(tag[1]) }, childrenToNodes(el, schema, marks))];

    case 'blockquote':
      return [createNode('blockquote', {}, childrenToNodes(el, schema, marks))];

    case 'pre': {
      const code = el.querySelector('code');
      const text = (code ?? el).textContent ?? '';
      const language = code?.className?.match(/language-(\w+)/)?.[1] ?? '';
      return [createNode('codeBlock', { language }, [createText(text)])];
    }

    case 'ul':
      return [createNode('bulletList', {}, listItemsToNodes(el, schema, marks))];

    case 'ol': {
      const start = el.hasAttribute('start') ? parseInt(el.getAttribute('start')!) : 1;
      return [createNode('orderedList', { start }, listItemsToNodes(el, schema, marks))];
    }

    case 'li':
      return [createNode('listItem', {}, ensureBlockContent(childrenToNodes(el, schema, marks)))];

    case 'hr':
      return [createNode('horizontalRule')];

    case 'br':
      return [createNode('hardBreak')];

    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      if (!src) return null;
      return [createNode('image', { src, alt })];
    }

    case 'table':
      return [convertTable(el, schema, marks)];

    // Inline elements that add marks
    case 'strong': case 'b':
      return inlineChildren(el, schema, marks);
    case 'em': case 'i':
      return inlineChildren(el, schema, marks);
    case 'u':
      return inlineChildren(el, schema, marks);
    case 's': case 'del': case 'strike':
      return inlineChildren(el, schema, marks);
    case 'code':
      return inlineChildren(el, schema, marks);
    case 'a': {
      return inlineChildren(el, schema, marks);
    }
    case 'mark':
      return inlineChildren(el, schema, marks);
    case 'sub':
      return inlineChildren(el, schema, marks);
    case 'sup':
      return inlineChildren(el, schema, marks);

    // Div, span, etc. — pass through children
    case 'div': case 'section': case 'article': case 'main': case 'header': case 'footer':
    case 'nav': case 'aside': case 'figure': case 'figcaption': case 'details': case 'summary':
      return childrenToNodes(el, schema, marks);

    case 'span':
      return inlineChildren(el, schema, marks);

    default:
      // Unknown element — try to process children
      return childrenToNodes(el, schema, marks);
  }
}

function resolveMarksFromElement(el: HTMLElement, inherited: readonly Mark[]): readonly Mark[] {
  const marks = [...inherited];
  const tag = el.tagName.toLowerCase();
  const style = el.style;
  // A mark type applies once: `<strong><strong>x</strong></strong>`, or a bold span inside a
  // <strong>, is still one bold mark — not two, which the serialiser would write back as two tags.
  const add = (type: string, attrs?: Parameters<typeof createMark>[1]) => {
    if (!marks.some(m => m.type === type)) marks.push(createMark(type, attrs));
  };

  // Tag-based marks
  if (tag === 'strong' || tag === 'b') {
    if (style.fontWeight !== 'normal') add('bold');
  }
  if (tag === 'em' || tag === 'i') add('italic');
  if (tag === 'u') add('underline');
  if (tag === 's' || tag === 'del' || tag === 'strike') add('strike');
  if (tag === 'code') add('code');
  if (tag === 'a') {
    add('link', {
      href: safeHref(el.getAttribute('href') ?? ''),
      title: el.getAttribute('title') ?? '',
    });
  }
  if (tag === 'mark') add('highlight');
  if (tag === 'sub') add('subscript');
  if (tag === 'sup') add('superscript');

  // Style-based marks (from pasted content)
  if (style.fontWeight && (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 600)) add('bold');
  if (style.fontStyle === 'italic') add('italic');
  if (style.textDecoration?.includes('underline')) add('underline');
  if (style.textDecoration?.includes('line-through')) add('strike');

  return marks;
}

function childrenToNodes(el: Element, schema: Schema, marks: readonly Mark[]): DocNode[] {
  const nodes: DocNode[] = [];
  for (const child of el.childNodes) {
    const converted = domNodeToModel(child, schema, marks);
    if (converted) nodes.push(...converted);
  }
  return nodes;
}

/** `marks` are this element's marks, already resolved by domNodeToModel — resolving them again here
 *  would add every tag mark twice, so setHTML(getHTML()) would double <strong> on each round. */
function inlineChildren(el: HTMLElement, schema: Schema, marks: readonly Mark[]): DocNode[] {
  const nodes: DocNode[] = [];
  for (const child of el.childNodes) {
    const converted = domNodeToModel(child, schema, marks);
    if (converted) nodes.push(...converted);
  }
  return nodes.length > 0 ? nodes : null as any;
}

function listItemsToNodes(el: Element, schema: Schema, marks: readonly Mark[]): DocNode[] {
  const items: DocNode[] = [];
  for (const child of el.children) {
    if (child.tagName.toLowerCase() === 'li') {
      items.push(createNode('listItem', {}, ensureBlockContent(childrenToNodes(child, schema, marks))));
    }
  }
  return items;
}

function convertTable(el: Element, schema: Schema, marks: readonly Mark[]): DocNode {
  const rows: DocNode[] = [];
  const trs = el.querySelectorAll('tr');
  for (const tr of trs) {
    const cells: DocNode[] = [];
    for (const cell of tr.children) {
      const tag = cell.tagName.toLowerCase();
      const isHeader = tag === 'th';
      const colspan = parseInt(cell.getAttribute('colspan') ?? '1');
      const rowspan = parseInt(cell.getAttribute('rowspan') ?? '1');
      cells.push(createNode('tableCell', { header: isHeader, colspan, rowspan },
        ensureBlockContent(childrenToNodes(cell, schema, marks)),
      ));
    }
    rows.push(createNode('tableRow', {}, cells));
  }
  return createNode('table', {}, rows);
}

/** Ensure content has at least one block node (wrap inline in paragraph) */
function ensureBlockContent(nodes: DocNode[]): DocNode[] {
  if (nodes.length === 0) return [createNode('paragraph', {}, [createText('')])];

  // Check if all nodes are inline
  const allInline = nodes.every(n => n.type === 'text' || n.type === 'hardBreak');
  if (allInline) return [createNode('paragraph', {}, nodes)];

  return nodes;
}

// ── Utilities ─────────────────────────────────────────────────

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `&` FIRST: escaped after the quote, it turned every `&quot;` into `&amp;quot;` (#64). */
function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
