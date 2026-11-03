// A pdx-form-field moved to another parent keeps its label tied to its control.
//
// A move disconnects and connects the field again, and its setup runs again with a new generated id.
// The control kept the id the field's first setup gave it, and the wiring gave an id only to a control
// with none: the label's `for` named the new id, the control carried the old one, and the control had
// no name. pdx-wizard moves its panels into its slot (pdx-form-template's wizard layout, #293).
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-field/pdx-form-field';

describe('pdx-form-field moved to another parent', () => {
    beforeEach(cleanup);

    it('names its control: the label\'s for is the control\'s id', async () => {
        const field = document.createElement('pdx-form-field');
        field.setAttribute('label', 'Name');
        const input = document.createElement('input');
        field.appendChild(input);
        const a = document.createElement('div');
        const b = document.createElement('div');
        document.body.append(a, b);
        a.appendChild(field);
        await tick(50);
        expect(field.querySelector('label')!.htmlFor, 'control: wired at first').toBe(input.id);

        b.appendChild(field);
        await tick(50);
        const label = field.querySelector('label')!;
        expect(input.id).not.toBe('');
        expect(label.htmlFor, 'the label names an id the control no longer has').toBe(input.id);
    });

    it('control: an id the author gave the control is kept', async () => {
        const field = document.createElement('pdx-form-field');
        field.setAttribute('label', 'Name');
        const input = document.createElement('input');
        input.id = 'author-id';
        field.appendChild(input);
        document.body.appendChild(field);
        await tick(50);
        const b = document.createElement('div');
        document.body.appendChild(b);
        b.appendChild(field);
        await tick(50);
        expect(input.id).toBe('author-id');
    });
});
