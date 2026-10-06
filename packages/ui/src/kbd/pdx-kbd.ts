// pdx-kbd — Keyboard shortcut display. Parses keys by + separator.
// Supports modifier symbols: Cmd→⌘, Alt/Option→⌥, Ctrl→⌃, Shift→⇧.

import { component, html } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/kbd';

const SYMBOLS: Record<string, string> = {
    cmd: '⌘', command: '⌘', meta: '⌘',
    alt: '⌥', option: '⌥',
    ctrl: '⌃', control: '⌃',
    shift: '⇧',
    enter: '↵', return: '↵',
    backspace: '⌫', delete: '⌦',
    tab: '⇥', escape: 'Esc', esc: 'Esc',
    up: '↑', down: '↓', left: '←', right: '→',
};

/**
 * Shows a keyboard shortcut, written as keys joined by +, optionally with modifier symbols.
 */
component('pdx-kbd', {
    props: {
        keys: { type: String, default: '' },
        size: { type: String, default: '' },
        /** Show modifier symbols (⌘⌥⌃⇧) instead of text. Default: false. */
        symbols: { type: Boolean, default: false },
    },
    setup(ctx) {
        function parts(): string[] {
            return (ctx.keys() as string).split('+').map(k => k.trim()).filter(Boolean);
        }
        function displayKey(key: string): string {
            if (ctx.symbols()) {
                const sym = SYMBOLS[key.toLowerCase()];
                if (sym) return sym;
            }
            return key;
        }
        function cssClass(): string {
            let cls = 'pdx-kbd-combo';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-kbd-' + s;
            return cls;
        }
        return { parts, displayKey, cssClass };
    },
    // ⚠️ Without `keys`, the children are the shortcut.
    //
    // `<pdx-kbd>Ctrl</pdx-kbd>` is the form anyone writes. Reading the prop only, with no slot, the
    // component would drop its children in silence and render an EMPTY <kbd> — a 19x6 coloured box
    // beside the search field of an app that believes it has a shortcut hint.
    //
    // The slot, not the element's text: `setup` runs AFTER the render has replaced the content, so
    // `ctx.el.textContent` there is already the rendered markup. Slot projection is the mechanism
    // that keeps the authored children. `keys` still wins when given — it is explicit, and it splits
    // on `+`, which raw children cannot.
    render: (ctx) => html`
        <kbd :class="${ctx.cssClass}">
            ${() => ctx.parts().length
                ? ctx.parts().map((k: string) => html`<kbd class="pdx-kbd">${() => ctx.displayKey(k)}</kbd>`)
                : html`<kbd class="pdx-kbd"><slot></slot></kbd>`}
        </kbd>
    `,
});
