// ── Toolbar Engine ────────────────────────────────────────────────
// Configurable toolbar that reads editor state and dispatches commands.
// Supports string-based config DSL: "bold italic | heading | list | link"

import { marksAtSelection } from '../model/selection.js';
import type { EditorView } from '../view/view.js';
import type { Mark } from '../model/types.js';
import { uiString, uiAttr} from '../../shared/i18n';

export interface ToolbarItem {
  name: string;
  icon: string;
  /** Key of the button's name in the `rich-text` component strings — never the text itself. */
  label: string;
  /** Shortcut appended to the name at render, outside the translatable text. */
  shortcut?: string;
  command: string;
  isActive?: (state: any) => boolean;
  isDisabled?: (state: any) => boolean;
  type?: 'button' | 'dropdown' | 'separator';
  children?: ToolbarItem[];  // for dropdowns
}

// ── Built-in toolbar items ────────────────────────────────────

// `label` is a key, not text: the names live in the component-string registry (shared/i18n.ts,
// `rich-text`), so an app translates them.
const TOOLBAR_ITEMS: Record<string, ToolbarItem> = {
  bold: { name: 'bold', icon: 'bold', label: 'bold', shortcut: 'Ctrl+B', command: 'toggleBold',
    isActive: (s) => hasMarkInSelection(s, 'bold') },
  italic: { name: 'italic', icon: 'italic', label: 'italic', shortcut: 'Ctrl+I', command: 'toggleItalic',
    isActive: (s) => hasMarkInSelection(s, 'italic') },
  underline: { name: 'underline', icon: 'underline', label: 'underline', shortcut: 'Ctrl+U', command: 'toggleUnderline',
    isActive: (s) => hasMarkInSelection(s, 'underline') },
  strike: { name: 'strike', icon: 'strikethrough', label: 'strike', command: 'toggleStrike',
    isActive: (s) => hasMarkInSelection(s, 'strike') },
  code: { name: 'code', icon: 'code', label: 'code', shortcut: 'Ctrl+E', command: 'toggleCode',
    isActive: (s) => hasMarkInSelection(s, 'code') },
  link: { name: 'link', icon: 'link', label: 'link', shortcut: 'Ctrl+K', command: 'setLink' },
  highlight: { name: 'highlight', icon: 'highlighter', label: 'highlight', command: 'toggleHighlight',
    isActive: (s) => hasMarkInSelection(s, 'highlight') },

  // Block types
  heading1: { name: 'heading1', icon: 'heading-1', label: 'heading1', command: 'setHeading1' },
  heading2: { name: 'heading2', icon: 'heading-2', label: 'heading2', command: 'setHeading2' },
  heading3: { name: 'heading3', icon: 'heading-3', label: 'heading3', command: 'setHeading3' },
  heading: { name: 'heading', icon: 'heading', label: 'heading', command: 'setHeading1', type: 'dropdown',
    children: [
      { name: 'h1', icon: 'heading-1', label: 'heading1', command: 'setHeading1' },
      { name: 'h2', icon: 'heading-2', label: 'heading2', command: 'setHeading2' },
      { name: 'h3', icon: 'heading-3', label: 'heading3', command: 'setHeading3' },
    ] },
  quote: { name: 'quote', icon: 'quote', label: 'quote', command: 'toggleBlockquote' },
  codeblock: { name: 'codeblock', icon: 'file-code', label: 'codeblock', command: 'toggleCodeBlock' },

  // Lists
  bulletList: { name: 'bulletList', icon: 'list', label: 'bulletList', command: 'toggleBulletList' },
  orderedList: { name: 'orderedList', icon: 'list-ordered', label: 'orderedList', command: 'toggleOrderedList' },
  taskList: { name: 'taskList', icon: 'list-checks', label: 'taskList', command: 'toggleTaskList' },
  list: { name: 'list', icon: 'list', label: 'list', command: 'toggleBulletList', type: 'dropdown',
    children: [
      { name: 'bullet', icon: 'list', label: 'bulletList', command: 'toggleBulletList' },
      { name: 'ordered', icon: 'list-ordered', label: 'orderedList', command: 'toggleOrderedList' },
      { name: 'task', icon: 'list-checks', label: 'taskList', command: 'toggleTaskList' },
    ] },

  // Other
  image: { name: 'image', icon: 'image', label: 'image', command: 'insertImage' },
  hr: { name: 'hr', icon: 'minus', label: 'hr', command: 'insertHR' },
  undo: { name: 'undo', icon: 'undo', label: 'undo', shortcut: 'Ctrl+Z', command: 'undo' },
  redo: { name: 'redo', icon: 'redo', label: 'redo', shortcut: 'Ctrl+Y', command: 'redo' },
  source: { name: 'source', icon: 'code', label: 'source', command: 'toggleSource' },
};

/** A button's name: the registered string, then the shortcut, so a translation cannot drop it. */
function itemName(item: ToolbarItem): string {
  const text = uiString('rich-text', item.label);
  return item.shortcut ? `${text} (${item.shortcut})` : text;
}

// ── Preset toolbar configs ────────────────────────────────────

export const TOOLBAR_PRESETS: Record<string, string> = {
  full: 'bold italic underline strike | heading list quote codeblock | link image hr | undo redo | source',
  standard: 'bold italic underline | heading list | link image | undo redo | source',
  compact: 'bold italic | link | undo redo',
  minimal: 'bold italic code',
};

