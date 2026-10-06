// ── DOM Observer ──────────────────────────────────────────────────
// Watches DOM mutations and input events to synchronize with the model.
// Two-phase approach:
// 1. Intercept beforeinput (preferred, modern) for all typed input
// 2. MutationObserver as fallback for direct DOM mutations (spellcheck, etc.)

export interface DOMObserverCallbacks {
  onInput(type: string, data: string | null, targetRange: StaticRange | null): void;
  onCompositionStart(data: string): void;
  onCompositionUpdate(data: string): void;
  onCompositionEnd(data: string): void;
  onSelectionChange(): void;
  onMutation(mutations: MutationRecord[]): void;
  onKeyDown(e: KeyboardEvent): void;
  onFocus(): void;
  onBlur(): void;
  onDrop(e: DragEvent): void;
  onCopy(e: ClipboardEvent): void;
  onCut(e: ClipboardEvent): void;
  onPaste(e: ClipboardEvent): void;
}

export class DOMObserver {
  private observer: MutationObserver;
  private suppressMutations = false;
  private composing = false;

  constructor(
    private element: HTMLElement,
    private callbacks: DOMObserverCallbacks,
  ) {
    this.observer = new MutationObserver(this.handleMutations);
    this.setup();
  }

  private setup(): void {
    const el = this.element;

    // MutationObserver for direct DOM changes (spellcheck, extensions, etc.)
    this.observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
      characterDataOldValue: true,
    });

    // beforeinput — the primary input path (modern browsers)
    el.addEventListener('beforeinput', this.onBeforeInput);

    // Composition events — IME handling
    el.addEventListener('compositionstart', this.onCompositionStart);
    el.addEventListener('compositionupdate', this.onCompositionUpdate);
    el.addEventListener('compositionend', this.onCompositionEnd);

    // Key events — for shortcuts and special keys
    el.addEventListener('keydown', this.onKeyDown);

    // Selection
    document.addEventListener('selectionchange', this.onSelectionChange);

    // Focus
    el.addEventListener('focus', this.onFocus);
    el.addEventListener('blur', this.onBlur);

    // Drag and drop
    el.addEventListener('drop', this.onDrop);
    el.addEventListener('dragover', this.onDragOver);

    // Clipboard
    el.addEventListener('copy', this.onCopy);
    el.addEventListener('cut', this.onCut);
    el.addEventListener('paste', this.onPaste);
  }

  // ── Suppress mutations during our own DOM updates ──────────

  suppressWhile(fn: () => void): void {
    this.suppressMutations = true;
    // Flush pending mutations before suppressing
    this.observer.takeRecords();
    fn();
    // Flush mutations caused by our update
    this.observer.takeRecords();
    this.suppressMutations = false;
  }

  get isComposing(): boolean {
    return this.composing;
  }

  // ── Event Handlers ─────────────────────────────────────────

  private onBeforeInput = (e: InputEvent): void => {
    // During composition, let the browser handle it
    if (this.composing && e.inputType !== 'insertFromComposition') return;

    const inputType = e.inputType;
    const data = e.data;
    const targetRange = e.getTargetRanges()[0] ?? null;

    // Handle known input types
    switch (inputType) {
      case 'insertText':
      case 'insertReplacementText':
      case 'insertFromPaste':
      case 'insertFromDrop':
      case 'insertParagraph':
      case 'insertLineBreak':
      case 'deleteContentBackward':
      case 'deleteContentForward':
      case 'deleteWordBackward':
      case 'deleteWordForward':
      case 'deleteSoftLineBackward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineBackward':
      case 'deleteHardLineForward':
      case 'deleteEntireSoftLine':
      case 'formatBold':
      case 'formatItalic':
      case 'formatUnderline':
      case 'formatStrikeThrough':
      case 'historyUndo':
      case 'historyRedo':
        e.preventDefault();
        this.callbacks.onInput(inputType, data, targetRange);
        break;

      case 'insertFromComposition':
        // Let composition handler deal with it
        break;

      default:
        // Unknown input type — prevent and log
        e.preventDefault();
        this.callbacks.onInput(inputType, data, targetRange);
        break;
    }
  };

  private onCompositionStart = (e: CompositionEvent): void => {
    this.composing = true;
    this.callbacks.onCompositionStart(e.data ?? '');
  };

  private onCompositionUpdate = (e: CompositionEvent): void => {
    this.callbacks.onCompositionUpdate(e.data ?? '');
  };

  private onCompositionEnd = (e: CompositionEvent): void => {
    // Android GBoard quirk: fires compositionstart for EVERY keystroke
    // Debounce: wait 20ms to see if a new compositionstart follows
    setTimeout(() => {
      if (!this.composing) return; // already handled by another compositionend
      this.composing = false;
      this.callbacks.onCompositionEnd(e.data ?? '');
    }, 20);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    // Don't handle keys during composition
    if (this.composing) return;
    this.callbacks.onKeyDown(e);
  };

  private onSelectionChange = (): void => {
    // Only handle if our element contains the selection
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!this.element.contains(sel.anchorNode)) return;
    // Don't update selection during composition
    if (this.composing) return;
    this.callbacks.onSelectionChange();
  };

  private onFocus = (): void => {
    this.callbacks.onFocus();
  };

  private onBlur = (): void => {
    this.callbacks.onBlur();
  };

  private onDrop = (e: DragEvent): void => {
    e.preventDefault();
    this.callbacks.onDrop(e);
  };

  private onDragOver = (e: DragEvent): void => {
    e.preventDefault();
  };

  private onCopy = (e: ClipboardEvent): void => {
    this.callbacks.onCopy(e);
  };

  private onCut = (e: ClipboardEvent): void => {
    this.callbacks.onCut(e);
  };

  private onPaste = (e: ClipboardEvent): void => {
    e.preventDefault();
    this.callbacks.onPaste(e);
  };

  private handleMutations = (mutations: MutationRecord[]): void => {
    if (this.suppressMutations) return;
    if (mutations.length === 0) return;
    // During composition, buffer mutations
    if (this.composing) return;
    this.callbacks.onMutation(mutations);
  };

  // ── Cleanup ────────────────────────────────────────────────

  destroy(): void {
    const el = this.element;
    this.observer.disconnect();
    el.removeEventListener('beforeinput', this.onBeforeInput);
    el.removeEventListener('compositionstart', this.onCompositionStart);
    el.removeEventListener('compositionupdate', this.onCompositionUpdate);
    el.removeEventListener('compositionend', this.onCompositionEnd);
    el.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    el.removeEventListener('focus', this.onFocus);
    el.removeEventListener('blur', this.onBlur);
    el.removeEventListener('drop', this.onDrop);
    el.removeEventListener('dragover', this.onDragOver);
    el.removeEventListener('copy', this.onCopy);
    el.removeEventListener('cut', this.onCut);
    el.removeEventListener('paste', this.onPaste);
  }
}
