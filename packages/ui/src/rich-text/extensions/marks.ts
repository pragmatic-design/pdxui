// ── Mark Extensions ───────────────────────────────────────────────
// Each mark extension defines: schema, commands, keybindings, parseDOM, toDOM.

import { sanitizeUrl } from '@pdxui/core';
import type { Extension } from '../state/plugin.js';
import { toggleMark } from '../commands/base.js';
import { createTransaction } from '../state/state.js';
import { createMark } from '../model/mark.js';
import { selFrom, selTo } from '../model/selection.js';
import { uiString } from '../../shared/i18n';

/** Link hrefs enter the model from paste, parse rules and user prompts; strip
 *  javascript:/data:/vbscript: at the frontier so no export path can emit a live one. */
function safeHref(href: string): string {
  return sanitizeUrl(href) ?? '';
}

export const Bold: Extension = {
  name: 'bold',
  marks: {
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b', getAttrs: (el) => (el as HTMLElement).style.fontWeight !== 'normal' ? {} : null },
        { style: 'font-weight', getAttrs: (v) => /^(bold|[6-9]\d{2}|[1-9]\d{3,})$/.test(v as string) ? {} : null },
      ],
      toDOM: () => ['strong', 0],
    },
  },
  commands: () => ({ toggleBold: toggleMark('bold') }),
  keymap: () => ({ 'Mod-b': toggleMark('bold') }),
};

export const Italic: Extension = {
  name: 'italic',
  marks: {
    italic: {
      parseDOM: [
        { tag: 'em' },
        { tag: 'i' },
        { style: 'font-style', getAttrs: (v) => v === 'italic' ? {} : null },
      ],
      toDOM: () => ['em', 0],
    },
  },
  commands: () => ({ toggleItalic: toggleMark('italic') }),
  keymap: () => ({ 'Mod-i': toggleMark('italic') }),
};

export const Underline: Extension = {
  name: 'underline',
  marks: {
    underline: {
      parseDOM: [
        { tag: 'u' },
        { style: 'text-decoration', getAttrs: (v) => (v as string).includes('underline') ? {} : null },
      ],
      toDOM: () => ['u', 0],
    },
  },
  commands: () => ({ toggleUnderline: toggleMark('underline') }),
  keymap: () => ({ 'Mod-u': toggleMark('underline') }),
};

export const Strike: Extension = {
  name: 'strike',
  marks: {
    strike: {
      parseDOM: [
        { tag: 's' },
        { tag: 'del' },
        { tag: 'strike' },
        { style: 'text-decoration', getAttrs: (v) => (v as string).includes('line-through') ? {} : null },
      ],
      toDOM: () => ['s', 0],
    },
  },
  commands: () => ({ toggleStrike: toggleMark('strike') }),
  keymap: () => ({ 'Mod-Shift-x': toggleMark('strike') }),
};

export const Code: Extension = {
  name: 'code',
  marks: {
    code: {
      excludes: '_all',
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
  },
  commands: () => ({ toggleCode: toggleMark('code') }),
  keymap: () => ({ 'Mod-e': toggleMark('code') }),
};

export const Link: Extension = {
  name: 'link',
  marks: {
    link: {
      attrs: { href: { default: '' }, title: { default: '' }, target: { default: '' } },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs: (el) => ({
          href: safeHref((el as HTMLElement).getAttribute('href') ?? ''),
          title: (el as HTMLElement).getAttribute('title') ?? '',
          target: (el as HTMLElement).getAttribute('target') ?? '',
        }),
      }],
      toDOM: (mark) => ['a', { href: mark.attrs.href, rel: 'noopener noreferrer' }, 0],
    },
  },
  commands: () => ({
    setLink: (state, dispatch) => {
      const from = selFrom(state.selection);
      const to = selTo(state.selection);
      if (from === to) return false; // need selection

      if (dispatch) {
        // Use a simple prompt for URL (proper popover would be better)
        const href = window.prompt?.(uiString('rich-text', 'linkUrl'));
        if (!href) return false;
        const tr = createTransaction(state);
        tr.addMark(from, to, createMark('link', { href: safeHref(href) }));
        dispatch(tr);
      }
      return true;
    },
    unsetLink: (state, dispatch) => {
      const from = selFrom(state.selection);
      const to = selTo(state.selection);
      if (from === to) return false;

      if (dispatch) {
        const tr = createTransaction(state);
        tr.removeMark(from, to, createMark('link'));
        dispatch(tr);
      }
      return true;
    },
  }),
  keymap: () => ({
    'Mod-k': (state: any, dispatch: any) => {
      const from = selFrom(state.selection);
      const to = selTo(state.selection);
      if (from === to) return false;
      if (dispatch) {
        const href = window.prompt?.(uiString('rich-text', 'linkUrl'));
        if (!href) return false;
        const tr = createTransaction(state);
        tr.addMark(from, to, createMark('link', { href: safeHref(href) }));
        dispatch(tr);
      }
      return true;
    },
  }),
};

export const Highlight: Extension = {
  name: 'highlight',
  marks: {
    highlight: {
      attrs: { color: { default: 'yellow' } },
      parseDOM: [
        { tag: 'mark' },
        { style: 'background-color', getAttrs: (v) => v ? { color: v } : null },
      ],
      toDOM: (mark) => ['mark', mark.attrs.color !== 'yellow' ? { style: `background-color:${mark.attrs.color}` } : {}, 0],
    },
  },
  commands: () => ({ toggleHighlight: toggleMark('highlight') }),
  keymap: () => ({ 'Mod-Shift-h': toggleMark('highlight') }),
};

export const TextColor: Extension = {
  name: 'textColor',
  marks: {
    textColor: {
      attrs: { color: { default: '' } },
      parseDOM: [
        { style: 'color', getAttrs: (v) => v ? { color: v } : null },
      ],
      toDOM: (mark) => ['span', { style: `color:${mark.attrs.color}` }, 0],
    },
  },
};

export const Subscript: Extension = {
  name: 'subscript',
  marks: {
    subscript: {
      excludes: 'superscript',
      parseDOM: [{ tag: 'sub' }],
      toDOM: () => ['sub', 0],
    },
  },
  commands: () => ({ toggleSubscript: toggleMark('subscript') }),
};

export const Superscript: Extension = {
  name: 'superscript',
  marks: {
    superscript: {
      excludes: 'subscript',
      parseDOM: [{ tag: 'sup' }],
      toDOM: () => ['sup', 0],
    },
  },
  commands: () => ({ toggleSuperscript: toggleMark('superscript') }),
};