// ── Parse toolbar config DSL ──────────────────────────────────

export function parseToolbarConfig(config: string | boolean): ToolbarItem[][] {
  if (config === false) return [];
  if (config === true) config = TOOLBAR_PRESETS.standard;

  const preset = TOOLBAR_PRESETS[config as string];
  if (preset) config = preset;

  const groups: ToolbarItem[][] = [];
  const sections = (config as string).split('|').map(s => s.trim());

  for (const section of sections) {
    const items: ToolbarItem[] = [];
    const names = section.split(/\s+/);
    for (const name of names) {
      const item = TOOLBAR_ITEMS[name];
      if (item) items.push(item);
    }
    if (items.length > 0) groups.push(items);
  }

  return groups;
}

// ── Render toolbar DOM ────────────────────────────────────────

export function renderToolbar(
  groups: ToolbarItem[][],
  view: EditorView,
  container: HTMLElement,
): void {
  container.innerHTML = '';
  container.classList.add('pdx-rt-toolbar');
  container.setAttribute('role', 'toolbar');
  uiAttr(container, 'aria-label', () => uiString('rich-text', 'toolbar'));

  for (let gi = 0; gi < groups.length; gi++) {
    if (gi > 0) {
      const sep = document.createElement('div');
      sep.classList.add('pdx-rt-toolbar-sep');
      container.appendChild(sep);
    }

    const group = document.createElement('div');
    group.classList.add('pdx-rt-toolbar-group');

    for (const item of groups[gi]) {
      const btn = createToolbarButton(item, view);
      group.appendChild(btn);
    }

    container.appendChild(group);
  }

  // One tab stop, arrow keys inside it (WAI-ARIA toolbar), so the keyboard reaches the toolbar.
  // Not core's focusGroup: it
  // focuses the item on pointerdown, and a click must leave the focus in the editor.
  const all = container.querySelectorAll<HTMLButtonElement>('.pdx-rt-toolbar-btn');
  all.forEach((b, i) => { b.tabIndex = i === 0 ? 0 : -1; });
  const previous = toolbarKeydown.get(container);
  if (previous) container.removeEventListener('keydown', previous);
  const onKeydown = (e: KeyboardEvent): void => moveToolbarFocus(container, e);
  toolbarKeydown.set(container, onKeydown);
  container.addEventListener('keydown', onKeydown);
}

/** The keydown listener each toolbar container holds, so a re-render replaces it instead of adding one. */
const toolbarKeydown = new WeakMap<HTMLElement, (e: KeyboardEvent) => void>();

/** Left/Right/Home/End between the enabled buttons, wrapping; the focused one becomes the tab stop. */
function moveToolbarFocus(container: HTMLElement, e: KeyboardEvent): void {
  const all = Array.from(container.querySelectorAll<HTMLButtonElement>('.pdx-rt-toolbar-btn'));
  const enabled = all.filter(b => !b.disabled);
  const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0 || enabled.length === 0) return;
  let next: number;
  switch (e.key) {
    case 'ArrowRight': next = (at + 1) % enabled.length; break;
    case 'ArrowLeft': next = (at - 1 + enabled.length) % enabled.length; break;
    case 'Home': next = 0; break;
    case 'End': next = enabled.length - 1; break;
    default: return;
  }
  e.preventDefault();
  for (const b of all) b.tabIndex = -1;
  enabled[next].tabIndex = 0;
  enabled[next].focus();
}

function createToolbarButton(item: ToolbarItem, view: EditorView): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('pdx-rt-toolbar-btn');
  const name = itemName(item);
  btn.title = name;
  btn.dataset.command = item.command;
  btn.setAttribute('aria-label', name);
  btn.tabIndex = -1;

  // Icon — use pdx-icon custom element
  const icon = document.createElement('pdx-icon');
  icon.setAttribute('name', item.icon);
  icon.setAttribute('size', '16');
  btn.appendChild(icon);

  // Click handler
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // don't steal focus from editor
    view.execCommand(item.command);
  });
  // Enter and Space on a focused button fire a click with detail 0 and no mousedown before it. A
  // mouse click (detail ≥ 1) already ran the command on mousedown.
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) view.execCommand(item.command);
  });

  return btn;
}

/** Update toolbar state (active/disabled buttons) */
export function updateToolbarState(container: HTMLElement, state: any): void {
  const buttons = container.querySelectorAll<HTMLElement>('.pdx-rt-toolbar-btn');
  for (const btn of buttons) {
    const cmd = btn.dataset.command;
    if (!cmd) continue;

    const item = Object.values(TOOLBAR_ITEMS).find(i => i.command === cmd);
    if (!item) continue;

    const active = item.isActive?.(state) ?? false;
    const disabled = item.isDisabled?.(state) ?? false;

    btn.classList.toggle('pdx-rt-active', active);
    btn.classList.toggle('pdx-rt-disabled', disabled);
    btn.setAttribute('aria-pressed', String(active));
    (btn as HTMLButtonElement).disabled = disabled;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function hasMarkInSelection(state: any, markType: string): boolean {
  // At a caret with marks pending (Ctrl+B, not typed yet), the button shows what will be typed.
  if (state.storedMarks && state.selection.anchor === state.selection.head) {
    return (state.storedMarks as readonly Mark[]).some(m => m.type === markType);
  }
  try {
    const marks = marksAtSelection(state.doc, state.selection);
    return marks.some((m: any) => m.type === markType);
  } catch {
    return false;
  }
}
