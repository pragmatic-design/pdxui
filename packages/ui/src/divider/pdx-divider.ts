// pdx-divider — Separator with optional label.
// Label position: left/center/right. Variants: solid/dashed/dotted.

import { component, html, effect, signal, onMount, onDestroy } from '@pdxui/core';

/**
 * A separator, horizontal or vertical, with an optional label.
 */
component('pdx-divider', {
    props: {
        orientation: { type: String, default: 'horizontal' },
        /** The label. Unset, the element's text content is the label: `<pdx-divider>OR</pdx-divider>`. */
        label: { type: String, default: '' },
        variant: { type: String, default: 'solid' },
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

        function borderStyle(): string {
            return '1px ' + (ctx.variant() || 'solid') + ' var(--pdx-color-border,#e0e0e0)';
        }
        function leftLineStyle(): string {
            const pos = ctx.labelPosition() as string || 'center';
            return 'flex:' + (pos === 'left' ? '0 0 1rem' : '1') + ';border-top:' + borderStyle();
        }
        function rightLineStyle(): string {
            const pos = ctx.labelPosition() as string || 'center';
            return 'flex:' + (pos === 'right' ? '0 0 1rem' : '1') + ';border-top:' + borderStyle();
        }
        function hrStyle(): string {
            return 'border:none;border-top:' + borderStyle() + ';margin:var(--pdx-space-sm,8px) 0';
        }
        function verticalStyle(): string {
            return 'display:inline-block;width:0;border-left:' + borderStyle() + ';min-height:1em;margin:0 var(--pdx-space-sm,8px);vertical-align:middle';
        }
        // The host CE is inline by default: a horizontal <hr> (block) would have no width
        // context → width 0 (an invisible divider). This sets the host's display.
        effect(() => {
            ctx.el.style.display = ctx.orientation() === 'vertical' ? 'inline-block' : 'block';
        });
        return { leftLineStyle, rightLineStyle, hrStyle, verticalStyle, labelText, collecting };
    },
    // The separator is redrawn on the host, beside the slot: the host's late-children watcher leaves
    // it there, as a node its own template placed. Otherwise it would take a redrawn line for
    // late authored content and move it into the hidden holder — in Chromium, over and over, freezing
    // the page.
    render: (ctx) => html`<span data-divider-text hidden><slot></slot></span>${() => {
            if (ctx.orientation() === 'vertical') {
                return html`<div role="separator" aria-orientation="vertical" :style="${ctx.verticalStyle}"></div>`;
            }
            if (ctx.collecting()) return html``;
            const text = ctx.labelText();
            if (text) {
                return html`<div role="separator" style="display:flex;align-items:center;gap:var(--pdx-space-sm,8px);margin:var(--pdx-space-sm,8px) 0">
                    <span :style="${ctx.leftLineStyle}"></span>
                    <span style="font-size:var(--pdx-text-xs,0.75rem);color:var(--pdx-color-muted,#999)">${text}</span>
                    <span :style="${ctx.rightLineStyle}"></span>
                </div>`;
            }
            return html`<hr role="separator" :style="${ctx.hrStyle}" />`;
        }}`,
});
