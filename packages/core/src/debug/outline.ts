// `__PDX_DEVTOOLS__.outline()` (#271): the route's `main`, described for an agent in a fraction of a
// full accessibility snapshot. A projection of the accessibility tree — never a second source — with
// the rules of docs/language/beta/agents.md:
//
//   · visibility is read from the DOM;
//   · text that repeats its parent's name, unnamed images and unnamed wrappers are dropped;
//   · a run of controls sharing a role (a toolbar, a pager) is ONE line, every name kept;
//   · only data repetition — the rows the runtime marks `data-pdx-item` — is summarised, above
//     `maxItems`: two samples, then `… N more <role>` with the refs of the next ones;
//   · every actionable node carries a selector that stays valid across calls.
//
// Development only: reached through the devtools global, which a production build does not have.

import { CONTROL_ROLES, clean, isPerceivable, nameOf, roleOf } from './a11y-tree';
import { isGeneratedId } from '../utils/generated-id';

/** The roles a line is written for. Anything else is a wrapper, and its children rise to its place. */
const KEPT_ROLES = new Set([
    ...CONTROL_ROLES,
    'heading', 'img', 'list', 'listitem', 'table', 'grid', 'row', 'cell', 'gridcell', 'columnheader',
    'rowheader', 'navigation', 'main', 'search', 'dialog', 'alertdialog', 'alert', 'status', 'tablist',
    'tabpanel', 'menu', 'menubar', 'tree', 'progressbar', 'form', 'region', 'group', 'toolbar',
]);
/** Kept only with a name: unnamed, they are wrappers like any other. */
const KEPT_IF_NAMED = new Set(['img', 'form', 'region', 'group', 'toolbar', 'list', 'navigation', 'tabpanel']);
/** Their content IS their name: the text under them would only repeat it. */
const NAMED_BY_CONTENT = new Set([
    'button', 'link', 'heading', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'cell', 'gridcell', 'columnheader', 'rowheader', 'treeitem', 'switch', 'checkbox', 'radio',
]);

const MAX_TEXT = 100;
const NEXT_REFS = 5;

interface Node { role: string; name: string; el: Element | null; item: boolean; children: Node[] }

/**
 * A CSS selector `el` alone matches: its `data-test` or `id` when unique, a component tag when unique.
 * Not an id a component generated from a counter: it changes with the navigation that led to the page,
 * so a selector built on it would be wrong in the next session (#391).
 */
function anchorOf(el: Element): string | null {
    const doc = el.ownerDocument;
    const test = el.getAttribute('data-test');
    if (test) {
        const sel = `[data-test="${CSS.escape(test)}"]`;
        if (doc.querySelectorAll(sel).length === 1) return sel;
    }
    if (el.id && !isGeneratedId(el.id)) {
        const sel = `#${CSS.escape(el.id)}`;
        if (doc.querySelectorAll(sel).length === 1) return sel;
    }
    if (el.localName.includes('-') && doc.getElementsByTagName(el.localName).length === 1) return el.localName;
    return null;
}

/** `el`'s tag, with its position among same-tag siblings when it has some. */
function step(el: Element): string {
    const parent = el.parentElement;
    if (!parent) return el.localName;
    const same = Array.from(parent.children).filter((c) => c.localName === el.localName);
    return same.length > 1 ? `${el.localName}:nth-of-type(${same.indexOf(el) + 1})` : el.localName;
}

/** Whether `sel` matches `el` and nothing else. */
function selects(sel: string, el: Element): boolean {
    try {
        const all = el.ownerDocument.querySelectorAll(sel);
        return all.length === 1 && all[0] === el;
    } catch {
        return false; // not a valid selector: another candidate is tried
    }
}

/** The attributes that tell a control apart, in the order they are tried. */
const TELLING = ['aria-label', 'name', 'placeholder', 'title', 'href'];

/** The controls an agent clicks: the host around one of them is clicked as well as the control. */
const CLICKED = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem']);

/** An attribute value in a CSS string: only `"` and `\` need escaping there. */
function attrValue(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
}

/** Whether `el` is the only perceivable control under `scope`. */
function onlyControlIn(el: Element, scope: Element): boolean {
    let count = 0;
    for (const node of Array.from(scope.querySelectorAll('*'))) {
        if (CONTROL_ROLES.has(roleOf(node)) && isPerceivable(node) && ++count > 1) return false;
    }
    return count === 1 && scope.contains(el);
}

/**
 * The selector an agent acts on `el` with, as short as stays unique: its own anchor (a unique
 * `data-test`, id or component tag); else, under the nearest ancestor that has one, its tag with a
 * telling attribute; else the shortest path of tags up from it. The same DOM gives the same selector,
 * so it holds across calls and across sessions.
 */
