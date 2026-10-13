// The accessibility facts `__PDX_DEVTOOLS__.outline()` and `page()` read (#271): an element's role,
// its accessible name, and whether a reader can perceive it. All read from the DOM, never from a
// component's state: the outline is a projection of what is on the page, not a second source.
//
// A pragmatic subset of the WAI-ARIA rules — explicit roles, the implicit roles of the elements an
// app renders, names from aria-label, aria-labelledby, a label, alt, placeholder or the content —
// enough to describe a page for an agent. It is not an accessibility checker.

/** The roles a person or an agent acts on. */
export const CONTROL_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider',
    'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'listbox', 'treeitem',
]);

/** The roles whose name is their content (a button's label is its text). */
const NAME_FROM_CONTENT = new Set([
    'button', 'link', 'heading', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'cell', 'gridcell', 'columnheader', 'rowheader', 'treeitem', 'switch', 'checkbox', 'radio', 'listitem', 'row',
]);

const INPUT_ROLES: Record<string, string> = {
    checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox',
    button: 'button', submit: 'button', reset: 'button', image: 'button',
};

/** The element's role: its `role` attribute, else the implicit role of its tag, else ''. */
export function roleOf(el: Element): string {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.trim().split(/\s+/)[0];
    const tag = el.localName;
    switch (tag) {
        case 'a': return el.hasAttribute('href') ? 'link' : '';
        case 'button': return 'button';
        case 'input': {
            const type = (el.getAttribute('type') ?? 'text').toLowerCase();
            if (type === 'hidden') return '';
            return INPUT_ROLES[type] ?? 'textbox';
        }
        case 'textarea': return 'textbox';
        case 'select': return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
        case 'img': return el.getAttribute('alt') === '' ? '' : 'img';
        case 'ul': case 'ol': return 'list';
        case 'li': return 'listitem';
        case 'table': return 'table';
        case 'tr': return 'row';
        case 'td': return 'cell';
        case 'th': return 'columnheader';
        case 'nav': return 'navigation';
        case 'dialog': return 'dialog';
        case 'summary': return 'button';
        // A form or a section is a landmark only when it is named — by aria-label(ledby), never its content.
        case 'form': return explicitName(el) ? 'form' : '';
        case 'section': return explicitName(el) ? 'region' : '';
        case 'fieldset': return 'group';
        case 'progress': return 'progressbar';
        default: return '';
    }
}

/** Whitespace collapsed, ends trimmed. */
export function clean(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** The visible text under `el`, hidden subtrees left out. */
export function visibleText(el: Element): string {
    let out = '';
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 3) out += child.textContent ?? '';
        else if (child.nodeType === 1 && isPerceivable(child as Element)) out += ' ' + visibleText(child as Element) + ' ';
    }
    return clean(out);
}

function textOfIds(el: Element, ids: string): string {
    const doc = el.ownerDocument;
    return clean(ids.split(/\s+/).map((id) => {
        const target = doc.getElementById(id);
        return target ? visibleText(target) : '';
    }).join(' '));
}

/** The name an author gave the element: aria-labelledby, else aria-label, else ''. */
function explicitName(el: Element): string {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const text = textOfIds(el, labelledBy);
        if (text) return text;
    }
    return clean(el.getAttribute('aria-label'));
}

/** The element's accessible name: aria-labelledby, aria-label, a label, alt, title, placeholder, or its content. */
export function nameOf(el: Element): string {
    const label = explicitName(el);
    if (label) return label;
    const tag = el.localName;
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        const id = el.getAttribute('id');
        const forLabel = id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const wrapping = el.closest('label');
        const text = clean((forLabel ? visibleText(forLabel) : '') || (wrapping ? visibleText(wrapping) : ''));
        if (text) return text;
        const type = (el.getAttribute('type') ?? '').toLowerCase();
        if (type === 'submit' || type === 'button' || type === 'reset') return clean(el.getAttribute('value'));
        return clean(el.getAttribute('title') ?? el.getAttribute('placeholder'));
    }
    if (tag === 'img') return clean(el.getAttribute('alt') ?? el.getAttribute('title'));
    if (NAME_FROM_CONTENT.has(roleOf(el))) return visibleText(el) || clean(el.getAttribute('title'));
    return clean(el.getAttribute('title'));
}

/**
 * Whether a reader can perceive the element: not `hidden`, not `aria-hidden`, not `inert`, not
 * `display: none` or `visibility: hidden`. Read from the DOM and its computed style.
 */
export function isPerceivable(el: Element): boolean {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('inert')) return false;
    const tag = el.localName;
    if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript') return false;
    const style = el.ownerDocument.defaultView?.getComputedStyle(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) return false;
    return true;
}
