// ── Editor View ───────────────────────────────────────────────────
// The bridge between the document model and the DOM.
// Model is source of truth → DOM is a projection of model state.
// Synchronous reconciliation after each transaction (ProseMirror approach).

import type { DocNode, Mark, Pos, Selection } from '../model/types.js';
import { createNode, createText, isText, nodeSize, contentSize, textAt, textContent, sliceBetween, resolvePos } from '../model/node.js';
import { marksEq } from '../model/mark.js';
import { createSelection, selFrom, selTo, isCollapsed } from '../model/selection.js';
import {
  EditorState, EditorTransaction, createEditorState, applyTransaction, createTransaction,
  type EditorStateConfig,
} from '../state/state.js';
import { DOMObserver, type DOMObserverCallbacks } from './dom-observer.js';
import { CompositionHandler } from './composition.js';
import { DecorationSet } from './decoration.js';
import { domSelectionPoints, sameDOMSelection, type DOMSelectionPoints } from './dom-selection-points.js';
import { serializeToClipboardHTML, parseClipboardHTML } from './clipboard.js';
import { highlightToHTML } from '../extensions/code-highlight.js';
import { outdentListItemAt } from '../commands/list.js';
import { sanitizeUrl } from '@pdxui/core';
import { uiString } from '../../shared/i18n';

/** A shallow comparison of a node's attrs (for the incremental path). */
function attrsShallowEq(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
    if (a === b) return true;
    const ka = Object.keys(a ?? {});
    const kb = Object.keys(b ?? {});
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
    }
    return true;
}
import { joinBlockAfterContainer } from '../commands/join.js';

// ── Editor View ───────────────────────────────────────────────────

export interface EditorViewConfig extends EditorStateConfig {
  /** DOM element to mount into (or will be created) */
  element?: HTMLElement;
  /** Called on every state change */
  onUpdate?: (state: EditorState) => void;
  /** Called on focus */
  onFocus?: () => void;
  /** Called on blur */
  onBlur?: () => void;
  /** Intercept transactions before they're applied */
  filterTransaction?: (tr: EditorTransaction) => boolean;
}

export class EditorView {
  state: EditorState;
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;

  private domObserver: DOMObserver;
  private composition: CompositionHandler;
  private config: EditorViewConfig;
  private focused = false;
  private decorations: DecorationSet = DecorationSet.empty;
  private sourceView: HTMLPreElement | null = null;
  private sourceMode = false;
  /** True while syncDOMSelection writes the DOM selection: the selectionchange it fires is ours. */
  private writingDOMSelection = false;
  /** The DOM selection as the last syncDOMSelection left it, to tell its queued echo from a user move. */
  private writtenDOMSelection: DOMSelectionPoints | null = null;

