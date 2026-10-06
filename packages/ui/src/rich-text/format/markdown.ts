// ── Markdown Serializer / Deserializer ────────────────────────────
// CommonMark-compatible conversion between DocNode and Markdown.
// Supports GFM extensions: task lists, strikethrough, tables.

import { sanitizeUrl } from '@pdxui/core';
import type { DocNode, Mark } from '../model/types.js';
import { createNode, createText, isText } from '../model/node.js';
import { createMark } from '../model/mark.js';

// ── Serialize (DocNode → Markdown) ────────────────────────────

export function toMarkdown(doc: DocNode): string {
  return doc.content.map((node, i, arr) => {
    const md = nodeToMD(node, 0);
    // Add blank line between block elements
    return i < arr.length - 1 ? md + '\n' : md;
  }).join('\n');
}

function nodeToMD(node: DocNode, indent: number): string {
  if (isText(node)) return inlineToMD(node.text!, node.marks);

  switch (node.type) {
    case 'paragraph':
      return contentToMD(node) + '\n';

    case 'heading': {
      const level = node.attrs.level as number;
      const prefix = '#'.repeat(level);
      return `${prefix} ${contentToMD(node)}\n`;
    }

    case 'blockquote': {
      const inner = node.content.map(c => nodeToMD(c, indent)).join('\n');
      return inner.split('\n').map(line => `> ${line}`).join('\n') + '\n';
    }

    case 'codeBlock': {
      const lang = node.attrs.language ?? '';
      const code = node.content.map(c => isText(c) ? c.text! : '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }

    case 'bulletList':
      return node.content.map(c => {
        const inner = nodeToMD(c, indent + 2).trimEnd();
        return `${'  '.repeat(indent / 2)}- ${inner}`;
      }).join('\n') + '\n';

    case 'orderedList': {
      const start = (node.attrs.start as number) ?? 1;
      return node.content.map((c, i) => {
        const inner = nodeToMD(c, indent + 3).trimEnd();
        return `${'  '.repeat(indent / 2)}${start + i}. ${inner}`;
      }).join('\n') + '\n';
    }

    case 'taskList':
      return node.content.map(c => {
        const checked = c.attrs.checked ? 'x' : ' ';
        const inner = c.content.map(cc => contentToMD(cc)).join('').trimEnd();
        return `- [${checked}] ${inner}`;
      }).join('\n') + '\n';

    case 'listItem':
    case 'taskItem':
      return node.content.map(c => nodeToMD(c, indent)).join('').trimEnd();

    case 'image': {
      const alt = node.attrs.alt ?? '';
      const src = node.attrs.src ?? '';
      const title = node.attrs.title ? ` "${node.attrs.title}"` : '';
      return `![${alt}](${src}${title})\n`;
    }

    case 'horizontalRule':
      return '---\n';

    case 'hardBreak':
      return '  \n'; // two trailing spaces + newline

    case 'table':
      return tableToMD(node);

    default:
      return contentToMD(node) + '\n';
  }
}

function contentToMD(node: DocNode): string {
  return node.content.map(c => {
    if (isText(c)) return inlineToMD(c.text!, c.marks);
    if (c.type === 'hardBreak') return '  \n';
    return nodeToMD(c, 0);
  }).join('');
}

function inlineToMD(text: string, marks: readonly Mark[]): string {
  let result = text;
  // Apply marks in reverse (innermost first)
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': result = `**${result}**`; break;
      case 'italic': result = `*${result}*`; break;
      case 'strike': result = `~~${result}~~`; break;
      case 'code': result = `\`${result}\``; break;
      case 'link': result = `[${result}](${sanitizeUrl(mark.attrs.href as string) ?? ''})`; break;
      case 'highlight': result = `==${result}==`; break;
      // underline, subscript, superscript have no MD equivalent
    }
  }
  return result;
}

function tableToMD(node: DocNode): string {
  const rows = node.content;
  if (rows.length === 0) return '';

  const lines: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].content.map(cell => {
      return cell.content.map(c => contentToMD(c)).join('').trim();
    });
    lines.push(`| ${cells.join(' | ')} |`);

    // Header separator after first row
    if (r === 0) {
      lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
    }
  }

  return lines.join('\n') + '\n';
}

// ── Deserialize (Markdown → DocNode) ──────────────────────────

