// The questions pdx-rich-text asks through the browser's prompt come from the component strings.
//
// The link and image commands ask «Link URL:», «Image URL:» and «Alt text:»: as literals, an
// Italian app with a translated toolbar would still show «Image URL:», and the literal-string guard
// does not catch these shapes (a capital second word, a colon before the quote).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { EditorView } from '../../src/rich-text/view/view';
import { StarterKit } from '../../src/rich-text/extensions/starter-kit';
import { createNode, createText } from '../../src/rich-text/model/node';
import { createSelection } from '../../src/rich-text/model/selection';
import '../../src/shared/i18n';

function viewWith(anchor: number, head = anchor): EditorView {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const doc = createNode('doc', {}, [createNode('paragraph', {}, [createText('abc')])]);
    return new EditorView({ element, doc, extensions: [StarterKit], selection: createSelection(anchor, head) });
}

/** happy-dom has no window.prompt: install a stand-in that records what it was asked. */
function stubPrompt(answer: (question: string, call: number) => string | null) {
    const fn = vi.fn((q?: string) => answer(String(q), fn.mock.calls.length));
    Object.defineProperty(window, 'prompt', { value: fn, configurable: true, writable: true });
    return fn;
}

afterEach(() => {
    document.body.innerHTML = '';
    clearComponentStrings();
    delete (window as { prompt?: unknown }).prompt;
});

describe('pdx-rich-text: the browser prompts are translatable', () => {
    it('the link command asks with rich-text.linkUrl', () => {
        setComponentStrings('rich-text', { linkUrl: 'URL del collegamento:' });
        const prompt = stubPrompt(() => null);
        const view = viewWith(1, 3);
        view.execCommand('setLink');
        expect(prompt).toHaveBeenCalledWith('URL del collegamento:');
    });

    it('Ctrl+K asks with rich-text.linkUrl too', () => {
        setComponentStrings('rich-text', { linkUrl: 'URL del collegamento:' });
        const prompt = stubPrompt(() => null);
        const view = viewWith(1, 3);
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
        expect(prompt).toHaveBeenCalledWith('URL del collegamento:');
    });

    it('the image command asks for the URL and the alt text with rich-text.imageUrl and imageAlt', async () => {
        setComponentStrings('rich-text', { imageUrl: 'URL dell\'immagine:', imageAlt: 'Testo alternativo:' });
        const asked: string[] = [];
        stubPrompt((q) => {
            asked.push(q);
            return asked.length === 1 ? 'https://example.com/a.png' : 'un gatto';
        });
        const view = viewWith(2);
        view.execCommand('insertImage');
        // The command asks on a timer, so the registration pass never prompts.
        await vi.waitFor(() => expect(asked).toHaveLength(2));
        expect(asked).toEqual(['URL dell\'immagine:', 'Testo alternativo:']);
    });

    it('the control: with no override the English defaults are asked', () => {
        const prompt = stubPrompt(() => null);
        viewWith(1, 3).execCommand('setLink');
        expect(prompt).toHaveBeenCalledWith('Link URL:');
    });
});
