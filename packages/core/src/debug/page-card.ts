// `__PDX_DEVTOOLS__.page()` (#271): the page card — what the route shows and what can be done on it
// now, in a couple of hundred tokens. Read from the routed element's DOM and its ARIA, like the
// outline: what the user is shown, never a component's internals. Empty members are left out.
//
// Development only, like the rest of the devtools global.

import { CONTROL_ROLES, clean, isPerceivable, nameOf, roleOf } from './a11y-tree';

export interface PageCardList { name: string; shown: number; total?: number; sort?: string; filter?: string }
export interface PageCardForm { name: string; fields: string[]; required?: string[]; invalid?: string[]; valid: boolean }
export interface PageCard {
    route?: { path: string; matched: string | null; params?: Record<string, string> };
    title?: string;
    lists?: PageCardList[];
    forms?: PageCardForm[];
    live?: string[];
    errors?: string[];
    actions?: string[];
    rowActions?: string[];
    links?: string[];
}

const MAX_TEXT = 80;
const MAX_LINKS = 10;

const cut = (text: string): string => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text);

/** The routed content: the outermost element the router marked, else `main`, else the body. */
export function routeRoot(doc: Document = document): Element {
    return doc.querySelector('[data-pdx-route]') ?? doc.querySelector('main') ?? doc.body;
}

/** Every perceivable element under `root`, in document order. */
function perceivable(root: Element): Element[] {
    const out: Element[] = [];
    const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
            if (!isPerceivable(child)) continue;
            out.push(child);
            walk(child);
        }
    };
    walk(root);
    return out;
}

function isDisabled(el: Element): boolean {
    return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

/** A field's key: its `name`, else its accessible name (a generated id says nothing), else its id. */
function fieldKey(el: Element): string {
    return el.getAttribute('name') || nameOf(el) || el.id;
}

/**
 * Inside a list of data or a navigation: its controls belong to the list (sort, filter, select a row,
 * page through) and are counted there, not as the page's fields or actions.
 */
const IN_COLLECTION = '[data-pdx-item], [role=grid], [role=table], [role=treegrid], table, [role=navigation], nav';

const FIELD = 'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), select, textarea, [role=textbox], [role=combobox], [role=checkbox], [role=switch], [role=radiogroup], [role=spinbutton]';

function formsIn(nodes: Element[]): PageCardForm[] {
    return nodes.filter((el) => el.localName === 'form').map((form) => {
        const fields = Array.from(form.querySelectorAll(FIELD)).filter((f) => isPerceivable(f) && !f.closest(IN_COLLECTION));
        const keys = (els: Element[]): string[] => [...new Set(els.map(fieldKey).filter(Boolean))];
        const required = keys(fields.filter((f) => (f as HTMLInputElement).required === true || f.getAttribute('aria-required') === 'true'));
        const invalid = keys(fields.filter((f) => f.getAttribute('aria-invalid') === 'true'));
        const card: PageCardForm = { name: nameOf(form) || form.getAttribute('data-test') || '', fields: keys(fields), valid: invalid.length === 0 };
        if (required.length) card.required = required;
        if (invalid.length) card.invalid = invalid;
        return card;
    });
}

/** The lists of data on the page: each parent of rows the runtime marked, with its counts. */
function listsIn(nodes: Element[]): PageCardList[] {
    const parents = new Map<Element, number>();
    for (const el of nodes) {
        if (!el.hasAttribute('data-pdx-item') || !el.parentElement) continue;
        parents.set(el.parentElement, (parents.get(el.parentElement) ?? 0) + 1);
    }
    return [...parents].map(([parent, shown]) => {
        const named = parent.closest('[aria-label], [aria-labelledby], [data-test]') ?? parent;
        const list: PageCardList = { name: nameOf(named) || named.getAttribute('data-test') || roleOf(parent) || parent.localName, shown };
        const total = Number(parent.closest('[aria-rowcount]')?.getAttribute('aria-rowcount')
            ?? parent.querySelector('[aria-setsize]')?.getAttribute('aria-setsize'));
        if (Number.isFinite(total) && total > 0) list.total = total;
        const table = parent.closest('table, [role=grid], [role=table], [role=treegrid]') ?? parent;
        const sorted = table.querySelector('[aria-sort]:not([aria-sort=none])');
        if (sorted) list.sort = `${nameOf(sorted)} ${sorted.getAttribute('aria-sort')}`;
        const host = parent.closest(':is([data-test], [role=region], section)')?.parentElement ?? parent.parentElement;
        const search = host?.querySelector<HTMLInputElement>('input[type=search], [role=searchbox]');
        if (search?.value) list.filter = search.value;
        return list;
    });
}

/** The page card for the routed content, with the route and the errors the devtools know. */
export function pageCard(route: PageCard['route'] | null, errors: readonly string[]): PageCard {
    const root = routeRoot();
    const nodes = perceivable(root);
    const card: PageCard = {};
    if (route) card.route = route;
    const title = clean(document.title);
    if (title) card.title = title;

    const lists = listsIn(nodes);
    if (lists.length) card.lists = lists;
    const forms = formsIn(nodes);
    if (forms.length) card.forms = forms;

    // Live messages: the route's own, and an alert anywhere (a toast is announced from outside the
    // route). The shell's persistent status regions are not news.
    const live = [...nodes.filter((el) => el.matches('[aria-live]:not([aria-live=off]), [role=status], [role=alert]')),
        ...Array.from(document.querySelectorAll('[role=alert]')).filter((el) => !root.contains(el) && isPerceivable(el))]
        .map((el) => clean(el.textContent)).filter(Boolean).map(cut);
    if (live.length) card.live = [...new Set(live)];
    if (errors.length) card.errors = errors.slice(-3).map(cut);

    const actions = new Set<string>();
    const rowActions = new Set<string>();
    const links = new Set<string>();
    for (const el of nodes) {
        const role = roleOf(el);
        if (!CONTROL_ROLES.has(role) || isDisabled(el)) continue;
        const inRow = !!el.closest('[data-pdx-item]');
        if (role === 'button') {
            if (inRow) rowActions.add(nameOf(el));
            else if (!el.closest(IN_COLLECTION)) actions.add(nameOf(el));
        }
        else if (role === 'link' && !inRow) {
            const href = el.getAttribute('href') ?? el.getAttribute('to');
            if (href && href.startsWith('/')) links.add(href);
        }
    }
    actions.delete('');
    rowActions.delete('');
    if (actions.size) card.actions = [...actions];
    if (rowActions.size) card.rowActions = [...rowActions];
    if (links.size) card.links = [...links].slice(0, MAX_LINKS);
    return card;
}
