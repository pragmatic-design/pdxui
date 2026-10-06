// Query helpers — Testing Library-inspired selectors for Pragmatic components.
// Pattern: getBy* throws if not found, queryBy* returns null, findBy* is async.

import { waitFor } from './wait';

// ─── By Text ───────────────────────────────────────────────────────

/** Find element by text content. Throws if not found. */
export function getByText(container: HTMLElement, text: string | RegExp): HTMLElement {
    const el = queryByText(container, text);
    if (!el) throw new Error(`getByText: no element found with text "${text}"`);
    return el;
}

/** Find element by text content. Returns null if not found. */
export function queryByText(container: HTMLElement, text: string | RegExp): HTMLElement | null {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const content = node.textContent?.trim() ?? '';
        const match = text instanceof RegExp ? text.test(content) : content.includes(text);
        if (match && node.parentElement) return node.parentElement;
    }
    return null;
}

/** Find element by text content, waiting until it appears. */
export function findByText(container: HTMLElement, text: string | RegExp, timeout?: number): Promise<HTMLElement> {
    return waitFor(() => !!queryByText(container, text), timeout).then(() => getByText(container, text));
}

// ─── By Role ───────────────────────────────────────────────────────

/** Find element by ARIA role. Throws if not found. */
export function getByRole(container: HTMLElement, role: string, options?: { name?: string | RegExp }): HTMLElement {
    const el = queryByRole(container, role, options);
    if (!el) throw new Error(`getByRole: no element found with role="${role}"${options?.name ? ` and name="${options.name}"` : ''}`);
    return el;
}

/** Find element by ARIA role. Returns null if not found. */
export function queryByRole(container: HTMLElement, role: string, options?: { name?: string | RegExp }): HTMLElement | null {
    // Explicit role attribute
    const candidates = container.querySelectorAll<HTMLElement>(`[role="${role}"]`);
    for (const el of candidates) {
        if (matchesName(el, options?.name)) return el;
    }

    // Implicit roles from HTML semantics
    const implicitRoleMap: Record<string, string> = {
        button: 'button,input[type="button"],input[type="submit"],input[type="reset"]',
        link: 'a[href]',
        heading: 'h1,h2,h3,h4,h5,h6',
        textbox: 'input:not([type]),input[type="text"],input[type="email"],input[type="url"],input[type="search"],input[type="tel"],textarea',
        checkbox: 'input[type="checkbox"]',
        radio: 'input[type="radio"]',
        combobox: 'select',
        list: 'ul,ol',
        listitem: 'li',
        navigation: 'nav',
        main: 'main',
        banner: 'header',
        contentinfo: 'footer',
        img: 'img[alt]',
        form: 'form',
        table: 'table',
        row: 'tr',
        cell: 'td',
        columnheader: 'th',
    };

    const selector = implicitRoleMap[role];
    if (selector) {
        const elements = container.querySelectorAll<HTMLElement>(selector);
        for (const el of elements) {
            if (matchesName(el, options?.name)) return el;
        }
    }

    return null;
}

function matchesName(el: HTMLElement, name?: string | RegExp): boolean {
    if (!name) return true;
    const accessible = el.getAttribute('aria-label')
        ?? el.textContent?.trim()
        ?? el.getAttribute('title')
        ?? '';
    return name instanceof RegExp ? name.test(accessible) : accessible.includes(name);
}

// ─── By Test ID ────────────────────────────────────────────────────

/** Find element by data-testid attribute. Throws if not found. */
export function getByTestId(container: HTMLElement, id: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`getByTestId: no element found with data-testid="${id}"`);
    return el;
}

// ─── User Event ────────────────────────────────────────────────────

/** Simulate typing text into an input/textarea. Fires input + change events. */
export async function type(element: HTMLElement, text: string): Promise<void> {
    const input = element as HTMLInputElement;
    input.focus();
    for (const char of text) {
        input.value += char;
        input.dispatchEvent(new InputEvent('input', { data: char, bubbles: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Simulate a click. */
export async function click(element: HTMLElement): Promise<void> {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Clear an input's value. */
export async function clear(element: HTMLElement): Promise<void> {
    const input = element as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new InputEvent('input', { data: '', bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}
