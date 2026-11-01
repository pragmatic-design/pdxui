// pdx-divider — Separator with optional label.
// Label position: left/center/right. Variants: solid/dashed/dotted.

import { component, html, signal, onMount, onDestroy } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/divider';

/**
 * A separator, horizontal or vertical, with an optional label.
 *
 * @csspart line - A line: the `<hr>`, the vertical rule, or each line beside the label.
 * @csspart label - The label between the two lines.
 *
 * @cssstate vertical - `orientation="vertical"`: an inline rule between items on a line.
 * @cssstate label-left - `labelPosition="left"`: the line before the label is short.
 * @cssstate label-right - `labelPosition="right"`: the line after the label is short.
 */
component('pdx-divider', {
    // The line's style (#290, #153): reflected on the host and drawn by divider.css with `@variant`.
    // It was a string spliced into an inline `border-top`.
    variants: {
        /** solid (the default), dashed or dotted. */
        variant: ['solid', 'dashed', 'dotted'],
    },
    // On the host as custom states (#132): divider.css lays the divider out from them.
    states: ['vertical', 'label-left', 'label-right'],
    parts: ['line', 'label'],
    props: {
        orientation: { type: String, default: 'horizontal' },
        /** The label. Unset, the element's text content is the label: `<pdx-divider>OR</pdx-divider>`. */
        label: { type: String, default: '' },
        labelPosition: { type: String, default: 'center' },
    },
    setup(ctx) {
        // The text the author wrote inside the tag is the label when `label` is not set, rather than
        // being replaced by the <hr> and lost, which would leave an "OR" divider a bare line.
        // Setup runs after the children have been taken out for projection, so the
        // template keeps them in a hidden holder through a <slot>, and the label is read from there:
        // on mount, and again when it changes — text that arrives after the connect (a parser or a
        // framework that appends children late) or a bound text node that updates.
        const _text = signal('');
        const _textRead = signal(false);
        const readText = (): void => {
            const holder = ctx.el.querySelector('[data-divider-text]');
            _text.set((holder?.textContent ?? '').trim());
        };
        onMount(() => {
            readText();
            _textRead.set(true);
            const holder = ctx.el.querySelector('[data-divider-text]');
            if (!holder) return;
            const observer = new MutationObserver(readText);
            observer.observe(holder, { childList: true, characterData: true, subtree: true });
            onDestroy(() => { observer.disconnect(); });
        });
        function labelText(): string { return (ctx.label() as string) || _text(); }
        /** Before the mount has read the text, and with no label: draw nothing yet, not a bare line. */
        function collecting(): boolean { return !_textRead() && !(ctx.label() as string); }

        // The host CE is inline by default: a horizontal <hr> (block) would have no width context →
        // width 0 (an invisible divider). divider.css makes it a block, and an inline-block when vertical.
        ctx.track(() => { ctx.state('vertical', ctx.orientation() === 'vertical'); });
        ctx.track(() => {
            const pos = ctx.labelPosition() as string;
            ctx.state('label-left', pos === 'left');
            ctx.state('label-right', pos === 'right');
        });
        return { labelText, collecting };
    },
    // The separator is redrawn on the host, beside the slot: the host's late-children watcher leaves
    // it there, as a node its own template placed. Otherwise it would take a redrawn line for
    // late authored content and move it into the hidden holder — in Chromium, over and over, freezing
    // the page.
    render: (ctx) => html`<span data-divider-text hidden><slot></slot></span>${() => {
            if (ctx.orientation() === 'vertical') {
                return html`<div role="separator" aria-orientation="vertical" data-part="line"></div>`;
            }
            if (ctx.collecting()) return html``;
            const text = ctx.labelText();
            if (text) {
                return html`<div role="separator" class="pdx-divider-labeled">
                    <span data-part="line"></span>
                    <span data-part="label">${text}</span>
                    <span data-part="line"></span>
                </div>`;
            }
            return html`<hr role="separator" data-part="line" />`;
        }}`,
});
