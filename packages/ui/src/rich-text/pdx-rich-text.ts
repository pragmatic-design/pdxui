// ── pdx-rich-text Web Component ───────────────────────────────────
// Zero-dependency rich text editor. Design-token native.
//
// The value contract is the one every input in the library keeps: the content goes in
// through `value`, parsed per `output` (HTML for `output="html"`, JSON otherwise); it comes out
// through `value` after every change, equal to the `pdx-change` detail; and a later `value` from
// outside replaces the document without rebuilding the editor. The imperative API is attached at
// setup — before `pdx-ready` and before anything can call it — so it shadows the platform's own
// Element.prototype.setHTML from the start; calls made before the editor exists are queued.

import { component, html, untracked, DEV, isDataSource } from '@pdxui/core';
import type { DataSource } from '@pdxui/core';
import { findRecord } from '../shared/find-record';
import { EditorView, type EditorViewConfig } from './view/view.js';
import { StarterKit, MinimalKit, DocumentKit } from './extensions/starter-kit.js';
import { parseToolbarConfig, renderToolbar, updateToolbarState } from './toolbar/toolbar.js';
import { BubbleToolbar } from './toolbar/bubble.js';
import { toJSON, fromJSON, type JSONNode } from './format/json.js';
import { serializeToClipboardHTML, parseClipboardHTML } from './view/clipboard.js';
import type { Extension } from './state/plugin.js';
import type { DocNode } from './model/types.js';
import { textContent, textLength, createNode, createText } from './model/node.js';
import { uiString, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/rich-text';

/**
 * A rich text editor with no dependencies, with Markdown shortcuts, syntax highlighting and tables.
 */
component('pdx-rich-text', {
  props: {
    value: { type: Object, default: null },
    output: { type: String, default: 'json' },
    extensions: { type: Array, default: null },
    preset: { type: String, default: 'starter' },
    toolbar: { type: String, default: 'standard' },
    toolbarMode: { type: String, default: 'top' },
    placeholder: { type: String, default: '' },
    readonly: { type: Boolean, default: false },
    autofocus: { type: Boolean, default: false },
    height: { type: String, default: 'auto' },
    minHeight: { type: String, default: '120px' },
    maxHeight: { type: String, default: 'none' },
    /**
     * A DataSource whose record `record-id` names: the editor edits that record's `field`, follows
     * it when the source changes it, and writes each edit back through the source.
     * With all three given, the record is the document and `value` only reflects it.
     */
    source: { type: Object, default: null },
    /** The field of the `source` record that holds the document. */
    field: { type: String, default: '' },
    /** The id of the `source` record to edit, as pdx-form's `record-id`: `"1"` finds `{ id: 1 }`. */
    recordId: { type: String, default: '' },
    /** Accessible name of the editing area. Empty → the `rich-text.label` component string. */
    label: { type: String, default: '' },
  },

  setup(ctx: any) {
    let editorView: EditorView | null = null;
    let toolbarEl: HTMLElement | null = null;
    let wrapperEl: HTMLElement | null = null;
    let bubbleToolbar: BubbleToolbar | null = null;
    const el = ctx.el as HTMLElement & { value: unknown };

    // The last value THIS component wrote to `value`. An inbound value equal to it is our own
    // reflection coming back, not a new document — skipping it is what keeps the round trip from
    // looping (write value → value track → replaceDoc → onUpdate → write value …).
    let reflected: unknown = undefined;
    // API calls made before the editor exists (setup runs before the rAF that builds it).
    const pending: Array<(view: EditorView) => void> = [];
    const whenBuilt = (fn: (view: EditorView) => void) => { if (editorView) fn(editorView); else pending.push(fn); };

    function getExtensions(): Extension[] {
      const exts = ctx.extensions?.();
      // Default prop is [] (empty array, truthy) — must check length
      if (exts && Array.isArray(exts) && exts.length > 0) return exts;
      switch (ctx.preset?.() || 'starter') {
        case 'minimal': return [MinimalKit];
        case 'document': return [DocumentKit];
        default: return [StarterKit];
      }
    }

    const emptyDoc = () => createNode('doc', {}, [createNode('paragraph', {}, [createText('')])]);

    function htmlToDoc(markup: string, view: EditorView): DocNode {
      const nodes = parseClipboardHTML(String(markup ?? ''), view.state.schema);
      return createNode('doc', {}, nodes.length ? nodes : [createNode('paragraph', {}, [createText('')])]);
    }

    let warnedUnparseable = false;
    /** A value as a document, per `output`: HTML for `html`, JSON (string or object) otherwise.
     *  HTML needs the view's schema: without a view it returns undefined. */
    function valueToDoc(value: unknown, output: string, view?: EditorView): DocNode | undefined {
      if (value === null || value === undefined || value === '') return undefined;
      if (typeof value === 'string') {
        if (output === 'html') return view ? htmlToDoc(value, view) : undefined;
        try { return fromJSON(JSON.parse(value) as JSONNode); } catch (err) {
          if (DEV && !warnedUnparseable) {
            warnedUnparseable = true;
            console.warn(`[pdx-rich-text] value is not a JSON document (output="${output}"): "${value.slice(0, 80)}". `
              + 'For HTML, set output="html". The editor starts empty.', err);
          }
          return undefined;
        }
      }
      if (typeof value === 'object' && (value as { type?: unknown }).type) return fromJSON(value as JSONNode);
      return undefined;
    }

    type Row = Record<string, unknown>;
    /** The record the editor is bound to — `source`, `field` and `record-id` all given — or null. */
    function binding(): { source: DataSource<Row>; field: string; record: Row | undefined } | null {
      const source = ctx.source?.();
      const field = (ctx.field?.() as string) ?? '';
      const id = String(ctx.recordId?.() ?? '');
      if (!isDataSource<Row>(source) || !field || !id) return null;
      return { source, field, record: findRecord(source, id) };
    }

    const replaceDoc = (view: EditorView, d: DocNode) => {
      const tr = view.createTransaction();
      tr.setMeta('replaceDoc', d);
      view.dispatch(tr);
    };

    // ── Imperative API, attached now: before pdx-ready, before the editor exists ──
    ctx.expose({
      get editor() { return editorView; },
      /** The document as JSON, or null while the editor is still being built. */
      getJSON: () => editorView ? toJSON(editorView.state.doc) : null,
      /** The document as HTML — what a copy to the clipboard carries — or '' before the editor is built. */
      getHTML: () => editorView ? serializeToClipboardHTML(editorView.state.doc.content) : '',
      /** The document as plain text, or '' before the editor is built. */
      getText: () => editorView ? textContent(editorView.state.doc) : '',
      /** How many words the document holds; 0 before the editor is built. */
      getWordCount: () => editorView ? countWords(editorView.state.doc) : 0,
      get isEmpty() { return editorView ? textLength(editorView.state.doc) === 0 : true; },
      /** Run one editor command by name, the same ones the toolbar runs. Does nothing before the editor is built. */
      execCommand: (name: string) => editorView?.execCommand(name),
      focus: () => editorView?.focus(),
      blur: () => editorView?.blur(),
      /** Replace the document with this JSON, waiting for the editor when it is not built yet. */
      setJSON: (json: unknown) => whenBuilt(view => {
        const d = valueToDoc(json, 'json', view);
        if (d) replaceDoc(view, d);
      }),
      /** Replace the document with this HTML, waiting for the editor when it is not built yet. */
      setHTML: (markup: string) => whenBuilt(view => replaceDoc(view, htmlToDoc(markup, view))),
      clear: () => whenBuilt(view => replaceDoc(view, emptyDoc())),
    });

    // ── Build: the editor and its DOM, rebuilt when a configuration prop changes ──
    ctx.track(() => {
      // Read the configuration props to subscribe. `value` is NOT read here: it has its own track
      // below, so a new value replaces the document instead of rebuilding the editor.
      const toolbarCfg = ctx.toolbar?.() ?? 'standard';
      const toolbarModeCfg = ctx.toolbarMode?.() ?? 'top';
      const placeholderCfg = ctx.placeholder?.() ?? '';
      const readonlyCfg = ctx.readonly?.() ?? false;
      const heightCfg = ctx.height?.() ?? 'auto';
      const minHeightCfg = ctx.minHeight?.() ?? '120px';
      const maxHeightCfg = ctx.maxHeight?.() ?? 'none';
      const outputCfg = ctx.output?.() ?? 'json';
      const autofocusCfg = ctx.autofocus?.() ?? false;
      const labelCfg = (ctx.label?.() as string) ?? '';

      let cancelled = false;
      requestAnimationFrame(() => {
        if (cancelled || editorView) return;

        el.classList.add('pdx-rich-text');

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.classList.add('pdx-rt-wrapper');
        if (heightCfg !== 'auto') wrapper.style.height = heightCfg;
        if (minHeightCfg) wrapper.style.minHeight = minHeightCfg;
        if (maxHeightCfg !== 'none') {
          wrapper.style.maxHeight = maxHeightCfg;
          wrapper.style.overflowY = 'auto';
        }
        wrapperEl = wrapper;

        // Top toolbar
        if (toolbarModeCfg === 'top' && toolbarCfg !== 'false' && toolbarCfg !== false) {
          toolbarEl = document.createElement('div');
          el.appendChild(toolbarEl);
        }

        el.appendChild(wrapper);

        // The initial value: JSON is handed to the view as its doc, as before; HTML needs the view's
        // schema, so it is applied right after the view exists, before anything observes it.
        // Bound to a record, the record's field is the document; otherwise `value` is.
        const initialValue = untracked(() => {
          const b = binding();
          return b ? b.record?.[b.field] : ctx.value?.();
        });
        const initialIsHtml = typeof initialValue === 'string' && outputCfg === 'html';
        let building = true;

        const config: EditorViewConfig = {
          element: wrapper,
          doc: initialIsHtml ? undefined : valueToDoc(initialValue, outputCfg),
          extensions: getExtensions(),
          onUpdate: (state) => {
            if (toolbarEl) updateToolbarState(toolbarEl, state);
            if (bubbleToolbar) bubbleToolbar.update(state);

            const empty = textLength(state.doc) === 0;
            wrapper.classList.toggle('pdx-rt-empty', empty);

            // Loading the initial value is not a change the user made: no event, no reflection.
            if (building) return;

            const detail: Record<string, unknown> = {};
            if (outputCfg === 'json' || outputCfg === 'all') detail.doc = toJSON(state.doc);
            if (outputCfg === 'html' || outputCfg === 'all') detail.html = serializeToClipboardHTML(state.doc.content);
            if (outputCfg === 'text') detail.text = textContent(state.doc);
            detail.wordCount = countWords(state.doc);

            // Reflect first, so a pdx-change listener that reads el.value sees the new content.
            const out = outputCfg === 'html' ? detail.html : outputCfg === 'text' ? detail.text : detail.doc;
            reflected = out;
            el.value = out;

            // Bound: the edit goes back into the record, through the source, as an unsaved change.
            const b = untracked(binding);
            if (b?.record) b.source.update({ ...b.record, [b.field]: out });

            el.dispatchEvent(new CustomEvent('pdx-change', { detail, bubbles: true }));
          },
          onFocus: () => el.dispatchEvent(new CustomEvent('pdx-focus', { bubbles: true })),
          onBlur: () => el.dispatchEvent(new CustomEvent('pdx-blur', { bubbles: true })),
        };

        const view = new EditorView(config);
        editorView = view;

        if (initialIsHtml) replaceDoc(view, htmlToDoc(initialValue as string, view));
        reflected = initialValue;
        building = false;

        // The accessible name of the editable area (role=textbox): the placeholder does not count as a label
        // for axe (aria-input-field-name / WCAG 4.1.2). Order: label, placeholder, registered string.
        const _content = el.querySelector('.pdx-rt-content');
        if (_content) uiAttr(_content, 'aria-label', () => labelCfg || placeholderCfg || uiString('rich-text', 'label'));

        // Render toolbar
        if (toolbarEl) {
          const groups = parseToolbarConfig(toolbarCfg);
          renderToolbar(groups, view, toolbarEl);
        }

        // Bubble toolbar
        if (toolbarModeCfg === 'bubble') {
          bubbleToolbar = new BubbleToolbar(view, wrapper);
        }

        // Placeholder
        if (placeholderCfg) {
          wrapper.dataset.placeholder = placeholderCfg;
          wrapper.classList.toggle('pdx-rt-empty', textLength(view.state.doc) === 0);
        }

        // Readonly
        if (readonlyCfg) {
          view.contentDOM.removeAttribute('contenteditable');
          view.contentDOM.classList.add('pdx-rt-readonly');
        }

        // Autofocus
        if (autofocusCfg && !readonlyCfg) {
          requestAnimationFrame(() => editorView?.focus());
        }

        // Calls made before the editor existed, in order.
        for (const fn of pending.splice(0)) fn(view);

        // Ready: the API has been there since setup, and the editor exists now.
        el.dispatchEvent(new CustomEvent('pdx-ready', { detail: { editor: view }, bubbles: true }));
      });

      // Cleanup: a configuration change (or a disconnect) tears the editor AND its DOM down —
      // leaving the old wrapper and toolbar in place would stack a second editor on every rebuild.
      return () => {
        cancelled = true;
        bubbleToolbar?.destroy();
        bubbleToolbar = null;
        editorView?.destroy();
        editorView = null;
        toolbarEl?.remove();
        toolbarEl = null;
        wrapperEl?.remove();
        wrapperEl = null;
      };
    });

    // ── Value in: a `value` set from outside replaces the document, without a rebuild ──
    // Bound to a record, the record is the value: a reload or another writer's change replaces the
    // document. `data()` is read to subscribe — the lookup itself does not.
    ctx.track(() => {
      const b = binding();
      if (b) b.source.data();
      const value = b ? b.record?.[b.field] : ctx.value?.();
      const outputCfg = untracked(() => ctx.output?.() ?? 'json');
      if (Object.is(value, reflected)) return; // our own reflection, or the value the editor was built from
      whenBuilt(view => {
        if (Object.is(value, reflected)) return;
        const d = valueToDoc(value, outputCfg, view) ?? emptyDoc();
        reflected = value;
        replaceDoc(view, d);
      });
    });
  },

  render: () => html`<slot></slot>`,
});

function countWords(doc: DocNode): number {
  const text = textContent(doc);
  return text.split(/\s+/).filter(w => w.length > 0).length;
}
