// ── Starter Kit ───────────────────────────────────────────────────
// Bundle of all essential extensions for a fully-featured rich text editor.
// Import this to get everything working out of the box.

import { bundle } from '../state/plugin.js';
import { History } from '../commands/history.js';
import { MarkdownShortcuts } from '../commands/input-rules.js';

// Marks
import { Bold, Italic, Underline, Strike, Code, Link, Highlight, TextColor, Subscript, Superscript } from './marks.js';

// Nodes
import { Paragraph, Heading, Blockquote, CodeBlock, BulletList, OrderedList, TaskList, ListItem, HardBreak, HorizontalRule, Image, SelectAll } from './nodes.js';

/** All mark extensions */
export const AllMarks = bundle([
  Bold, Italic, Underline, Strike, Code, Link, Highlight, TextColor, Subscript, Superscript,
]);

/** All node extensions */
export const AllNodes = bundle([
  Paragraph, Heading, Blockquote, CodeBlock,
  BulletList, OrderedList, TaskList, ListItem,
  HardBreak, HorizontalRule, Image,
]);

/** StarterKit: full-featured rich text editing */
export const StarterKit = bundle([
  // Marks
  Bold, Italic, Underline, Strike, Code, Link, Highlight, TextColor, Subscript, Superscript,
  // Nodes
  Paragraph, Heading, Blockquote, CodeBlock,
  BulletList, OrderedList, TaskList, ListItem,
  HardBreak, HorizontalRule, Image,
  // Functionality
  History,
  MarkdownShortcuts,
  SelectAll,
]);

/** Minimal kit: basic formatting only (for compact use cases like comments) */
export const MinimalKit = bundle([
  Bold, Italic, Code, Link,
  Paragraph, HardBreak,
  History,
  SelectAll,
]);

/** Document kit: full formatting + all block types (for page editing) */
export const DocumentKit = bundle([
  // Everything from StarterKit
  Bold, Italic, Underline, Strike, Code, Link, Highlight, TextColor, Subscript, Superscript,
  Paragraph, Heading, Blockquote, CodeBlock,
  BulletList, OrderedList, TaskList, ListItem,
  HardBreak, HorizontalRule, Image,
  History,
  MarkdownShortcuts,
  SelectAll,
  // Additional nodes for documents would go here (table, etc.)
]);
