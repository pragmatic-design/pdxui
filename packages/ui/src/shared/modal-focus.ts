// Focus stays in an open modal when the user clicks on it.
//
// A click on something that cannot take focus moves focus to its nearest focusable ancestor. For a
// modal that is outside it: the backdrop and the panel are plain elements, so a click on the backdrop,
// or on the dialog's own text, would move document.activeElement to the page host behind the
// aria-modal dialog — and the next Tab would go to the page. The focus trap cycles Tab only while focus is inside.
//
// Pulling focus back from wherever it lands would be the general fix, and the wrong one here: menus,
// data-grid filters and other popups opened from inside a dialog render on <body>, outside the panel,
// and take focus legitimately. So the modal's own surface keeps it instead:
//   - the panel is focusable (tabindex -1, out of the Tab order): a click on its text focuses the
//     panel, inside the modal, as a native <dialog> does;
//   - a mousedown on the backdrop itself is prevented, so a click there moves focus nowhere. The click
//     event still fires, so a backdrop that closes the modal still does.

const held = new WeakSet<HTMLElement>();

/** Keep focus inside `panel` when the user clicks on it or on `backdrop`. Safe to call again. */
export function holdModalFocus(backdrop: HTMLElement, panel: HTMLElement): void {
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    if (held.has(backdrop)) return;
    held.add(backdrop);
    backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop) e.preventDefault();
    });
}