export function fromMarkdown(md: string): DocNode {
  const lines = md.split('\n');
  const nodes: DocNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line → skip
    if (!line.trim()) { i++; continue; }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      nodes.push(createNode('heading', { level: headingMatch[1].length }, parseInline(headingMatch[2])));
      i++; continue;
    }

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)$/.test(line.trim())) {
      nodes.push(createNode('horizontalRule'));
      i++; continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(createNode('codeBlock', { language: lang }, [createText(codeLines.join('\n'))]));
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      const inner = fromMarkdown(quoteLines.join('\n'));
      nodes.push(createNode('blockquote', {}, inner.content));
      continue;
    }

    // Task list
    if (/^- \[[ x]\] /.test(line)) {
      const items: DocNode[] = [];
      while (i < lines.length && /^- \[[ x]\] /.test(lines[i])) {
        const checked = lines[i][3] === 'x';
        const text = lines[i].slice(6);
        items.push(createNode('taskItem', { checked }, [createNode('paragraph', {}, parseInline(text))]));
        i++;
      }
      nodes.push(createNode('taskList', {}, items));
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items: DocNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        const text = lines[i].replace(/^[-*]\s/, '');
        items.push(createNode('listItem', {}, [createNode('paragraph', {}, parseInline(text))]));
        i++;
      }
      nodes.push(createNode('bulletList', {}, items));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: DocNode[] = [];
      const startNum = parseInt(line.match(/^(\d+)/)?.[1] ?? '1');
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s/, '');
        items.push(createNode('listItem', {}, [createNode('paragraph', {}, parseInline(text))]));
        i++;
      }
      nodes.push(createNode('orderedList', { start: startNum }, items));
      continue;
    }

    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)$/);
    if (imgMatch) {
      nodes.push(createNode('image', { alt: imgMatch[1], src: imgMatch[2], title: imgMatch[3] ?? '' }));
      i++; continue;
    }

    // Table
    if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s-|]+\|$/.test(lines[i + 1]?.trim() ?? '')) {
      const tableRows: DocNode[] = [];
      // Header row
      tableRows.push(parseTableRow(line, true));
      i++; // skip header
      i++; // skip separator
      while (i < lines.length && lines[i].startsWith('|')) {
        tableRows.push(parseTableRow(lines[i], false));
        i++;
      }
      nodes.push(createNode('table', {}, tableRows));
      continue;
    }

    // Paragraph (default)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push(createNode('paragraph', {}, parseInline(paraLines.join('\n'))));
    }
  }

  return createNode('doc', {}, nodes.length > 0 ? nodes : [createNode('paragraph', {}, [createText('')])]);
}

function isBlockStart(line: string): boolean {
  return /^#{1,6}\s/.test(line) || /^[-*]\s/.test(line) || /^\d+\.\s/.test(line) ||
    line.startsWith('> ') || line.startsWith('```') || /^(?:---|\*\*\*|___)$/.test(line.trim()) ||
    line.startsWith('|') || /^- \[[ x]\] /.test(line);
}

function parseTableRow(line: string, header: boolean): DocNode {
  const cells = line.split('|').slice(1, -1).map(c => c.trim());
  const cellNodes = cells.map(text =>
    createNode('tableCell', { header }, [createNode('paragraph', {}, parseInline(text))]),
  );
  return createNode('tableRow', {}, cellNodes);
}

// ── Inline Parsing ────────────────────────────────────────────

function parseInline(text: string): DocNode[] {
  const nodes: DocNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      nodes.push(createText(boldMatch[1], [createMark('bold')]));
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *text*
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      nodes.push(createText(italicMatch[1], [createMark('italic')]));
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strike ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      nodes.push(createText(strikeMatch[1], [createMark('strike')]));
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Code `text`
    const codeMatch = remaining.match(/^`(.+?)`/);
    if (codeMatch) {
      nodes.push(createText(codeMatch[1], [createMark('code')]));
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push(createText(linkMatch[1], [createMark('link', { href: linkMatch[2] })]));
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Highlight ==text==
    const highlightMatch = remaining.match(/^==(.+?)==/);
    if (highlightMatch) {
      nodes.push(createText(highlightMatch[1], [createMark('highlight')]));
      remaining = remaining.slice(highlightMatch[0].length);
      continue;
    }

    // Hard break (two trailing spaces)
    if (remaining.startsWith('  \n')) {
      nodes.push(createNode('hardBreak'));
      remaining = remaining.slice(3);
      continue;
    }

    // Plain text (up to next special char)
    const plainMatch = remaining.match(/^[^*~`\[=\n]+/);
    if (plainMatch) {
      nodes.push(createText(plainMatch[0]));
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Consume single character
    nodes.push(createText(remaining[0]));
    remaining = remaining.slice(1);
  }

  return nodes.length > 0 ? nodes : [createText('')];
}