export function selectorOf(el: Element): string {
    const own = anchorOf(el);
    if (own) return own;
    let scopeEl = el.parentElement;
    let scope: string | null = null;
    while (scopeEl && scopeEl.localName !== 'body' && !(scope = anchorOf(scopeEl))) scopeEl = scopeEl.parentElement;
    // A component that wraps one clickable control — a `<pdx-link>`, a `<pdx-button>` — is clicked
    // as its control is: its own selector is the shortest that stays right.
    if (scope && scopeEl && CLICKED.has(roleOf(el)) && onlyControlIn(el, scopeEl)) return scope;
    // Every candidate that finds this element and no other; the shortest wins — the outline pays for
    // each character of each ref.
    const prefixes = scope ? ['', `${scope} `] : [''];
    const candidates: string[] = [];
    for (const attr of TELLING) {
        const value = el.getAttribute(attr);
        // A generated value — an unnamed radio group's `name` — changes like a generated id (#391).
        if (!value || isGeneratedId(value)) continue;
        for (const p of prefixes) candidates.push(`${p}[${attr}="${attrValue(value)}"]`, `${p}${el.localName}[${attr}="${attrValue(value)}"]`);
    }
    // A path is positional: unscoped, the next button added anywhere on the page would break it, so a
    // path always starts at the anchor. An attribute says what the control is, and stands alone.
    const steps: string[] = [];
    for (let cur: Element | null = el; cur && cur !== scopeEl; cur = cur.parentElement) {
        steps.unshift(step(cur));
        candidates.push(`${prefixes[prefixes.length - 1]}${steps.join(' > ')}`);
    }
    const found = candidates.filter((sel) => selects(sel, el)).sort((a, b) => a.length - b.length)[0];
    return found ?? `${scope ? `${scope} > ` : ''}${steps.join(' > ')}`;
}

/** What opens over the page: a dialog, a listbox, a menu, a tooltip, a popover. */
const OVERLAY = '[role=dialog], [role=alertdialog], [role=listbox], [role=menu], [role=tooltip], [popover]';

/** `el` and every ancestor up to the body are perceivable: an ancestor's `display: none` is not in `el`'s style. */
function shown(el: Element): boolean {
    for (let cur: Element | null = el; cur && cur.localName !== 'body'; cur = cur.parentElement) {
        if (!isPerceivable(cur)) return false;
    }
    return true;
}

/**
 * The overlays open outside `route`, outermost only: a filter's popover, a select's listbox, a menu
 * the route opened and the runtime mounted on the body. The user is looking at them now, so they
 * belong to the outline; the shell, read once per session, leaves them out.
 */
export function overlaysOutside(route: Element): Element[] {
    return Array.from(route.ownerDocument.querySelectorAll(OVERLAY))
        .filter((el) => !route.contains(el) && !el.parentElement?.closest(OVERLAY) && shown(el));
}

/**
 * The outline nodes for `el`: one node if it has a kept role, its children's nodes otherwise.
 * What `exclude` holds is left out with everything under it — the route and the open overlays, when
 * the shell is outlined.
 */
function build(el: Element, parentName: string, exclude: readonly Element[]): Node[] {
    if (exclude.includes(el) || !isPerceivable(el)) return [];
    const role = roleOf(el);
    const name = role ? nameOf(el) : '';
    const kept = KEPT_ROLES.has(role) && !(KEPT_IF_NAMED.has(role) && !name);
    const item = el.hasAttribute('data-pdx-item');
    const ownName = kept ? name : parentName;
    const children: Node[] = [];
    // A control named by its content says it all: only the controls inside it are kept (a row's buttons).
    const skipText = kept && NAMED_BY_CONTENT.has(role) && !!name;
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 3) {
            if (skipText) continue;
            const text = clean(child.textContent);
            if (!text || text === ownName) continue;
            const last = children[children.length - 1];
            if (last && last.role === 'text') last.name = clean(`${last.name} ${text}`);
            else children.push({ role: 'text', name: text, el: null, item: false, children: [] });
        } else if (child.nodeType === 1) {
            const sub = build(child as Element, ownName, exclude);
            children.push(...(skipText ? sub.filter((n) => n.role !== 'text') : sub));
        }
    }
    if (kept) {
        // A container named by its content — a list item, a row — repeats the controls inside it.
        const repeats = (role === 'listitem' || role === 'row') && children.some((c) => c.role !== 'text');
        // A landmark or a status with nothing in it and no name says nothing.
        if (!name && children.length === 0 && !CONTROL_ROLES.has(role)) return [];
        return [{ role, name: repeats ? '' : name, el, item, children }];
    }
    // A row of data with no role of its own: its content, still marked as one item.
    if (item && children.length > 0) return [{ role: 'item', name: '', el, item: true, children }];
    return children;
}

