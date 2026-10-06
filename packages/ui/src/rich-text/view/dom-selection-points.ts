// ── DOM Selection Points ──────────────────────────────────────────
// The four boundary points of a DOM selection, kept so the view can tell the selectionchange its
// own write fired from one the user caused.

export interface DOMSelectionPoints {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
}

export function domSelectionPoints(sel: globalThis.Selection): DOMSelectionPoints {
  return {
    anchorNode: sel.anchorNode,
    anchorOffset: sel.anchorOffset,
    focusNode: sel.focusNode,
    focusOffset: sel.focusOffset,
  };
}

export function sameDOMSelection(a: DOMSelectionPoints, b: DOMSelectionPoints | null): boolean {
  return b !== null
    && a.anchorNode === b.anchorNode && a.anchorOffset === b.anchorOffset
    && a.focusNode === b.focusNode && a.focusOffset === b.focusOffset;
}
