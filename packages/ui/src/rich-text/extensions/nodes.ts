// ── Node Extensions ───────────────────────────────────────────────
// Block-level node type definitions: paragraph, heading, blockquote, code, lists, etc.

import type { Extension } from '../state/plugin.js';
import type { DocNode } from '../model/types.js';
import { toggleHeading, wrapIn, lift, selectAllCommand } from '../commands/base.js';
import { wrapInBulletList, wrapInOrderedList, wrapInTaskList, liftListItem, sinkListItem } from '../commands/list.js';
import { createTransaction } from '../state/state.js';
import { createNode, createText, nodeSize, isText } from '../model/node.js';
import { selFrom } from '../model/selection.js';
import { uiString } from '../../shared/i18n';

export const Paragraph: Extension = {
  name: 'paragraph',
  nodes: {
    paragraph: {
      content: 'inline*',
      group: 'block',
      marks: '_all',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
  },
};

export const Heading: Extension = {
  name: 'heading',
  nodes: {
    heading: {
      content: 'inline*',
      group: 'block',
      marks: '_all',
      attrs: { level: { default: 1, validate: (v) => typeof v === 'number' && v >= 1 && v <= 6 } },
      parseDOM: [
        { tag: 'h1', getAttrs: () => ({ level: 1 }) },
        { tag: 'h2', getAttrs: () => ({ level: 2 }) },
        { tag: 'h3', getAttrs: () => ({ level: 3 }) },
        { tag: 'h4', getAttrs: () => ({ level: 4 }) },
        { tag: 'h5', getAttrs: () => ({ level: 5 }) },
        { tag: 'h6', getAttrs: () => ({ level: 6 }) },
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
  },
  commands: () => ({
    setHeading1: toggleHeading(1),
    setHeading2: toggleHeading(2),
    setHeading3: toggleHeading(3),
    setHeading4: toggleHeading(4),
    setHeading5: toggleHeading(5),
    setHeading6: toggleHeading(6),
  }),
  keymap: () => ({
    'Mod-Alt-1': toggleHeading(1),
    'Mod-Alt-2': toggleHeading(2),
    'Mod-Alt-3': toggleHeading(3),
    'Mod-Alt-4': toggleHeading(4),
    'Mod-Alt-5': toggleHeading(5),
    'Mod-Alt-6': toggleHeading(6),
  }),
};

export const Blockquote: Extension = {
  name: 'blockquote',
  nodes: {
    blockquote: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
  },
  commands: () => ({
    toggleBlockquote: wrapIn('blockquote'),
    liftBlockquote: lift(),
  }),
  keymap: () => ({ 'Mod-Shift-b': wrapIn('blockquote') }),
};

export const CodeBlock: Extension = {
  name: 'codeBlock',
  nodes: {
    codeBlock: {
      content: 'text*',
      group: 'block',
      marks: '',
      attrs: { language: { default: '' } },
      parseDOM: [{
        tag: 'pre',
        getAttrs: (el) => {
          const code = (el as HTMLElement).querySelector('code');
          const lang = code?.className?.match(/language-(\w+)/)?.[1] ?? '';
          return { language: lang };
        },
      }],
      toDOM: (node) => ['pre', {}, ['code', node.attrs.language ? { class: `language-${node.attrs.language}` } : {}, 0]],
    },
  },
  commands: () => ({
    toggleCodeBlock: (state, dispatch) => {
      // TODO: proper toggle (paragraph ↔ codeBlock)
      if (dispatch) {
        const tr = createTransaction(state);
        tr.setNodeAttrs(selFrom(state.selection), { __setType: 'codeBlock' } as any);
        dispatch(tr);
      }
      return true;
    },
  }),
};

export const BulletList: Extension = {
  name: 'bulletList',
  nodes: {
    bulletList: {
      content: 'listItem+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
  },
  commands: () => ({ toggleBulletList: wrapInBulletList() }),
  keymap: () => ({ 'Mod-Shift-8': wrapInBulletList() }),
};

export const OrderedList: Extension = {
  name: 'orderedList',
  nodes: {
    orderedList: {
      content: 'listItem+',
      group: 'block',
      attrs: { start: { default: 1 } },
      parseDOM: [{
        tag: 'ol',
        getAttrs: (el) => ({ start: parseInt((el as HTMLElement).getAttribute('start') ?? '1') }),
      }],
      toDOM: (node) => ['ol', node.attrs.start !== 1 ? { start: node.attrs.start } : {}, 0],
    },
  },
  commands: () => ({ toggleOrderedList: wrapInOrderedList() }),
  keymap: () => ({ 'Mod-Shift-7': wrapInOrderedList() }),
};

export const TaskList: Extension = {
  name: 'taskList',
  nodes: {
    taskList: {
      content: 'taskItem+',
      group: 'block',
      parseDOM: [{ tag: 'ul.pdx-rt-task-list' }],
      toDOM: () => ['ul', { class: 'pdx-rt-task-list' }, 0],
    },
    taskItem: {
      content: 'paragraph block*',
      attrs: { checked: { default: false } },
      parseDOM: [{
        tag: 'li.pdx-rt-task-item',
        getAttrs: (el) => ({
          checked: !!(el as HTMLElement).querySelector('input[type="checkbox"]')?.hasAttribute('checked'),
        }),
      }],
      toDOM: (_node) => ['li', { class: 'pdx-rt-task-item' }, 0],
    },
  },
  commands: () => ({ toggleTaskList: wrapInTaskList() }),
};

export const ListItem: Extension = {
  name: 'listItem',
  nodes: {
    listItem: {
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
    },
  },
  commands: () => ({
    liftListItem: liftListItem(),
    sinkListItem: sinkListItem(),
  }),
};

export const HardBreak: Extension = {
  name: 'hardBreak',
  nodes: {
    hardBreak: {
      group: 'inline',
      inline: true,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  keymap: () => ({
    'Shift-Enter': (state, dispatch) => {
      if (dispatch) {
        const tr = createTransaction(state);
        const pos = selFrom(state.selection);
        tr.insert(pos, createNode('hardBreak'));
        dispatch(tr);
      }
      return true;
    },
  }),
};

export const HorizontalRule: Extension = {
  name: 'horizontalRule',
  nodes: {
    horizontalRule: {
      group: 'block',
      leaf: true,
      atom: true,
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
  },
  commands: () => ({
    insertHR: (state, dispatch) => {
      if (dispatch) {
        const from = selFrom(state.selection);
        const doc = state.doc;
        let offset = 0;
        const newChildren: DocNode[] = [];
        let cursorPos = 1;

        for (const child of doc.content) {
          const size = nodeSize(child);
          const childEnd = offset + size;

          if (childEnd > from && offset <= from && !isText(child)) {
            // Insert HR after this block, add empty paragraph for cursor
            newChildren.push(child);
            newChildren.push(createNode('horizontalRule'));
            const emptyP = createNode('paragraph', {}, [createText('')]);
            cursorPos = childEnd + 1 + 1; // after HR (1) + inside paragraph (1)
            newChildren.push(emptyP);
          } else {
            newChildren.push(child);
          }
          offset = childEnd;
        }

        const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
        const tr = createTransaction(state);
        tr.setMeta('replaceDoc', newDoc);
        tr.setMeta('historySel', { anchor: cursorPos, head: cursorPos, type: 'text' as const });
        dispatch(tr);
      }
      return true;
    },
  }),
};

export const Image: Extension = {
  name: 'image',
  nodes: {
    image: {
      group: 'block',
      leaf: true,
      atom: true,
      attrs: {
        src: { default: '' },
        alt: { default: '' },
        title: { default: '' },
        width: { default: null },
        align: { default: 'center' },
        caption: { default: '' },
      },
      parseDOM: [{
        tag: 'img[src]',
        getAttrs: (el) => ({
          src: (el as HTMLElement).getAttribute('src') ?? '',
          alt: (el as HTMLElement).getAttribute('alt') ?? '',
          title: (el as HTMLElement).getAttribute('title') ?? '',
        }),
      }],
      toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt }],
    },
  },
  commands: () => ({
    insertImage: (state, dispatch) => {
      if (!dispatch) return true; // can always insert
      // Show prompt only when explicitly called (not during command registration)
      setTimeout(() => {
        const src = window.prompt(uiString('rich-text', 'imageUrl'));
        if (!src) return;
        const alt = window.prompt(uiString('rich-text', 'imageAlt')) || '';
        // Insert image as a new block after current position
        const from = selFrom(state.selection);
        const doc = state.doc;
        let offset = 0;
        const newChildren: DocNode[] = [];
        let inserted = false;
        for (const child of doc.content) {
          const size = nodeSize(child);
          const childEnd = offset + size;
          newChildren.push(child);
          if (!inserted && childEnd > from) {
            newChildren.push(createNode('image', { src, alt, align: 'center' }));
            inserted = true;
          }
          offset = childEnd;
        }
        if (!inserted) newChildren.push(createNode('image', { src, alt, align: 'center' }));
        const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
        const tr = createTransaction(state);
        tr.setMeta('replaceDoc', newDoc);
        dispatch(tr);
      }, 0);
      return true;
    },
  }),
};

export const SelectAll: Extension = {
  name: 'selectAll',
  keymap: () => ({ 'Mod-a': selectAllCommand() }),
};
