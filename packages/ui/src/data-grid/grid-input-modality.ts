// How the grid was last reached: by the pointer, or by the keyboard.
//
// The grid draws its focus ring on `:focus-visible` only, so a click does not outline a cell like a
// spreadsheet selection. But Chromium counts ANY keydown as keyboard interaction, a lone
// modifier included: holding Shift for a multi-sort makes the header just clicked `:focus-visible`,
// and it would draw its ring while the reader is still using the mouse. `:focus-visible` cannot tell a
// Shift from an arrow key; this can.
//
// `data-pdx-pointer` on the grid while the pointer was the last thing used on it, and the design
// system's grid rules draw no ring under it (`data-grid.css`). A real key — anything but a lone
// modifier — takes it off, so a keyboard reader who started with the mouse keeps their ring.

/** The attribute the grid's focus rules read. */
export const POINTER_ATTR = 'data-pdx-pointer';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

/** Track the input modality on `root`; returns the disposer. */
export function trackInputModality(root: HTMLElement): () => void {
    const onPointer = () => root.setAttribute(POINTER_ATTR, '');
    const onKey = (e: KeyboardEvent) => {
        if (!MODIFIERS.has(e.key)) root.removeAttribute(POINTER_ATTR);
    };
    // The keys on the DOCUMENT, not the grid: a Tab that brings the focus back into the grid is
    // pressed while the focus is still outside it. Capture: the grid's own handlers may stop a key
    // or a pointerdown from propagating.
    const doc = root.ownerDocument;
    root.addEventListener('pointerdown', onPointer, true);
    doc.addEventListener('keydown', onKey, true);
    return () => {
        root.removeEventListener('pointerdown', onPointer, true);
        doc.removeEventListener('keydown', onKey, true);
        root.removeAttribute(POINTER_ATTR);
    };
}
