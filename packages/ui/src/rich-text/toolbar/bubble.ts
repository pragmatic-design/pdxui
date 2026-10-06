// ── Bubble Toolbar ────────────────────────────────────────────────
// Floating toolbar that appears on text selection.
// Uses fixed positioning for reliable placement regardless of container.

import type { EditorView } from '../view/view.js';
import { isCollapsed } from '../model/selection.js';
import { parseToolbarConfig, renderToolbar, updateToolbarState } from './toolbar.js';

const BUBBLE_CONFIG = 'bold italic underline strike | link highlight code';

export class BubbleToolbar {
  private container: HTMLElement;
  private visible = false;
  private view: EditorView;

  constructor(view: EditorView, _parent: HTMLElement) {
    this.view = view;
    this.container = document.createElement('div');
    this.container.classList.add('pdx-rt-bubble');
    this.container.style.display = 'none';
    // Use fixed positioning for reliable placement
    this.container.style.position = 'fixed';
    this.container.style.zIndex = '9999';
    document.body.appendChild(this.container);

    const groups = parseToolbarConfig(BUBBLE_CONFIG);
    renderToolbar(groups, view, this.container);
  }

  update(state: any): void {
    const sel = state.selection;

    if (isCollapsed(sel) || this.view.isComposing) {
      this.hide();
      return;
    }

    this.show();
    updateToolbarState(this.container, state);
    this.position();
  }

  private show(): void {
    if (this.visible) return;
    this.visible = true;
    this.container.style.display = '';
    // Delay adding visible class for animation
    requestAnimationFrame(() => {
      this.container.classList.add('pdx-rt-bubble-visible');
    });
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.classList.remove('pdx-rt-bubble-visible');
    setTimeout(() => {
      if (!this.visible) this.container.style.display = 'none';
    }, 150);
  }

  private position(): void {
    const domSel = document.getSelection();
    if (!domSel || domSel.rangeCount === 0) return;

    const range = domSel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const bubbleRect = this.container.getBoundingClientRect();
    const gap = 6;

    // Position above selection, centered horizontally
    let top = rect.top - bubbleRect.height - gap;
    let left = rect.left + (rect.width - bubbleRect.width) / 2;

    // Flip below if not enough space above
    if (top < 4) {
      top = rect.bottom + gap;
    }

    // Clamp horizontal to viewport
    left = Math.max(4, Math.min(left, window.innerWidth - bubbleRect.width - 4));

    this.container.style.top = `${top}px`;
    this.container.style.left = `${left}px`;
  }

  destroy(): void {
    this.container.remove();
  }
}
