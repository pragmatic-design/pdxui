// pdx-rich-text's toolbar can be translated and reached from the keyboard.
//
// Every button's title and aria-label comes from the component strings, not an English literal in
// a data table ('Bold (Ctrl+B)', 'Insert Image', …), which an Italian app would read untranslated.
// And the toolbar is reachable with Tab and arrow keys: with every button at tabIndex -1, a keyboard
// user reaches only the shortcuts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { EditorView } from '../../src/rich-text/view/view';
import '../../src/rich-text/pdx-rich-text';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 50));

async function mountEditor(toolbar = 'full'): Promise<HTMLElement> {
    const el = document.createElement('pdx-rich-text');
    el.setAttribute('toolbar', toolbar);
    document.body.appendChild(el);
    await settle();
    return el;
}

const buttons = (el: HTMLElement): HTMLButtonElement[] =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.pdx-rt-toolbar-btn'));
const button = (el: HTMLElement, command: string): HTMLButtonElement =>
    el.querySelector(`.pdx-rt-toolbar-btn[data-command="${command}"]`) as HTMLButtonElement;
const key = (target: Element, k: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

beforeEach(() => { document.body.innerHTML = ''; clearComponentStrings(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('pdx-rich-text toolbar — labels come from the string registry', () => {
    it('an override registered before mount names the button, and the shortcut is kept', async () => {
        setComponentStrings('rich-text', { bold: 'Grassetto' });
        const el = await mountEditor();
        const bold = button(el, 'toggleBold');
        expect(bold.getAttribute('aria-label')).toBe('Grassetto (Ctrl+B)');
        expect(bold.title).toBe('Grassetto (Ctrl+B)');
    });

    it('every button of the full toolbar has a registered name, in English by default', async () => {
        const el = await mountEditor();
        const labels = buttons(el).map(b => b.getAttribute('aria-label'));
        expect(labels.length, 'the full toolbar rendered no buttons').toBeGreaterThan(10);
        expect(labels.every(l => !!l)).toBe(true);
        expect(button(el, 'toggleStrike').getAttribute('aria-label')).toBe('Strikethrough');
        expect(button(el, 'insertImage').getAttribute('aria-label')).toBe('Insert image');
        expect(button(el, 'undo').getAttribute('aria-label')).toBe('Undo (Ctrl+Z)');
    });

    it('every item the toolbar can show follows an override — no literal is left', async () => {
        const keys = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'highlight', 'heading1', 'heading2',
            'heading3', 'heading', 'quote', 'codeblock', 'bulletList', 'orderedList', 'taskList', 'list', 'image', 'hr',
            'undo', 'redo', 'source'];
        setComponentStrings('rich-text', Object.fromEntries(keys.map(k => [k, `IT-${k}`])));
        const el = await mountEditor(keys.join(' '));
        const labels = buttons(el).map(b => b.getAttribute('aria-label') ?? '');
        expect(labels).toHaveLength(keys.length);
        expect(labels.filter(l => !l.startsWith('IT-')), 'these labels are still literals').toEqual([]);
    });

    it('the image controls (align, remove) are named from the registry too', async () => {
        setComponentStrings('rich-text', { alignLeft: 'Allinea a sinistra', removeImage: 'Rimuovi immagine' });
        const el = await mountEditor() as HTMLElement & { setHTML(markup: string): void };
        el.setHTML('<p>a</p><img src="https://example.com/x.png" alt="x"><p>b</p>');
        await settle();
        const controls = Array.from(el.querySelectorAll<HTMLButtonElement>('.pdx-rt-image-align-btn'));
        expect(controls.length, 'no image controls rendered').toBe(5);
        const names = controls.map(b => b.getAttribute('aria-label'));
        expect(names).toEqual(['Allinea a sinistra', 'Align center', 'Align right', 'Align full', 'Rimuovi immagine']);
        expect(controls[0].title).toBe('Allinea a sinistra');
    });
});

describe('pdx-rich-text toolbar — one tab stop, arrow keys inside it', () => {
    it('the first button is the tab stop; the others are not', async () => {
        const el = await mountEditor();
        const all = buttons(el);
        expect(all[0].tabIndex, 'no toolbar button can be reached with Tab').toBe(0);
        expect(all.slice(1).every(b => b.tabIndex === -1)).toBe(true);
    });

    it('ArrowRight / ArrowLeft / Home / End move focus and the tab stop', async () => {
        const el = await mountEditor();
        const all = buttons(el);
        all[0].focus();
        key(all[0], 'ArrowRight');
        expect(document.activeElement).toBe(all[1]);
        expect(all[1].tabIndex).toBe(0);
        expect(all[0].tabIndex).toBe(-1);

        key(all[1], 'End');
        expect(document.activeElement).toBe(all[all.length - 1]);
        key(all[all.length - 1], 'Home');
        expect(document.activeElement).toBe(all[0]);
        key(all[0], 'ArrowLeft');
        expect(document.activeElement, 'ArrowLeft from the first wraps to the last').toBe(all[all.length - 1]);
    });

    it('Enter or Space on a focused button runs its command (a keyboard click)', async () => {
        const el = await mountEditor();
        const exec = vi.spyOn(EditorView.prototype, 'execCommand');
        const bold = button(el, 'toggleBold');
        bold.focus();
        bold.click(); // what Enter / Space do on a <button>: a click with detail 0
        expect(exec).toHaveBeenCalledWith('toggleBold');
    });

    it('a mouse click still runs it once — mousedown does, the click adds nothing — the control', async () => {
        const el = await mountEditor();
        const exec = vi.spyOn(EditorView.prototype, 'execCommand');
        const bold = button(el, 'toggleBold');
        bold.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
        bold.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        expect(exec).toHaveBeenCalledTimes(1);
    });
});
