// Closing the top of two outlet dialogs puts focus in the one left, not behind it.
//
// Each dialog's focus trap records, at creation, what had focus as the place to return to. When the
// top dialog is created while focus is not yet inside the one under it — two dialogs opened in the
// same tick, under load — that return target is the page, behind the modal still open, so the close
// cannot rely on it alone.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import { dialog } from '../../src/dialog/dialog-service';
import '../../src/overlay/pdx-overlay-outlet';

const panelOf = (title: string) =>
    [...document.querySelectorAll<HTMLElement>('[data-dialog-id] .pdx-dialog-panel')].find(p => p.getAttribute('aria-label') === title)!;

describe('stacked outlet dialogs', () => {
    let trigger: HTMLButtonElement;
    beforeEach(async () => {
        cleanup();
        await mount('pdx-overlay-outlet');
        trigger = document.createElement('button');
        trigger.textContent = 'Open';
        document.body.appendChild(trigger);
        trigger.focus();
    });
    afterEach(() => dialog.closeAll());

    it('closing the top dialog focuses the dialog under it, even when the top recorded the page as its return', async () => {
        dialog.open({ title: 'Settings' });
        await tick(20);
        expect(panelOf('Settings').contains(document.activeElement)).toBe(true);
        // The race, made deterministic: focus is outside Settings when the confirm's trap is created.
        trigger.focus();
        const answer = dialog.confirm({ title: 'Reset?' });
        await tick(20);
        expect(panelOf('Reset?').contains(document.activeElement)).toBe(true);

        (panelOf('Reset?').querySelector('.pdx-alert-cancel') as HTMLButtonElement).click();
        expect(await answer).toBe(false);
        await tick(20);
        expect(panelOf('Settings').contains(document.activeElement)).toBe(true);
        expect(document.activeElement?.classList.contains('pdx-dialog-close')).toBe(true);
    });

    it('it goes back to what had focus in that dialog', async () => {
        dialog.open({ title: 'Form', message: 'x' });
        await tick(20);
        // A second focusable in the dialog below, focused before the top opens.
        const extra = document.createElement('button');
        extra.textContent = 'Extra';
        panelOf('Form').querySelector('.pdx-dialog-body')!.appendChild(extra);
        extra.focus();
        dialog.alert({ title: 'Heads up' });
        await tick(20);
        (panelOf('Heads up').querySelector('.pdx-alert-ok') as HTMLButtonElement).click();
        await tick(20);
        expect(document.activeElement).toBe(extra);
    });

    it('closing the last dialog returns focus to what opened the first', async () => {
        dialog.open({ title: 'Only' });
        await tick(20);
        (panelOf('Only').querySelector('.pdx-dialog-close') as HTMLButtonElement).click();
        await tick(20);
        expect(document.activeElement).toBe(trigger);
    });

    it('closeAll from code also leaves focus on the page trigger', async () => {
        dialog.open({ title: 'A' });
        dialog.confirm({ title: 'B' });
        await tick(20);
        dialog.closeAll();
        await tick(20);
        expect(document.activeElement).toBe(trigger);
    });
});

// A dialog draws, traps and takes its first focus a frame after it opens, and the focus lands on a
// timer after that. Closing it inside that window must stop both: left running, the timer puts focus
// in the dialog that is leaving, and the frame opens a trap nothing will dispose, which hides the
// dialog still open from screen readers. Frames are faked here so the window can be entered on
// purpose; timers stay real.
describe('a dialog closed before its first focus', () => {
    beforeEach(async () => {
        cleanup();
        await mount('pdx-overlay-outlet');
        const trigger = document.createElement('button');
        trigger.textContent = 'Open';
        document.body.appendChild(trigger);
        trigger.focus();
        vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    });
    afterEach(() => {
        vi.useRealTimers();
        dialog.closeAll();
    });

    const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const timers = () => new Promise(r => setTimeout(r, 20));
    const focused = () => document.activeElement?.outerHTML.slice(0, 80) ?? 'nothing';

    it('Escape after the first frame, before the focus timer: focus stays in the dialog left open', async () => {
        dialog.open({ title: 'Settings' });
        const answer = dialog.confirm({ title: 'Reset?' });
        vi.advanceTimersToNextFrame();
        escape();
        expect(await answer).toBe(false);
        await timers();
        expect(document.activeElement?.classList.contains('pdx-dialog-close'), focused()).toBe(true);
        expect(panelOf('Settings').contains(document.activeElement)).toBe(true);
    });

    it('closed before its first frame: it takes no focus, does not open, and hides nothing', async () => {
        dialog.open({ title: 'Settings' });
        const answer = dialog.confirm({ title: 'Reset?' });
        escape();
        expect(await answer).toBe(false);
        vi.advanceTimersToNextFrame();
        await timers();
        expect(panelOf('Settings').contains(document.activeElement), focused()).toBe(true);
        expect(panelOf('Reset?').parentElement!.hasAttribute('data-open')).toBe(false);
        expect(panelOf('Settings').closest('[aria-hidden="true"]')).toBeNull();
    });
});
