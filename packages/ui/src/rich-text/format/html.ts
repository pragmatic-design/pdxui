// ── HTML Serializer / Deserializer ────────────────────────────────
// Convert between DocNode tree and HTML strings.
// Uses the clipboard module for DOM→model conversion.

import { sanitizeUrl } from '@pdxui/core';
import type { DocNode, Mark } from '../model/types.js';
import { createNode, createText, isText } from '../model/node.js';
import { parseClipboardHTML } from '../view/clipboard.js';
import type { Schema } from '../model/schema.js';
import { defaultSchema } from '../model/schema.js';

/** Serialize document to HTML string */
export function toHTML(doc: DocNode): string {
  return doc.content.map(nodeToHTML).join('\n');
}

function nodeToHTML(node: DocNode): string {
  if (isText(node)) {
    let html = escapeHTML(node.text!);
    for (let i = node.marks.length - 1; i >= 0; i--) {
      html = wrapMark(node.marks[i], html);
    }
    return html;
  }

  const children = node.content.map(nodeToHTML).join('');
  return wrapNodeTag(node, children);
}

function wrapNodeTag(node: DocNode, children: string): string {
  switch (node.type) {
    case 'doc': return children;
    case 'paragraph': return `<p>${children}</p>`;
    case 'heading': return `<h${node.attrs.level}>${children}</h${node.attrs.level}>`;
    case 'blockquote': return `<blockquote>${children}</blockquote>`;
    case 'codeBlock': {
      const lang = node.attrs.language ? ` class="language-${node.attrs.language}"` : '';
      return `<pre><code${lang}>${children}</code></pre>`;
    }
    case 'bulletList': return `<ul>${children}</ul>`;
    case 'orderedList': {
      const start = node.attrs.start !== 1 ? ` start="${node.attrs.start}"` : '';
      return `<ol${start}>${children}</ol>`;
    }
    case 'taskList': return `<ul class="task-list">${children}</ul>`;
    case 'listItem': return `<li>${children}</li>`;
    case 'taskItem': {
      const checked = node.attrs.checked ? ' checked' : '';
      return `<li class="task-item"><input type="checkbox"${checked} disabled />${children}</li>`;
    }
    case 'image': {
      const attrs = [`src="${escapeAttr(node.attrs.src as string)}"`];
      if (node.attrs.alt) attrs.push(`alt="${escapeAttr(node.attrs.alt as string)}"`);
      if (node.attrs.title) attrs.push(`title="${escapeAttr(node.attrs.title as string)}"`);
      if (node.attrs.width) attrs.push(`width="${node.attrs.width}"`);
      let img = `<img ${attrs.join(' ')} />`;
      if (node.attrs.caption) {
        img = `<figure>${img}<figcaption>${escapeHTML(node.attrs.caption as string)}</figcaption></figure>`;
      }
      return img;
    }
    case 'horizontalRule': return '<hr />';
    case 'hardBreak': return '<br />';
    case 'table': return `<table>${children}</table>`;
    case 'tableRow': return `<tr>${children}</tr>`;
    case 'tableCell': {
      const tag = node.attrs.header ? 'th' : 'td';
      const attrs: string[] = [];
      if ((node.attrs.colspan as number) > 1) attrs.push(`colspan="${node.attrs.colspan}"`);
      if ((node.attrs.rowspan as number) > 1) attrs.push(`rowspan="${node.attrs.rowspan}"`);
      const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
      return `<${tag}${attrStr}>${children}</${tag}>`;
    }
    default: return `<div>${children}</div>`;
  }
}

function wrapMark(mark: Mark, html: string): string {
  switch (mark.type) {
    case 'bold': return `<strong>${html}</strong>`;
    case 'italic': return `<em>${html}</em>`;
    case 'underline': return `<u>${html}</u>`;
    case 'strike': return `<s>${html}</s>`;
    case 'code': return `<code>${html}</code>`;
    case 'link': {
      const attrs = [`href="${escapeAttr(sanitizeUrl(mark.attrs.href as string) ?? '')}"`];
      if (mark.attrs.title) attrs.push(`title="${escapeAttr(mark.attrs.title as string)}"`);
      return `<a ${attrs.join(' ')}>${html}</a>`;
    }
    case 'highlight': return `<mark>${html}</mark>`;
    case 'textColor': return `<span style="color:${escapeAttr(mark.attrs.color as string)}">${html}</span>`;
    case 'subscript': return `<sub>${html}</sub>`;
    case 'superscript': return `<sup>${html}</sup>`;
    default: return html;
  }
}

/** Parse HTML string to document */
export function fromHTML(html: string, schema?: Schema): DocNode {
  const s = schema ?? defaultSchema;
  const content = parseClipboardHTML(html, s);
  return createNode('doc', {}, content.length > 0 ? content : [createNode('paragraph', {}, [createText('')])]);
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
