// pdx-field-group display="dialog": the dialog it opens goes away when the dialog closes itself.
//
// The group renders its pdx-dialog only while open, and learns of the close from the dialog: from
// `pdx-close` before #288, from `open-change` `{ value: false }` now. Listening to an event the dialog
// no longer sends would leave the group's open state true behind a closed dialog.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/field-group/pdx-field-group';

describe('pdx-field-group dialog — closing', () => {
    beforeEach(cleanup);

    it('the dialog\'s close button closes it, and the group renders it no more', async () => {
        const el = await mount('pdx-field-group', { label: 'Address', display: 'dialog' });
        await tick(20);
        (el.querySelector('button') as HTMLButtonElement).click();
        await tick(50);
        const dialog = el.querySelector('pdx-dialog');
        expect(dialog, 'the trigger opened no dialog').not.toBeNull();
        (dialog!.querySelector('.pdx-dialog-close') as HTMLElement).click();
        await tick(50);
        expect(el.querySelector('pdx-dialog')).toBeNull();
    });
});
