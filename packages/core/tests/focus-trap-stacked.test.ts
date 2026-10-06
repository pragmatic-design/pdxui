/**
 * Two focus traps at once: only the topmost is exposed to assistive technology.
 *
 * A trap hides the siblings of every ancestor of its container with aria-hidden, which is right for
 * one modal. A second trap BESIDE the first — a `dialog.confirm()` drawn by `<pdx-overlay-outlet>`
 * while a `pdx-dialog` is open — sits under an ancestor the first trap has hidden; unless the second
 * trap un-hides it, the confirm is on screen and focused, and a screen reader cannot find it
 * (`getByRole('alertdialog')` empty, aria-hidden on the outlet).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { focusTrap } from '../src/a11y/focus-trap';

/** The ancestors of `el` up to <body>, with aria-hidden="true". */
function hiddenAncestors(el: Element): string[] {
    const out: string[] = [];
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        if (n.getAttribute('aria-hidden') === 'true') out.push(n.id || n.tagName);
    }
    return out;
}

/** Every element's aria-hidden, by id — the whole page's state in one comparable value. */
function ariaState(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const el of Array.from(document.body.querySelectorAll('[id]'))) out[el.id] = el.getAttribute('aria-hidden');
    return out;
}

describe('focusTrap: stacked traps', () => {
    beforeEach(() => {
        // The shape of an app: a shell with a header, the routed page holding an open dialog, and the
        // outlet that draws dialog.confirm() beside it. The footer carries an aria-hidden of its own.
        document.body.innerHTML = `
            <header id="header"><button>Menu</button></header>
            <main id="page">
                <p id="intro">Text</p>
                <div id="dialog"><div id="dialog-panel"><button>Save</button><input id="title" /></div></div>
            </main>
            <div id="outlet"><div id="confirm-wrap"><div id="confirm-panel"><button>Stay</button><button>Leave</button></div></div></div>
            <footer id="footer" aria-hidden="false"><span id="decor" aria-hidden="true">~</span></footer>
        `;
    });

    afterEach(() => { document.body.innerHTML = ''; });

    it('control: one trap hides the siblings of every ancestor, not its own ancestors', () => {
        const dispose = focusTrap(document.getElementById('dialog-panel')!);
        expect(hiddenAncestors(document.getElementById('dialog-panel')!)).toEqual([]);
        expect(document.getElementById('intro')!.getAttribute('aria-hidden')).toBe('true');
        expect(document.getElementById('header')!.getAttribute('aria-hidden')).toBe('true');
        expect(document.getElementById('outlet')!.getAttribute('aria-hidden')).toBe('true');
        dispose();
    });

    it('a second trap beside the first is exposed, and the first one is hidden', () => {
        const disposeDialog = focusTrap(document.getElementById('dialog-panel')!);
        const disposeConfirm = focusTrap(document.getElementById('confirm-panel')!);

        expect(hiddenAncestors(document.getElementById('confirm-panel')!),
            'the confirm sits under an ancestor the first trap hid').toEqual([]);
        expect(document.getElementById('page')!.getAttribute('aria-hidden')).toBe('true');
        expect(document.getElementById('header')!.getAttribute('aria-hidden')).toBe('true');

        disposeConfirm();
        disposeDialog();
    });

    it('closing the second puts the first one back exactly, and closing both restores every original value', () => {
        const before = ariaState();
        const disposeDialog = focusTrap(document.getElementById('dialog-panel')!);
        const dialogOnly = ariaState();

        const disposeConfirm = focusTrap(document.getElementById('confirm-panel')!);
        disposeConfirm();
        expect(ariaState()).toEqual(dialogOnly);

        disposeDialog();
        // The footer's aria-hidden="false" and the decoration's "true" are the app's own, and stay.
        expect(ariaState()).toEqual(before);
    });

    it('the first trap closing before the second leaves the second exposed, then restores everything', () => {
        const before = ariaState();
        const disposeDialog = focusTrap(document.getElementById('dialog-panel')!);
        const disposeConfirm = focusTrap(document.getElementById('confirm-panel')!);

        disposeDialog();
        expect(hiddenAncestors(document.getElementById('confirm-panel')!)).toEqual([]);
        // Everything beside the confirm stays hidden, the header included: the first trap restoring
        // its own changes must not expose what the second one still needs hidden.
        for (const id of ['page', 'header', 'footer']) {
            expect(document.getElementById(id)!.getAttribute('aria-hidden'), id).toBe('true');
        }

        disposeConfirm();
        expect(ariaState()).toEqual(before);
    });

    it('a trap nested inside the first is exposed too, and hides the rest of the first', () => {
        const panel = document.getElementById('dialog-panel')!;
        panel.insertAdjacentHTML('beforeend', '<div id="inner"><button>Inner</button></div>');
        const disposeDialog = focusTrap(panel);
        const disposeInner = focusTrap(document.getElementById('inner')!);

        expect(hiddenAncestors(document.getElementById('inner')!)).toEqual([]);
        expect(document.getElementById('title')!.getAttribute('aria-hidden')).toBe('true');

        disposeInner();
        expect(document.getElementById('title')!.hasAttribute('aria-hidden')).toBe(false);
        disposeDialog();
    });

    it('disposing the same trap twice changes nothing the second time', () => {
        const before = ariaState();
        const disposeDialog = focusTrap(document.getElementById('dialog-panel')!);
        const disposeConfirm = focusTrap(document.getElementById('confirm-panel')!);
        disposeConfirm();
        const dialogOnly = ariaState();
        disposeConfirm();
        expect(ariaState()).toEqual(dialogOnly);
        disposeDialog();
        expect(ariaState()).toEqual(before);
    });
});
