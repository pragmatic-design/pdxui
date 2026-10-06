// A component with a default slot, used WITHOUT children, must not swallow a copy of its host.
//
// The failure it guards against: opening a confirmation dialog makes
// `document.querySelectorAll('.page').length` go to 2, the second `.page` INSIDE
// `pdx-alert-dialog > .pdx-dialog-backdrop > .pdx-dialog-panel > .pdx-dialog-body` — a fresh render
// of the whole route, showing its loading branch because its signals restart from zero. No error in
// the console.
//
// `:message` and no children → 2 `.page`; `:message` AND a child → 1. So the factor is the EMPTY
// SLOT, not the prop — and 47 components in this package render a bare
// `<slot></slot>`, which is why this is asserted on the mechanism rather than on the dialog.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { component, html, signal } from '@pdxui/core';
import '../../src/alert-dialog/pdx-alert-dialog';

let hostCount = 0;

/** A container that renders a slotted component, with or without children of its own. */
function defineHost(tag: string, inner: string): void {
    component(tag, {
        setup() {
            const open = signal(true);
            return { open };
        },
        render: () => html`<div class="host-page"><p>host content</p>${html([inner] as unknown as TemplateStringsArray)}</div>`,
    });
}

describe('an empty default slot does not duplicate its host', () => {
    beforeEach(cleanup);

    it('renders one host when the slotted component HAS children', async () => {
        const tag = `host-with-child-${hostCount++}`;
        defineHost(tag, '<pdx-alert-dialog open title="t"><p>are you sure?</p></pdx-alert-dialog>');
        document.body.appendChild(document.createElement(tag));
        await tick(40);
        expect(document.querySelectorAll('.host-page').length, 'the control: with a child, one host').toBe(1);
    });

    it('renders one host when the slotted component has NONE', async () => {
        const tag = `host-no-child-${hostCount++}`;
        defineHost(tag, '<pdx-alert-dialog open title="t" message="are you sure?"></pdx-alert-dialog>');
        document.body.appendChild(document.createElement(tag));
        await tick(40);

        const hosts = document.querySelectorAll('.host-page');
        const insideDialog = document.querySelectorAll('pdx-alert-dialog .host-page');
        expect(insideDialog.length, 'the host must not be re-rendered inside the dialog it opened').toBe(0);
        expect(hosts.length, 'one host, not two').toBe(1);
    });
});