function ref(n: Node): string {
    return n.el && CONTROL_ROLES.has(n.role) ? ` [${selectorOf(n.el)}]` : '';
}

function quote(text: string): string {
    const cut = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
    return JSON.stringify(cut);
}

function line(n: Node): string {
    if (n.role === 'text') return `text ${quote(n.name)}`;
    if (n.role === 'item') return 'item';
    return `${n.role}${n.name ? ` ${quote(n.name)}` : ''}${ref(n)}`;
}

/** A leaf control: what a run of same-role controls is made of. */
function isLeafControl(n: Node): boolean {
    return CONTROL_ROLES.has(n.role) && n.children.length === 0 && !n.item;
}

/**
 * A row as one line: each cell's text, ` | ` between cells, and the controls in a cell in place —
 * `row: "C-2000" | "Northwind" | checkbox "Select row 1" [ref]`. A table read cell by cell costs a line
 * per cell; the agent needs the values and what can be done with the row.
 */
function rowLine(row: Node): string {
    const cells = row.children.map((cell) => {
        const parts: string[] = [];
        const visit = (n: Node): void => {
            if (CONTROL_ROLES.has(n.role)) parts.push(`${n.role} ${quote(n.name)}${ref(n)}`);
            else if (n.role === 'text') parts.push(quote(n.name));
            else if (n.children.length === 0 && n.name) parts.push(quote(n.name));
            else n.children.forEach(visit);
        };
        visit(cell);
        return parts.join(' ');
    }).filter(Boolean);
    return `row: ${cells.join(' | ')}`;
}

/** A row whose content is cells — what {@link rowLine} writes on one line. */
function isTableRow(n: Node): boolean {
    return n.role === 'row' && n.children.length > 0
        && n.children.every((c) => c.role === 'cell' || c.role === 'gridcell' || c.role === 'columnheader' || c.role === 'rowheader');
}

function render(nodes: Node[], depth: number, maxItems: number, out: string[]): void {
    const pad = '  '.repeat(depth);
    for (let i = 0; i < nodes.length;) {
        const n = nodes[i];
        // A label written as text right before or right after the control it names says nothing the
        // control does not: `<label><input> Active</label>` is the checkbox "Active".
        const names = (m: Node | undefined): boolean => !!m && CONTROL_ROLES.has(m.role) && m.name === n.name;
        if (n.role === 'text' && (names(nodes[i + 1]) || names(nodes[i - 1]))) {
            i++;
            continue;
        }
        // Data repetition: the run of marked items, summarised above the threshold.
        if (n.item) {
            let j = i;
            while (j < nodes.length && nodes[j].item) j++;
            const run = nodes.slice(i, j);
            const shown = run.length > maxItems ? run.slice(0, 2) : run;
            for (const r of shown) renderOne(r, depth, maxItems, out);
            if (run.length > shown.length) {
                const rest = run.slice(shown.length);
                const refs = rest.slice(0, NEXT_REFS).map((r) => (r.el ? selectorOf(r.el) : '')).filter(Boolean);
                out.push(`${pad}- … ${rest.length} more ${n.role === 'item' ? 'items' : n.role}${refs.length ? ` [${refs.join(' | ')}]` : ''}`);
            }
            i = j;
            continue;
        }
        // A run of leaf controls sharing a role: one line, every name and ref kept.
        if (isLeafControl(n)) {
            let j = i;
            while (j < nodes.length && isLeafControl(nodes[j]) && nodes[j].role === n.role) j++;
            if (j - i > 1) {
                const names = nodes.slice(i, j).map((c) => `${quote(c.name)}${ref(c)}`).join(', ');
                out.push(`${pad}- ${n.role} ×${j - i}: ${names}`);
                i = j;
                continue;
            }
        }
        renderOne(n, depth, maxItems, out);
        i++;
    }
}

function renderOne(n: Node, depth: number, maxItems: number, out: string[]): void {
    if (isTableRow(n)) {
        out.push(`${'  '.repeat(depth)}- ${rowLine(n)}`);
        return;
    }
    out.push(`${'  '.repeat(depth)}- ${line(n)}${n.children.length ? ':' : ''}`);
    render(n.children, depth + 1, maxItems, out);
}

/** Options of {@link outline}. */
export interface OutlineOptions {
    /** Above this many items, a data repetition shows two and summarises the rest. Default 5. */
    maxItems?: number;
}

/**
 * The outline of `root`, one node per line, indented by nesting. The elements in `exclude` are left
 * out with their subtrees: `shell()` is the body's outline without the route and the open overlays.
 */
export function outlineOf(root: Element, options: OutlineOptions = {}, exclude: readonly Element[] = []): string {
    const out: string[] = [];
    render(build(root, '', exclude), 0, Math.max(2, options.maxItems ?? 5), out);
    return out.join('\n');
}