  constructor(config: EditorViewConfig) {
    this.config = config;
    this.state = createEditorState(config);

    // Create or use provided DOM element
    this.dom = config.element ?? document.createElement('div');
    this.dom.classList.add('pdx-rt-editor');

    // The contenteditable element
    this.contentDOM = document.createElement('div');
    this.contentDOM.classList.add('pdx-rt-content');
    this.contentDOM.setAttribute('contenteditable', 'true');
    this.contentDOM.setAttribute('role', 'textbox');
    this.contentDOM.setAttribute('aria-multiline', 'true');
    this.contentDOM.setAttribute('spellcheck', 'true');
    this.contentDOM.setAttribute('autocorrect', 'on');
    this.contentDOM.setAttribute('autocapitalize', 'sentences');

    // Prevent default styles from host
    this.contentDOM.style.outline = 'none';
    this.contentDOM.style.whiteSpace = 'pre-wrap';
    this.contentDOM.style.wordWrap = 'break-word';
    this.contentDOM.style.overflowWrap = 'break-word';

    this.dom.appendChild(this.contentDOM);

    // Setup DOM observer
    this.domObserver = new DOMObserver(this.contentDOM, this.createObserverCallbacks());

    // Setup composition handler
    this.composition = new CompositionHandler({
      getSelection: () => this.state.selection,
      getTextAtPos: (pos, length) => textAt(this.state.doc, pos, length),
      applyComposedText: (from, to, text) => {
        const tr = this.createTransaction();
        if (from !== to) tr.delete(from, to);
        tr.insertText(text, from);
        this.dispatch(tr);
      },
    });

    // Clean any stale state from HMR/previous lifecycle
    this.contentDOM.style.display = '';
    this.contentDOM.parentElement?.querySelector('.pdx-rt-source')?.remove();
    this.sourceMode = false;
    this.sourceView = null;

    // Initial render
    this.domObserver.suppressWhile(() => {
      this.renderDOM();
    });

    // Init extensions
    for (const ext of this.state.extensions) {
      ext.onInit?.({
        schema: this.state.schema,
        getState: () => this.state,
        dispatch: (tr) => this.dispatch(tr as EditorTransaction),
        getEditorElement: () => this.contentDOM,
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────

  /** Create a new transaction */
  createTransaction(): EditorTransaction {
    return createTransaction(this.state);
  }

  /** Dispatch a transaction (apply changes) */
  dispatch(tr: EditorTransaction): void {
    if (this.config.filterTransaction && !this.config.filterTransaction(tr)) return;

    const prevState = this.state;
    this.state = applyTransaction(this.state, tr);

    // Detect doc change (either via steps or via history replacement)
    const docActuallyChanged = this.state.doc !== prevState.doc;

    // Synchronous DOM update
    if (docActuallyChanged) {
      this.domObserver.suppressWhile(() => {
        if (tr.getMeta('historyDoc') || tr.getMeta('replaceDoc')) {
          // Doc was swapped entirely — full re-render
          this.renderDOM();
        } else {
          // Normal: incremental update
          this.updateDOM(prevState.doc, this.state.doc);
        }
      });
    }

    // Update DOM selection
    if (docActuallyChanged || this.state.selection !== prevState.selection) {
      this.syncDOMSelection();
    }

    // Scroll into view if requested
    if (tr.shouldScrollIntoView) {
      this.scrollCursorIntoView();
    }

    // Notify extensions
    const ctx = {
      schema: this.state.schema,
      getState: () => this.state,
      dispatch: (t: any) => this.dispatch(t),
      getEditorElement: () => this.contentDOM,
    };
    for (const ext of this.state.extensions) {
      ext.onUpdate?.(ctx, prevState);
    }

    // Collect decorations from extensions
    this.decorations = DecorationSet.empty;
    for (const ext of this.state.extensions) {
      if (ext.decorations) {
        const decs = ext.decorations(this.state);
        if (decs.length > 0) {
          this.decorations = this.decorations.add([...decs]);
        }
      }
    }

    // Notify config callback
    this.config.onUpdate?.(this.state);
  }

  /** Execute a named command */
  execCommand(name: string): boolean {
    // Built-in commands
    if (name === 'toggleSource') return this.toggleSourceView();

    const cmd = this.state.commands[name];
    if (!cmd) return false;
    return cmd(this.state, (tr) => this.dispatch(tr as EditorTransaction));
  }

  /** Toggle HTML source view */
  private toggleSourceView(): boolean {
    this.sourceMode = !this.sourceMode;
    if (this.sourceMode) {
      // Show source
      if (!this.sourceView) {
        this.sourceView = document.createElement('pre');
        this.sourceView.classList.add('pdx-rt-source');
        this.sourceView.style.cssText = 'padding:var(--pdx-space-md);font-family:var(--pdx-font-mono,monospace);font-size:var(--pdx-text-sm);white-space:pre-wrap;word-break:break-all;background:var(--pdx-color-surface-alt,#f5f5f5);border-top:1px solid var(--pdx-color-border);margin:0;overflow:auto;max-height:300px;';
      }
      // Use model serialization (not DOM innerHTML which includes editor UI like image toolbar)
      const html = serializeToClipboardHTML(this.state.doc.content);
      const pretty = html.replace(/></g, '>\n<');
      this.sourceView.textContent = pretty;
      this.contentDOM.style.display = 'none';
      this.contentDOM.parentElement?.appendChild(this.sourceView);
    } else {
      // Hide source
      this.contentDOM.style.display = '';
      this.sourceView?.remove();
    }
    return true;
  }

  /** Check if a command can execute (without dispatching) */
  canExecCommand(name: string): boolean {
    const cmd = this.state.commands[name];
    if (!cmd) return false;
    return cmd(this.state); // no dispatch = dry run
  }

  /** Focus the editor */
  focus(): void {
    this.contentDOM.focus();
  }

  /** Blur the editor */
  blur(): void {
    this.contentDOM.blur();
  }

  get isFocused(): boolean { return this.focused; }
  get isComposing(): boolean { return this.composition.isComposing; }

  /** Destroy the view and clean up */
  // Listeners the per-node widgets register on document (image resize/deselect):
  // they must be removed on destroy too — a destroy with an image selected or a
  // drag-resize in progress would leave them orphaned.
  private _docListeners: Array<[string, EventListener]> = [];

  private addDocListener(type: string, fn: EventListener): void {
    this._docListeners.push([type, fn]);
    document.addEventListener(type, fn);
  }

  private removeDocListener(type: string, fn: EventListener): void {
    document.removeEventListener(type, fn);
    const i = this._docListeners.findIndex(([t, f]) => t === type && f === fn);
    if (i >= 0) this._docListeners.splice(i, 1);
  }

  destroy(): void {
    const ctx = {
      schema: this.state.schema,
      getState: () => this.state,
      dispatch: (t: any) => this.dispatch(t),
      getEditorElement: () => this.contentDOM,
    };
    for (const ext of this.state.extensions) {
      ext.onDestroy?.(ctx);
    }
    for (const [t, f] of this._docListeners) document.removeEventListener(t, f);
    this._docListeners = [];
    this.composition.destroy();
    this.domObserver.destroy();
    this.contentDOM.removeAttribute('contenteditable');
  }

  // ── DOM Rendering ───────────────────────────────────────────

  /** Full re-render of content DOM from model */
  private renderDOM(): void {
    const fragment = this.renderNode(this.state.doc);
    this.contentDOM.innerHTML = '';
    while (fragment.firstChild) {
      this.contentDOM.appendChild(fragment.firstChild);
    }
  }

  /** Incremental DOM update: diff old and new doc, patch only changed nodes. */
  private updateDOM(oldDoc: DocNode, newDoc: DocNode): void {
    if (oldDoc === newDoc) return; // same reference = no change
    this.updateChildren(this.contentDOM, oldDoc.content, newDoc.content);
  }

  /** Diff and patch children of a DOM parent node. */
  private updateChildren(parentDOM: Node, oldChildren: readonly DocNode[], newChildren: readonly DocNode[]): void {
    const domNodes = Array.from(parentDOM.childNodes);
    const maxLen = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLen; i++) {
      const oldChild = oldChildren[i];
      const newChild = newChildren[i];

      if (!newChild) {
        // Node was removed
        if (domNodes[i]) parentDOM.removeChild(domNodes[i]);
        continue;
      }

      if (!oldChild) {
        // Node was added
        const frag = this.renderNode(createNode('doc', {}, [newChild]));
        parentDOM.appendChild(frag.firstChild!);
        continue;
      }

      if (oldChild === newChild) continue; // unchanged

      const domChild = domNodes[i];
      if (!domChild) {
        // DOM node missing — append
        const frag = this.renderNode(createNode('doc', {}, [newChild]));
        parentDOM.appendChild(frag.firstChild!);
        continue;
      }

      // Same type?
      if (oldChild.type === newChild.type) {
        if (isText(oldChild) && isText(newChild)) {
          // Text node changed: update text content and marks
          if (oldChild.text !== newChild.text || !marksEq(oldChild.marks, newChild.marks)) {
            const newDom = this.renderTextWithMarks(newChild.text!, newChild.marks);
            parentDOM.replaceChild(newDom, domChild);
          }
        } else if (!attrsShallowEq(oldChild.attrs, newChild.attrs)) {
          // Changed attrs (heading level, ol start, align...): re-render the
          // node, or the incremental path would ignore them.
          const frag = this.renderNode(createNode('doc', {}, [newChild]));
          parentDOM.replaceChild(frag.firstChild!, domChild);
        } else {
          // Same element type: recurse into children
          this.updateChildren(domChild, oldChild.content, newChild.content);
        }
      } else {
        // Different type: full replace
        const frag = this.renderNode(createNode('doc', {}, [newChild]));
        parentDOM.replaceChild(frag.firstChild!, domChild);
      }
    }

    // Remove excess DOM nodes
    while (parentDOM.childNodes.length > newChildren.length) {
      parentDOM.removeChild(parentDOM.lastChild!);
    }
  }

  /** Render a model node's CHILDREN into a DocumentFragment.
   *  Used for the doc node (whose children go directly into contentDOM). */
  private renderNode(node: DocNode): DocumentFragment {
    const frag = document.createDocumentFragment();
    for (const child of node.content) {
      frag.appendChild(this.renderSingleNode(child));
    }
    return frag;
  }

  /** Render a single model node (element or text) into a DOM node. */
  private renderSingleNode(node: DocNode): Node {
    if (isText(node)) {
      return this.renderTextWithMarks(node.text!, node.marks);
    }

    // Special case: code block with syntax highlighting
    if (node.type === 'codeBlock') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      const lang = (node.attrs.language as string) || '';
      if (lang) code.className = `language-${lang}`;
      const text = node.content.map(c => c.text ?? '').join('');
      if (lang) {
        code.innerHTML = highlightToHTML(text, lang);
      } else {
        code.textContent = text || '\u200B';
      }
      pre.appendChild(code);
      return pre;
    }

    const el = this.createElementForNode(node);
    if (!el) return document.createTextNode('');

    // Render children recursively
    for (const child of node.content) {
      el.appendChild(this.renderSingleNode(child));
    }

    // Empty block? Add <br> placeholder so it's visible/clickable
    if (node.content.length === 0 ||
        (node.content.length === 1 && isText(node.content[0]) && node.content[0].text === '')) {
      el.appendChild(document.createElement('br'));
    }

    return el;
  }

  private createElementForNode(node: DocNode): HTMLElement | null {
    switch (node.type) {
      case 'paragraph': return document.createElement('p');
      case 'heading': {
        const level = Math.min(6, Math.max(1, (node.attrs.level as number) || 1));
        return document.createElement(`h${level}`);
      }
      case 'blockquote': return document.createElement('blockquote');
      case 'codeBlock': {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        if (node.attrs.language) code.className = `language-${node.attrs.language}`;
        pre.appendChild(code);
        return pre;
      }
      case 'bulletList': return document.createElement('ul');
      case 'orderedList': {
        const ol = document.createElement('ol');
        if (node.attrs.start && node.attrs.start !== 1) ol.start = node.attrs.start as number;
        return ol;
      }
      case 'taskList': {
        const ul = document.createElement('ul');
        ul.classList.add('pdx-rt-task-list');
        return ul;
      }
      case 'listItem': return document.createElement('li');
      case 'taskItem': {
        const li = document.createElement('li');
        li.classList.add('pdx-rt-task-item');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = node.attrs.checked as boolean || false;
        checkbox.classList.add('pdx-rt-task-checkbox');
        checkbox.addEventListener('click', (e) => {
          e.preventDefault();
          // Toggle checked state in model
          this.toggleTaskItem(node);
        });
        li.prepend(checkbox);
        return li;
      }
      case 'image': {
        const figure = document.createElement('figure');
        figure.classList.add('pdx-rt-image');
        figure.contentEditable = 'false'; // atom: not editable
        const align = (node.attrs.align as string) || 'center';
        figure.dataset.align = align;

        // Image element
        const img = document.createElement('img');
        // data:image/* is the format of the paste/drop (FileReader): sanitizeUrl
        // refuses it (rightly for links, not for images), and every pasted image
        // would render empty. Only the image/ subtype is
        // allowed: data:text/html and the others stay blocked.
        const rawSrc = node.attrs.src as string;
        img.src = /^data:image\//i.test(rawSrc) ? rawSrc : (sanitizeUrl(rawSrc) ?? '');
        if (node.attrs.alt) img.alt = node.attrs.alt as string;
        if (node.attrs.title) img.title = node.attrs.title as string;
        if (node.attrs.width) img.style.width = `${node.attrs.width}px`;
        img.draggable = false; // prevent native img drag

        // ── Image wrapper (inline-block so resize handle follows) ──
        const imgWrap = document.createElement('div');
        imgWrap.classList.add('pdx-rt-image-wrap');

        // ── Resize handle ──
        const resizeHandle = document.createElement('div');
        resizeHandle.classList.add('pdx-rt-image-resize');
        let startX = 0, startW = 0;
        resizeHandle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          startX = e.clientX;
          startW = img.offsetWidth;
          const onMove = (ev: MouseEvent) => {
            const newW = Math.max(50, startW + (ev.clientX - startX));
            img.style.width = `${newW}px`;
          };
          const onUp = () => {
            this.removeDocListener('mousemove', onMove as EventListener);
            this.removeDocListener('mouseup', onUp as EventListener);
            this.updateImageAttr(node, { width: img.offsetWidth });
          };
          this.addDocListener('mousemove', onMove as EventListener);
          this.addDocListener('mouseup', onUp as EventListener);
        });

        // ── Alignment + delete toolbar (positioned relative to imgWrap) ──
        const toolbar = document.createElement('div');
        toolbar.classList.add('pdx-rt-image-toolbar');
        toolbar.style.display = 'none';
        const alignIcons: Record<string, string> = { left: '⬅', center: '⬌', right: '➡', full: '↔' };
        // Registry keys, one per alignment: 'left' is a value, not a word a translation can reuse.
        const alignLabels: Record<string, string> = {
          left: 'alignLeft', center: 'alignCenter', right: 'alignRight', full: 'alignFull',
        };
        for (const a of ['left', 'center', 'right', 'full']) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = alignIcons[a];
          // The arrow glyph would be the accessible name; the label names the action instead.
          const alignName = uiString('rich-text', alignLabels[a]);
          btn.title = alignName;
          btn.setAttribute('aria-label', alignName);
          btn.classList.add('pdx-rt-image-align-btn');
          if (a === align) btn.classList.add('pdx-rt-active');
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.updateImageAttr(node, { align: a });
          });
          toolbar.appendChild(btn);
        }
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '✕';
        const removeName = uiString('rich-text', 'removeImage');
        delBtn.title = removeName;
        delBtn.setAttribute('aria-label', removeName);
        delBtn.classList.add('pdx-rt-image-align-btn', 'pdx-rt-image-del');
        delBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.removeImageNode(node);
        });
        toolbar.appendChild(delBtn);

        // ── Caption ──
        const cap = document.createElement('figcaption');
        cap.classList.add('pdx-rt-image-caption');
        cap.contentEditable = 'true';
        cap.textContent = (node.attrs.caption as string) || '';
        cap.setAttribute('placeholder', 'Add caption...');
        // Stop editor from intercepting caption input
        cap.addEventListener('beforeinput', (e) => e.stopPropagation());
        cap.addEventListener('keydown', (e) => e.stopPropagation());
        cap.addEventListener('blur', () => {
          this.updateImageAttr(node, { caption: cap.textContent || '' });
        });

        // Click on image → select + show toolbar
        imgWrap.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.pdx-rt-image-caption')) return;
          e.stopPropagation();
          figure.classList.add('pdx-rt-image-selected');
          toolbar.style.display = 'flex';
        });

        // Click outside → deselect
        const deselect = (e: MouseEvent) => {
          if (!figure.contains(e.target as Node)) {
            figure.classList.remove('pdx-rt-image-selected');
            toolbar.style.display = 'none';
            this.removeDocListener('click', deselect as EventListener);
          }
        };
        figure.addEventListener('click', () => {
          setTimeout(() => this.addDocListener('click', deselect as EventListener), 0);
        });

        // Drag & drop: make figure draggable to reposition in document
        figure.draggable = true;
        figure.addEventListener('dragstart', (e) => {
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', '__pdx-image-drag__');
          (this as any)._draggedImageNode = node;
          figure.classList.add('pdx-rt-image-dragging');
        });
        figure.addEventListener('dragend', () => {
          figure.classList.remove('pdx-rt-image-dragging');
          (this as any)._draggedImageNode = null;
        });

        // Assemble: toolbar inside imgWrap (positioned relative to image)
        imgWrap.appendChild(img);
        imgWrap.appendChild(resizeHandle);
        imgWrap.appendChild(toolbar);
        figure.appendChild(imgWrap);
        figure.appendChild(cap);

        return figure;
      }
      case 'horizontalRule': return document.createElement('hr');
      case 'hardBreak': return document.createElement('br');
      case 'table': {
        const table = document.createElement('div');
        table.classList.add('pdx-rt-table');
        table.setAttribute('role', 'table');
        return table;
      }
      case 'tableRow': {
        const row = document.createElement('div');
        row.classList.add('pdx-rt-table-row');
        row.setAttribute('role', 'row');
        return row;
      }
      case 'tableCell': {
        const cell = document.createElement('div');
        cell.classList.add('pdx-rt-table-cell');
        cell.setAttribute('role', node.attrs.header ? 'columnheader' : 'cell');
        if ((node.attrs.colspan as number) > 1) cell.style.gridColumn = `span ${node.attrs.colspan}`;
        if ((node.attrs.rowspan as number) > 1) cell.style.gridRow = `span ${node.attrs.rowspan}`;
        return cell;
      }
      default: {
        // Unknown node type — render as div
        const div = document.createElement('div');
        div.dataset.nodeType = node.type;
        return div;
      }
    }
  }

  private renderTextWithMarks(text: string, marks: readonly Mark[]): Node {
    if (text === '' || marks.length === 0) {
      return document.createTextNode(text || '\u200B'); // ZWS for empty text
    }

    // Nest mark elements: bold wraps italic wraps text
    let current: Node = document.createTextNode(text);
    for (const mark of marks) {
      const el = this.createElementForMark(mark);
      el.appendChild(current);
      current = el;
    }
    return current;
  }

  private createElementForMark(mark: Mark): HTMLElement {
    switch (mark.type) {
      case 'bold': return document.createElement('strong');
      case 'italic': return document.createElement('em');
      case 'underline': {
        const u = document.createElement('u');
        return u;
      }
      case 'strike': return document.createElement('s');
      case 'code': return document.createElement('code');
      case 'link': {
        const a = document.createElement('a');
        a.href = sanitizeUrl(mark.attrs.href as string) ?? '#'; // block javascript:/data: from pasted/typed links
        if (mark.attrs.title) a.title = mark.attrs.title as string;
        if (mark.attrs.target) a.target = mark.attrs.target as string;
        a.rel = 'noopener noreferrer';
        return a;
      }
      case 'highlight': {
        const span = document.createElement('mark');
        if (mark.attrs.color && mark.attrs.color !== 'yellow') {
          span.style.backgroundColor = mark.attrs.color as string;
        }
        return span;
      }
      case 'textColor': {
        const span = document.createElement('span');
        span.style.color = mark.attrs.color as string;
        return span;
      }
      case 'subscript': return document.createElement('sub');
      case 'superscript': return document.createElement('sup');
      default: {
        const span = document.createElement('span');
        span.dataset.markType = mark.type;
        return span;
      }
    }
  }

  // ── Selection Sync ──────────────────────────────────────────

  /** Sync model selection → DOM selection */
  private syncDOMSelection(): void {
    if (this.composition.isComposing) return;

    const sel = this.state.selection;
    const domSel = document.getSelection();
    if (!domSel) return;

    // Each write below fires selectionchange: synchronously in happy-dom, queued in a browser. Read
    // back as a user move, the collapsed range between addRange() and extend() would reset the
    // model, which syncs again, and one Ctrl+A would recurse until the stack runs out.
    this.writingDOMSelection = true;
    try {
      const anchorInfo = this.posToDOM(sel.anchor);
      const headInfo = isCollapsed(sel) ? anchorInfo : this.posToDOM(sel.head);

      if (!anchorInfo || !headInfo) return;

      const range = document.createRange();
      range.setStart(anchorInfo.node, anchorInfo.offset);

      domSel.removeAllRanges();
      if (isCollapsed(sel)) {
        range.collapse(true);
        domSel.addRange(range);
      } else {
        domSel.addRange(range);
        domSel.extend(headInfo.node, headInfo.offset);
      }
    } catch (err) {
      // The editor keeps its own selection: what the DOM shows now is recorded below as ours, so
      // the half-written DOM selection is never read back into the model.
      console.warn('[pdx-rich-text] the DOM selection could not follow the editor selection; '
        + 'the editor keeps its own.', err);
    } finally {
      this.writingDOMSelection = false;
      this.writtenDOMSelection = domSelectionPoints(domSel);
    }
  }

  /** Read DOM selection → model selection */
  private readDOMSelection(): Selection | null {
    const domSel = document.getSelection();
    if (!domSel || domSel.rangeCount === 0) return null;
    if (!this.contentDOM.contains(domSel.anchorNode)) return null;

    const anchor = this.domToPos(domSel.anchorNode!, domSel.anchorOffset);
    const head = domSel.isCollapsed ? anchor : this.domToPos(domSel.focusNode!, domSel.focusOffset);

    if (anchor === null || head === null) return null;
    return createSelection(anchor, head);
  }

  // ── Position Mapping (DOM ↔ Model) ─────────────────────────
  //
  // Content positions in the model:
  //   doc content pos 0 = before first child
  //   For each child: offset in content, then +1 for open tag → content inside child
  //
  // DOM mapping:
  //   contentDOM corresponds to doc node
  //   contentDOM.childNodes[i] corresponds to doc.content[i]

  /** Map model content position → DOM node + offset */
  private posToDOM(pos: Pos): { node: Node; offset: number } | null {
    // Walk model and DOM in parallel
    return this.posToDOMInner(this.contentDOM, this.state.doc.content, pos, 0);
  }

  private posToDOMInner(
    parentDOM: Node, modelChildren: readonly DocNode[], pos: Pos, offset: number,
  ): { node: Node; offset: number } | null {
    const domChildren = Array.from(parentDOM.childNodes);

    for (let i = 0; i < modelChildren.length; i++) {
      const child = modelChildren[i];
      const size = nodeSize(child);

      if (isText(child)) {
        // Text child occupies [offset, offset + text.length)
        if (pos >= offset && pos <= offset + child.text!.length) {
          const textDom = findTextNode(domChildren[i]);
          if (textDom) return { node: textDom, offset: pos - offset };
          // Fallback: position in parent
          return { node: parentDOM, offset: i + (pos > offset ? 1 : 0) };
        }
      } else {
        // Element child occupies [offset, offset + size)
        // offset = the element's open tag position (in parent content)
        // offset + 1 = start of element's content
        // offset + size - 1 = element's close tag
        if (pos === offset) {
          // At the element's open tag → position before this element in parent
          return { node: parentDOM, offset: i };
        }
        if (pos > offset && pos < offset + size) {
          // Inside this element's content
          const contentPos = pos - offset - 1; // content-relative within this child
          const domChild = domChildren[i];
          if (domChild) {
            return this.posToDOMInner(domChild, child.content, contentPos, 0);
          }
        }
      }

      offset += size;
    }

    // Position at end of content
    if (pos >= offset) {
      return { node: parentDOM, offset: parentDOM.childNodes.length };
    }

    return null;
  }

  /** Map DOM node + offset → model content position */
  private domToPos(domNode: Node, domOffset: number): Pos | null {
    return this.domToPosInner(this.contentDOM, this.state.doc.content, domNode, domOffset, 0);
  }

  private domToPosInner(
    parentDOM: Node, modelChildren: readonly DocNode[],
    targetNode: Node, targetOffset: number, baseOffset: number,
  ): Pos | null {
    const domChildren = Array.from(parentDOM.childNodes);

    // Target is the parent itself — map domOffset to model position
    if (targetNode === parentDOM) {
      let offset = baseOffset;
      for (let i = 0; i < targetOffset && i < modelChildren.length; i++) {
        offset += nodeSize(modelChildren[i]);
      }
      return offset;
    }

    // Search children
    let offset = baseOffset;
    for (let i = 0; i < modelChildren.length && i < domChildren.length; i++) {
      const child = modelChildren[i];
      const size = nodeSize(child);
      const domChild = domChildren[i];

      if (isText(child)) {
        const textDom = findTextNode(domChild);
        if (textDom && targetNode === textDom) {
          // Clamp offset to model text length (DOM may have ZWS placeholder)
          const modelLen = child.text!.length;
          return offset + Math.min(targetOffset, modelLen);
        }
        // Check if target is within this DOM child (mark wrappers)
        if (domChild.contains(targetNode)) {
          const textDom2 = findTextNode(domChild);
          if (textDom2 && targetNode === textDom2) {
            const modelLen = child.text!.length;
            return offset + Math.min(targetOffset, modelLen);
          }
          return offset;
        }
      } else {
        if (targetNode === domChild) {
          // At the element boundary
          return offset + (targetOffset === 0 ? 1 : size - 1);
        }
        if (domChild.contains(targetNode)) {
          // Inside this element — recurse
          const contentOffset = offset + 1; // skip open tag
          const result = this.domToPosInner(domChild, child.content, targetNode, targetOffset, contentOffset);
          if (result !== null) return result;
        }
      }

      offset += size;
    }

    return null;
  }

  // ── Input Handling ──────────────────────────────────────────

  private createObserverCallbacks(): DOMObserverCallbacks {
    return {
      onInput: (type, data, targetRange) => this.handleInput(type, data, targetRange),
      onCompositionStart: (data) => this.composition.onCompositionStart(data),
      onCompositionUpdate: (data) => this.composition.onCompositionUpdate(data),
      onCompositionEnd: (data) => this.composition.onCompositionEnd(data),
      onSelectionChange: () => this.handleSelectionChange(),
      onMutation: (mutations) => this.handleMutations(mutations),
      onKeyDown: (e) => this.handleKeyDown(e),
      onCopy: (e) => this.handleCopy(e),
      onCut: (e) => this.handleCut(e),
      onPaste: (e) => this.handlePaste(e),
      onFocus: () => this.handleFocus(),
      onBlur: () => this.handleBlur(),
      onDrop: (e) => this.handleDrop(e),
    };
  }

  private handleInput(type: string, data: string | null, _targetRange: StaticRange | null): void {
    const tr = this.createTransaction();

    switch (type) {
      case 'insertText':
        if (data) {
          if (this.tryInputRules(data)) return;
          tr.insertText(data);
          tr.scrollIntoView();
          this.dispatch(tr);
        }
        break;

      case 'insertParagraph': {
        // Enter key — check if cursor is in an empty paragraph inside a wrapper
        // If so, exit the wrapper instead of splitting
        if (this.tryExitWrapper()) return;
        tr.split();
        tr.scrollIntoView();
        this.dispatch(tr);
        break;
      }

      case 'insertLineBreak':
        // Shift+Enter — insert hard break
        tr.insert(selFrom(this.state.selection), createNode('hardBreak'));
        tr.scrollIntoView();
        this.dispatch(tr);
        break;

      case 'deleteContentBackward':
        this.handleBackspace(tr);
        break;

      case 'deleteContentForward':
        this.handleDelete(tr);
        break;

      case 'deleteWordBackward':
        this.handleWordDelete(tr, -1);
        break;

      case 'deleteWordForward':
        this.handleWordDelete(tr, 1);
        break;

      case 'formatBold':
        this.execCommand('toggleBold');
        break;

      case 'formatItalic':
        this.execCommand('toggleItalic');
        break;

      case 'formatUnderline':
        this.execCommand('toggleUnderline');
        break;

      case 'historyUndo':
        this.execCommand('undo');
        break;

      case 'historyRedo':
        this.execCommand('redo');
        break;

      default:
        // Unhandled input type — log for debugging
        break;
    }
  }

  private handleBackspace(tr: EditorTransaction): void {
    const sel = this.state.selection;
    const from = selFrom(sel);
    const to = selTo(sel);

    if (from !== to) {
      tr.delete(from, to);
      tr.scrollIntoView();
      this.dispatch(tr);
      return;
    }

    if (from <= 0) return;

    // Backspace at the start of a list item → outdent THAT item to a paragraph
    // (Word/Docs classic), instead of merging it into the previous block.
    const outdent = outdentListItemAt(this.state.doc, from);
    if (outdent) {
      const tr2 = this.createTransaction();
      tr2.setMeta('replaceDoc', outdent.doc);
      tr2.setMeta('historySel', { anchor: outdent.selPos, head: outdent.selPos, type: 'text' as const });
      this.dispatch(tr2);
      return;
    }

    // Backspace at the start of a paragraph that follows a list/blockquote →
    // merge it into the container's last textblock, landing the cursor INSIDE
    // (so a following Enter splits the last item, not a no-op at the doc end).
    const joinAfter = joinBlockAfterContainer(this.state.doc, from);
    if (joinAfter) {
      const tr2 = this.createTransaction();
      tr2.setMeta('replaceDoc', joinAfter.doc);
      tr2.setMeta('historySel', { anchor: joinAfter.selPos, head: joinAfter.selPos, type: 'text' as const });
      this.dispatch(tr2);
      return;
    }

    // Check if cursor is at the start of a block — join with previous block
    const doc = this.state.doc;
    let offset = 0;
    for (let i = 0; i < doc.content.length; i++) {
      const child = doc.content[i];
      const size = nodeSize(child);

      // Cursor is at offset + 1 = start of this block's content
      if (from === offset + 1 && i > 0 && !isText(child)) {
        // Join this block with the previous one
        const prev = doc.content[i - 1];
        if (!isText(prev) && (prev.type === 'paragraph' || prev.type === 'heading') &&
            (child.type === 'paragraph' || child.type === 'heading')) {
          const merged = createNode(prev.type, prev.attrs,
            [...prev.content, ...child.content].filter(c => !isText(c) || c.text !== ''),
          );
          const newChildren = [...doc.content];
          newChildren.splice(i - 1, 2, merged);
          const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
          // Cursor at the join point (end of prev content)
          const prevContentLen = prev.content.reduce((s, c) => s + (isText(c) ? c.text!.length : nodeSize(c)), 0);
          const cursorPos = offset - 1 + prevContentLen; // inside prev, at end of its text
          const tr2 = this.createTransaction();
          tr2.setMeta('replaceDoc', newDoc);
          tr2.setMeta('historySel', { anchor: cursorPos, head: cursorPos, type: 'text' as const });
          this.dispatch(tr2);
          return;
        }
      }

      offset += size;
    }

    // Normal backspace: delete one character
    tr.delete(from - 1, from);
    tr.scrollIntoView();
    this.dispatch(tr);
  }

  private handleDelete(tr: EditorTransaction): void {
    const sel = this.state.selection;
    const from = selFrom(sel);
    const to = selTo(sel);
    const docEnd = contentSize(this.state.doc);

    if (from !== to) {
      tr.delete(from, to);
    } else if (to < docEnd) {
      tr.delete(to, to + 1);
    }
    tr.scrollIntoView();
    this.dispatch(tr);
  }

  private handleWordDelete(tr: EditorTransaction, direction: -1 | 1): void {
    const sel = this.state.selection;
    const pos = direction === -1 ? selFrom(sel) : selTo(sel);

    // Find word boundary
    const text = textContent(this.state.doc);
    let boundary = pos;

    if (direction === -1) {
      // Scan backwards past whitespace, then past word chars
      while (boundary > 0 && /\s/.test(text[boundary - 1] ?? '')) boundary--;
      while (boundary > 0 && /\S/.test(text[boundary - 1] ?? '')) boundary--;
      tr.delete(boundary, pos);
    } else {
      while (boundary < text.length && /\s/.test(text[boundary] ?? '')) boundary++;
      while (boundary < text.length && /\S/.test(text[boundary] ?? '')) boundary++;
      tr.delete(pos, boundary);
    }

    tr.scrollIntoView();
    this.dispatch(tr);
  }

  private handleSelectionChange(): void {
    // Our own write, or its echo: the DOM shows what syncDOMSelection left, not a user move.
    if (this.writingDOMSelection) return;
    const domSel = document.getSelection();
    if (domSel && sameDOMSelection(domSelectionPoints(domSel), this.writtenDOMSelection)) return;

    const sel = this.readDOMSelection();
    if (!sel) return;

    const current = this.state.selection;
    if (sel.anchor === current.anchor && sel.head === current.head) return;

    const tr = this.createTransaction();
    tr.setSelection(sel);
    this.dispatch(tr);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Selection first. The model catches up with the DOM selection on selectionchange, which is
    // queued as a task: Shift+Ctrl+Left then Ctrl+B at automation speed — a macro, a fast typist —
    // would run the shortcut on the previous caret. Not while composing: the IME owns it.
    if (!e.isComposing && !this.composition.isComposing) this.handleSelectionChange();

    // Try keymap bindings
    const key = buildKeyString(e);
    const binding = this.state.keymap[key];
    if (binding) {
      const handled = binding(this.state, (tr) => this.dispatch(tr as EditorTransaction));
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    // Tab in lists — and only where the list command applies. Everywhere else Tab and Shift+Tab keep
    // their default and move focus: preventing it always would make the text a keyboard trap, which
    // no Tab or Shift+Tab could leave (WCAG 2.1.2).
    if (e.key === 'Tab') {
      const applied = this.execCommand(e.shiftKey ? 'liftListItem' : 'sinkListItem');
      if (applied) e.preventDefault();
    }
  }

  private handleFocus(): void {
    this.focused = true;
    this.dom.classList.add('pdx-rt-focused');
    this.config.onFocus?.();
  }

  private handleBlur(): void {
    this.focused = false;
    this.dom.classList.remove('pdx-rt-focused');
    this.composition.forceEnd();
    this.config.onBlur?.();
  }

  private handleMutations(_mutations: MutationRecord[]): void {
    // External DOM mutations (spellcheck, browser extensions, etc.)
    // Ignore them — model is source of truth.
    // Only re-render if the DOM structure is badly broken.
    // For most cases, the model + updateDOM handles it correctly.
  }

  // ── Clipboard ────────────────────────────────────────────────

  private handleCopy(e: ClipboardEvent): void {
    const sel = this.state.selection;
    const from = selFrom(sel);
    const to = selTo(sel);
    if (from === to) return; // nothing selected

    // Serialize selected content to HTML and plain text
    const slice = sliceBetween(this.state.doc, from, to);
    const html = serializeToClipboardHTML(slice.content);
    const text = slice.content.map(n => textContent(n)).join('\n');

    e.clipboardData?.setData('text/html', html);
    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
  }

  private handleCut(e: ClipboardEvent): void {
    this.handleCopy(e);
    // Delete selected content
    const sel = this.state.selection;
    const from = selFrom(sel);
    const to = selTo(sel);
    if (from !== to) {
      const tr = this.createTransaction();
      tr.delete(from, to);
      this.dispatch(tr);
    }
  }

  private handlePaste(e: ClipboardEvent): void {
    // Check for pasted image files first
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result as string;
            const doc = this.state.doc;
            const from = selFrom(this.state.selection);
            let offset = 0;
            const newChildren: DocNode[] = [];
            let inserted = false;
            for (const child of doc.content) {
              const size = nodeSize(child);
              newChildren.push(child);
              if (!inserted && offset + size > from) {
                newChildren.push(createNode('image', { src, alt: file.name, align: 'center' }));
                inserted = true;
              }
              offset += size;
            }
            if (!inserted) newChildren.push(createNode('image', { src, alt: file.name, align: 'center' }));
            const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
            const tr = this.createTransaction();
            tr.setMeta('replaceDoc', newDoc);
            this.dispatch(tr);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }

    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain');

    const tr = this.createTransaction();
    const from = selFrom(this.state.selection);
    const to = selTo(this.state.selection);

    // Delete selection first
    if (from !== to) {
      tr.delete(from, to);
    }

    if (html && html.trim()) {
      const nodes = parseClipboardHTML(html, this.state.schema);
      if (nodes.length > 0) {
        if (nodes.length === 1 && nodes[0].type === 'paragraph') {
          // Inline paste: extract plain text and insert at cursor
          const pasteText = nodes[0].content
            .map(c => c.text ?? '')
            .join('');
          if (pasteText) {
            tr.insertText(pasteText, from);
            tr.scrollIntoView();
            this.dispatch(tr);
            return;
          }
        } else {
          // Block paste: replace doc with merged content
          const doc = this.state.doc;
          // Find current block and insert after it
          let offset = 0;
          const newChildren: DocNode[] = [];
          let inserted = false;
          for (const child of doc.content) {
            const size = nodeSize(child);
            const childEnd = offset + size;
            newChildren.push(child);
            if (!inserted && childEnd > from) {
              // Insert pasted blocks after this block
              for (const pNode of nodes) {
                newChildren.push(pNode);
              }
              inserted = true;
            }
            offset = childEnd;
          }
          if (!inserted) {
            for (const pNode of nodes) newChildren.push(pNode);
          }
          const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
          tr.setMeta('replaceDoc', newDoc);
          this.dispatch(tr);
          return;
        }
      }
    }

    // Fallback: plain text
    if (text) {
      tr.insertText(text, from);
      tr.scrollIntoView();
      this.dispatch(tr);
    }
  }

  /** When pressing Enter on an empty line inside a wrapper (blockquote, list),
   *  exit the wrapper by removing the empty entry and creating a paragraph after. */
  private tryExitWrapper(): boolean {
    const pos = selFrom(this.state.selection);
    if (selFrom(this.state.selection) !== selTo(this.state.selection)) return false;

    const doc = this.state.doc;
    const wrapperTypes = new Set(['blockquote', 'bulletList', 'orderedList', 'taskList']);

    // Walk doc.content to find the wrapper containing the cursor
    let offset = 0;
    for (let i = 0; i < doc.content.length; i++) {
      const child = doc.content[i];
      const size = nodeSize(child);
      const childEnd = offset + size;

      if (pos > offset && pos < childEnd && wrapperTypes.has(child.type)) {
        // Check if cursor is in an empty last entry of this wrapper
        const result = this.removeEmptyTail(child, pos - offset - 1);
        if (result) {
          const newChildren = [...doc.content];
          const emptyP = createNode('paragraph', {}, [createText('')]);

          if (result.remaining) {
            newChildren.splice(i, 1, result.remaining, emptyP);
          } else {
            newChildren.splice(i, 1, emptyP); // wrapper was fully emptied
          }

          const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
          // Cursor position: inside the new empty paragraph after the wrapper
          let cursorPos = 0;
          for (let j = 0; j <= i + (result.remaining ? 1 : 0); j++) {
            cursorPos += nodeSize(newChildren[j]);
          }
          cursorPos -= 1; // inside the empty paragraph

          const tr = this.createTransaction();
          tr.setMeta('replaceDoc', newDoc);
          tr.setMeta('historySel', { anchor: cursorPos, head: cursorPos, type: 'text' as const });
          this.dispatch(tr);
          return true;
        }
      }
      offset = childEnd;
    }
    return false;
  }

  /** Check if a wrapper block has an empty paragraph at the cursor position.
   *  Handles nested structures: bulletList > listItem > paragraph.
   *  Returns the wrapper with the empty paragraph removed, or null. */
  private removeEmptyTail(
    wrapper: DocNode, contentPos: number,
  ): { remaining: DocNode | null } | null {
    const isEmptyParagraph = (node: DocNode): boolean =>
      node.type === 'paragraph' &&
      (node.content.length === 0 ||
       (node.content.length === 1 && isText(node.content[0]) && node.content[0].text === ''));

    // For blockquote: children are paragraphs directly
    if (wrapper.type === 'blockquote') {
      const last = wrapper.content[wrapper.content.length - 1];
      if (!last || !isEmptyParagraph(last)) return null;
      // Check cursor is in the last paragraph
      let offset = 0;
      for (let i = 0; i < wrapper.content.length - 1; i++) offset += nodeSize(wrapper.content[i]);
      if (contentPos < offset) return null;

      const remaining = wrapper.content.length > 1
        ? createNode(wrapper.type, wrapper.attrs, wrapper.content.slice(0, -1), wrapper.marks)
        : null;
      return { remaining };
    }

    // For lists: children are listItems, each containing paragraphs
    if (wrapper.type === 'bulletList' || wrapper.type === 'orderedList' || wrapper.type === 'taskList') {
      const lastItem = wrapper.content[wrapper.content.length - 1];
      if (!lastItem) return null;

      // Check cursor is in the last list item
      let itemOffset = 0;
      for (let i = 0; i < wrapper.content.length - 1; i++) itemOffset += nodeSize(wrapper.content[i]);
      if (contentPos < itemOffset) return null;

      // Check if last paragraph in the last list item is empty
      const lastP = lastItem.content[lastItem.content.length - 1];
      if (!lastP || !isEmptyParagraph(lastP)) return null;

      // Check cursor is in that last paragraph
      let pOffset = itemOffset + 1; // +1 for listItem open tag
      for (let i = 0; i < lastItem.content.length - 1; i++) pOffset += nodeSize(lastItem.content[i]);
      if (contentPos < pOffset) return null;

      // Remove the empty paragraph from the list item
      if (lastItem.content.length > 1) {
        // Keep the listItem with remaining paragraphs
        const trimmedItem = createNode(lastItem.type, lastItem.attrs, lastItem.content.slice(0, -1), lastItem.marks);
        const newItems = [...wrapper.content.slice(0, -1), trimmedItem];
        return { remaining: createNode(wrapper.type, wrapper.attrs, newItems, wrapper.marks) };
      } else {
        // ListItem had only the empty paragraph — remove entire item
        if (wrapper.content.length > 1) {
          return { remaining: createNode(wrapper.type, wrapper.attrs, wrapper.content.slice(0, -1), wrapper.marks) };
        }
        return { remaining: null }; // entire list is now empty
      }
    }

    return null;
  }

  /** Update an image node's attributes */
  private updateImageAttr(imageNode: DocNode, attrs: Record<string, unknown>): void {
    const doc = this.state.doc;
    const replace = (node: DocNode): DocNode => {
      if (node === imageNode) {
        return createNode(node.type, { ...node.attrs, ...attrs }, node.content, node.marks);
      }
      if (node.content.length === 0) return node;
      let changed = false;
      const nc = node.content.map(c => { const r = replace(c); if (r !== c) changed = true; return r; });
      return changed ? createNode(node.type, node.attrs, nc, node.marks) : node;
    };
    const newDoc = replace(doc);
    if (newDoc !== doc) {
      const tr = this.createTransaction();
      tr.setMeta('replaceDoc', newDoc);
      this.dispatch(tr);
    }
  }

  /** Remove an image node from the doc */
  private removeImageNode(imageNode: DocNode): void {
    const doc = this.state.doc;
    const remove = (node: DocNode): DocNode => {
      const filtered = node.content.filter(c => c !== imageNode);
      if (filtered.length === node.content.length) {
        // Not found at this level — recurse
        let changed = false;
        const nc = node.content.map(c => { const r = remove(c); if (r !== c) changed = true; return r; });
        return changed ? createNode(node.type, node.attrs, nc, node.marks) : node;
      }
      return createNode(node.type, node.attrs, filtered.length > 0 ? filtered : [createNode('paragraph', {}, [createText('')])], node.marks);
    };
    const newDoc = remove(doc);
    if (newDoc !== doc) {
      const tr = this.createTransaction();
      tr.setMeta('replaceDoc', newDoc);
      this.dispatch(tr);
    }
  }

  /** Toggle a task item's checked state */
  private toggleTaskItem(taskNode: DocNode): void {
    const doc = this.state.doc;
    const newChecked = !(taskNode.attrs.checked as boolean);

    // Walk doc and find/replace the task item
    const replaceTask = (node: DocNode): DocNode => {
      if (node === taskNode) {
        return createNode(node.type, { ...node.attrs, checked: newChecked }, node.content, node.marks);
      }
      if (node.content.length === 0) return node;
      let changed = false;
      const newContent = node.content.map(c => {
        const nc = replaceTask(c);
        if (nc !== c) changed = true;
        return nc;
      });
      return changed ? createNode(node.type, node.attrs, newContent, node.marks) : node;
    };

    const newDoc = replaceTask(doc);
    if (newDoc !== doc) {
      const tr = this.createTransaction();
      tr.setMeta('replaceDoc', newDoc);
      this.dispatch(tr);
    }
  }

  private handleDrop(e: DragEvent): void {
    const draggedNode = (this as any)._draggedImageNode as DocNode | null;
    if (!draggedNode || e.dataTransfer?.getData('text/plain') !== '__pdx-image-drag__') return;

    e.preventDefault();

    // Find drop target position from mouse coordinates
    const dropPos = this.domToPos(
      document.caretRangeFromPoint?.(e.clientX, e.clientY)?.startContainer ?? this.contentDOM,
      document.caretRangeFromPoint?.(e.clientX, e.clientY)?.startOffset ?? 0,
    );

    if (dropPos === null) return;

    // Remove image from old position, insert at new position
    const doc = this.state.doc;
    const withoutImage = doc.content.filter(c => c !== draggedNode);

    // Find insert index based on drop position
    let offset = 0;
    let insertIdx = withoutImage.length;
    for (let i = 0; i < withoutImage.length; i++) {
      const size = nodeSize(withoutImage[i]);
      if (offset + size > dropPos) {
        insertIdx = i + 1; // insert after this block
        break;
      }
      offset += size;
    }

    const newChildren = [
      ...withoutImage.slice(0, insertIdx),
      draggedNode,
      ...withoutImage.slice(insertIdx),
    ];

    const newDoc = createNode(doc.type, doc.attrs, newChildren, doc.marks);
    const tr = this.createTransaction();
    tr.setMeta('replaceDoc', newDoc);
    this.dispatch(tr);
    (this as any)._draggedImageNode = null;
  }

  // ── Input Rules ─────────────────────────────────────────────

  private tryInputRules(text: string): boolean {
    if (text.length !== 1) return false;

    const sel = this.state.selection;
    if (!isCollapsed(sel)) return false;

    const pos = sel.head;

    // Find text content before cursor in current block
    // Resolve pos to find the parent block and text offset
    try {
      const resolved = resolvePos(this.state.doc, pos);
      const parent = resolved.parent;
      // Collect text before cursor from the parent's content
      let textBefore = '';
      let offset = 0;
      for (const child of parent.content) {
        if (isText(child)) {
          const childEnd = offset + child.text!.length;
          if (childEnd <= resolved.parentOffset) {
            textBefore += child.text!;
          } else if (offset < resolved.parentOffset) {
            textBefore += child.text!.slice(0, resolved.parentOffset - offset);
          }
          offset = childEnd;
        } else {
          offset += nodeSize(child);
        }
      }

      const lineText = textBefore + text;

      for (const rule of this.state.inputRules) {
        const match = rule.pattern.exec(lineText);
        if (!match) continue;

        // Calculate positions: from/to in doc content space.
        // A RECURSIVE search for the parent's absolute position: a single-level
        // search gets the blockStart wrong for deep nesting (list > listItem >
        // paragraph), and the input rule would apply at the wrong position.
        const findBlockStart = (container: DocNode, target: DocNode, base: number): number => {
          let off = base;
          for (const child of container.content ?? []) {
            if (child === target) return off + 1; // inside the target's open tag
            if (child.content && child.content.length > 0) {
              const inner = findBlockStart(child, target, off + 1);
              if (inner >= 0) return inner;
            }
            off += nodeSize(child);
          }
          return -1;
        };
        let blockStart = findBlockStart(this.state.doc, parent, 0);
        const found = blockStart >= 0;
        if (!found) blockStart = 0;

        const matchFrom = blockStart + match.index;
        const matchTo = pos;

        const handler = rule.handler(this.state, match, matchFrom, matchTo + 1);
        if (handler) {
          const tr = this.createTransaction();
          handler(tr);
          tr.scrollIntoView();
          this.dispatch(tr);
          return true;
        }
      }
    } catch {
      // resolvePos failed — skip input rules
    }

    return false;
  }

  private scrollCursorIntoView(): void {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.height === 0) return;

    // Scroll the cursor into the visible area
    const editorRect = this.dom.getBoundingClientRect();
    if (rect.bottom > editorRect.bottom) {
      this.dom.scrollTop += rect.bottom - editorRect.bottom + 20;
    } else if (rect.top < editorRect.top) {
      this.dom.scrollTop -= editorRect.top - rect.top + 20;
    }
  }
}

// ── DOM Utilities ─────────────────────────────────────────────────

/** Find the first text node in a DOM subtree */
function findTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (const child of node.childNodes) {
    const found = findTextNode(child);
    if (found) return found;
  }
  return null;
}

/** Build a key string from a keyboard event (e.g. 'Mod-b', 'Shift-Enter') */
function buildKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  let key = e.key;
  if (key.length === 1) key = key.toLowerCase();
  if (key === ' ') key = 'Space';

  // Don't add modifier keys as the key itself
  if (!['Control', 'Meta', 'Shift', 'Alt'].includes(key)) {
    parts.push(key);
  }

  return parts.join('-');
}
