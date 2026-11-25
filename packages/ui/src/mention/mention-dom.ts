// pdx-mention's elements, built by the script as the TypeScript version built them: the frame (the
// highlight mirror, the textarea, the suggestion list and its live region) and one suggestion row.
// Beside the component, which wires their listeners and holds the state.

import type { MentionItem } from './mention-types';
import { uiString, uiAttr } from '../shared/i18n';

/** The elements of one mention field. */
export interface MentionFrame {
    wrap: HTMLElement;
    mirror: HTMLElement;
    textarea: HTMLTextAreaElement;
    dropdown: HTMLElement;
    status: HTMLElement;
}

/** The frame, its parts marked, the textarea named and wired to its list. */
export function buildMentionFrame(opts: { placeholder: string; label: string; rows: number; listId: string; value: string }): MentionFrame {
    const wrap = document.createElement('div');
    wrap.className = 'pdx-mention-wrap';
    wrap.dataset.part = 'root';

    const mirror = document.createElement('div');
    mirror.className = 'pdx-mention-mirror';
    wrap.appendChild(mirror);

    const textarea = document.createElement('textarea');
    textarea.className = 'pdx-mention-textarea';
    textarea.dataset.part = 'input';
    // An accessible name (the placeholder does not count as a label for axe).
    textarea.setAttribute('aria-label', opts.label || opts.placeholder);
    // Wired to its suggestion list: without it the list is invisible to a screen reader.
    // The textarea keeps its own role — a combobox is
    // single-line — so it says what a textbox can: that it completes from a list, which
    // list, and which option is active. Not aria-expanded: a textbox does not support it
    // (axe aria-allowed-attr, critical, measured on the open list). The live region below
    // says the list opened, and how many it holds.
    textarea.setAttribute('aria-autocomplete', 'list');
    textarea.setAttribute('aria-controls', opts.listId);
    textarea.placeholder = opts.placeholder;
    textarea.rows = opts.rows;
    textarea.setAttribute('spellcheck', 'false');
    if (opts.value) textarea.value = opts.value;
    wrap.appendChild(textarea);

    const dropdown = document.createElement('div');
    dropdown.className = 'pdx-mention-dropdown';
    dropdown.dataset.part = 'list';
    // role=listbox: the children have role=option → without a listbox parent they would be orphans (axe).
    dropdown.setAttribute('role', 'listbox');
    uiAttr(dropdown, 'aria-label', () => uiString('mention', 'label'));
    dropdown.id = opts.listId;
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);

    // How many suggestions there are, or that there are none: said once each time it changes.
    const status = document.createElement('div');
    status.className = 'pdx-sr-only';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    wrap.appendChild(status);

    return { wrap, mirror, textarea, dropdown, status };
}

/**
 * One suggestion's row: the parent's snippet, or its label with the query marked and its
 * description. A mousedown picks it — before the textarea's blur closes the list.
 */
export function suggestionRow(entry: MentionItem, i: number, active: boolean, opts: {
    listId: string;
    query: string;
    snippet: ((item: MentionItem, index: number, active: boolean) => Node) | undefined;
    onPick: (item: MentionItem) => void;
}): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pdx-mention-item' + (active ? ' active' : '');
    row.dataset.part = 'option';
    row.id = `${opts.listId}-${i}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', active ? 'true' : 'false');

    // Content: slot > default
    if (opts.snippet) {
        row.appendChild(opts.snippet(entry, i, active));
    } else {
        const text = document.createElement('span');
        text.className = 'pdx-mention-item-label';
        const q = opts.query.toLowerCase();
        const matchIdx = q ? entry.label.toLowerCase().indexOf(q) : -1;
        if (matchIdx >= 0) {
            text.appendChild(document.createTextNode(entry.label.substring(0, matchIdx)));
            const mark = document.createElement('span');
            mark.className = 'pdx-mention-highlight';
            mark.textContent = entry.label.substring(matchIdx, matchIdx + q.length);
            text.appendChild(mark);
            text.appendChild(document.createTextNode(entry.label.substring(matchIdx + q.length)));
        } else {
            text.textContent = entry.label;
        }
        row.appendChild(text);
        if (entry.description) {
            const desc = document.createElement('span');
            desc.className = 'pdx-mention-item-desc';
            desc.textContent = entry.description;
            row.appendChild(desc);
        }
    }
    row.addEventListener('mousedown', (e) => { e.preventDefault(); opts.onPick(entry); });
    return row;
}
