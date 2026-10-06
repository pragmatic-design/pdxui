// ── IME Composition Handler ───────────────────────────────────────
// First-class composition handling — NOT a patch, a core concern.
//
// FUNDAMENTAL RULE: During composition, do NOT touch the DOM.
// The browser controls cursor and rendering during IME input.
// We buffer changes and apply them at compositionend.
//
// Handles:
// - CJK input (Chinese pinyin, Japanese romaji, Korean hangul)
// - Android GBoard (fires compositionstart for every keystroke)
// - Korean Hangul (composition never truly "ends" until space/punctuation)
// - Dead keys (accent composition on macOS/Linux)

import type { Pos, Selection } from '../model/types.js';

export interface CompositionState {
  /** Whether we're currently in a composition */
  composing: boolean;
  /** Position where composition started */
  startPos: Pos;
  /** Current composition text (from compositionupdate) */
  text: string;
  /** Text that was selected when composition started (will be replaced) */
  replacedText: string;
  /** Selection at composition start */
  startSelection: Selection;
}

export interface CompositionCallbacks {
  getSelection(): Selection;
  getTextAtPos(pos: Pos, length: number): string;
  applyComposedText(from: Pos, to: Pos, text: string): void;
}

export class CompositionHandler {
  private state: CompositionState = {
    composing: false,
    startPos: 0,
    text: '',
    replacedText: '',
    startSelection: { anchor: 0, head: 0, type: 'text' },
  };

  // Android GBoard debounce
  private endTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private callbacks: CompositionCallbacks) {}

  get isComposing(): boolean {
    return this.state.composing;
  }

  get compositionText(): string {
    return this.state.text;
  }

  onCompositionStart(data: string): void {
    if (this.endTimeout) {
      clearTimeout(this.endTimeout);
      this.endTimeout = null;
    }

    if (this.state.composing) {
      // Already composing (Android GBoard: re-fires for every keystroke)
      // Just update the data
      return;
    }

    const sel = this.callbacks.getSelection();
    const from = Math.min(sel.anchor, sel.head);
    const to = Math.max(sel.anchor, sel.head);

    this.state = {
      composing: true,
      startPos: from,
      text: data,
      replacedText: from !== to ? '' : '', // selection will be replaced
      startSelection: sel,
    };
  }

  onCompositionUpdate(data: string): void {
    if (!this.state.composing) return;
    this.state.text = data;
  }

  onCompositionEnd(data: string): void {
    if (!this.state.composing) return;

    // Android GBoard quirk: debounce to see if new compositionstart follows
    this.endTimeout = setTimeout(() => {
      this.endTimeout = null;
      this.flush(data);
    }, 20);
  }

  /** Force-flush any pending composition (e.g. when focus lost) */
  forceEnd(): void {
    if (this.endTimeout) {
      clearTimeout(this.endTimeout);
      this.endTimeout = null;
    }
    if (this.state.composing) {
      this.flush(this.state.text);
    }
  }

  private flush(data: string): void {
    if (!this.state.composing) return;

    const { startPos, startSelection } = this.state;
    const from = startPos;
    const to = Math.max(startPos, Math.max(startSelection.anchor, startSelection.head));
    const text = data || this.state.text;

    this.state = {
      composing: false,
      startPos: 0,
      text: '',
      replacedText: '',
      startSelection: { anchor: 0, head: 0, type: 'text' },
    };

    if (text) {
      this.callbacks.applyComposedText(from, to, text);
    }
  }

  destroy(): void {
    if (this.endTimeout) {
      clearTimeout(this.endTimeout);
      this.endTimeout = null;
    }
  }
}
