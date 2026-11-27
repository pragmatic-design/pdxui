// The caret of a picker's trigger: pdx-select's SVG chevron in a `.pdx-select-caret` box (#1461).
//
// pdx-cascader and pdx-tree-select drew a ▾ text glyph that no theme's font carries — a few pixels of
// fallback ink beside the select's chevron, which a theme could colour and nothing else. They build
// their trigger in script, so they take the same element from here; @pdxui/design/components/caret
// draws it, and a theme sizes it on `.pdx-select-caret` for the three at once.

const SVG = 'http://www.w3.org/2000/svg';

/** The caret element: a `.pdx-select-caret` span holding the chevron, with `extraClass` beside it. */
export function createCaret(extraClass: string): HTMLSpanElement {
    const caret = document.createElement('span');
    caret.className = `pdx-select-caret ${extraClass}`;
    caret.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const line = document.createElementNS(SVG, 'polyline');
    line.setAttribute('points', '6 9 12 15 18 9');
    svg.appendChild(line);
    caret.appendChild(svg);
    return caret;
}
