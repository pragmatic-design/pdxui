// `<pdx-kbd>Ctrl</pdx-kbd>` shows Ctrl.
//
// It is the obvious form. A component that read its keys only from a `keys` prop, with no slot, would
// drop its children in silence — leaving an empty 19×6 box, which on a dark masthead reads as a
// coloured rectangle beside the search field.
import { describe, it, expect, afterEach } from 'vitest';
import '../../src/kbd/pdx-kbd';

function mount(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

/** The rendered shortcut, as a reader sees it. */
function shown(host: HTMLElement): string {
    return (host.querySelector('pdx-kbd')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('pdx-kbd', () => {
    it('renders the text it was written with', () => {
        const host = mount('<pdx-kbd>Ctrl</pdx-kbd>');
        expect(shown(host)).toBe('Ctrl');
    });

    it('still renders the keys prop, which is the documented form', () => {
        const host = mount('<pdx-kbd keys="Ctrl+K"></pdx-kbd>');
        expect(shown(host)).toContain('Ctrl');
        expect(shown(host)).toContain('K');
    });

    it('lets the prop win when both are given', () => {
        // Not arbitrary: the prop is explicit, and it is the only one that can split on `+`.
        const host = mount('<pdx-kbd keys="Alt">Ctrl</pdx-kbd>');
        expect(shown(host)).toBe('Alt');
    });

    it('shows no text when given neither, and invents none', () => {
        // `<pdx-kbd></pdx-kbd>` with nothing in it is a mistake by the author, and the component
        // cannot repair it. What it must not do is render a stray character — the empty box is
        // the slot's, and an empty slot is what an empty element deserves.
        const host = mount('<pdx-kbd></pdx-kbd>');
        expect(shown(host)).toBe('');
    });
});
