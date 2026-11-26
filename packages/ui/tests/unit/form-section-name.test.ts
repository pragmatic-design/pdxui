// pdx-form-section's `name` names its inner <fieldset> (#1271), as `name` does on native markup: the page
// reaches the section with `form.elements.namedItem(...)` or reads `fieldset.name`. Before, the prop was
// read by no code, and only a registry entry kept the scans that look for unread props green.
import { describe, it, expect, afterEach } from 'vitest';
import { tick, cleanup } from './helpers';
import '../../src/form-section/pdx-form-section.pdx';

afterEach(() => cleanup());

describe('pdx-form-section name', () => {
    it('is the name of its inner fieldset, which the form finds by it', async () => {
        const form = document.createElement('form');
        form.innerHTML = '<pdx-form-section name="contact" label="Contact"></pdx-form-section>';
        document.body.appendChild(form);
        await tick();
        const fieldset = form.querySelector('fieldset')!;
        expect(fieldset.name).toBe('contact');
        expect(form.elements.namedItem('contact')).toBe(fieldset);
    });

    it('follows a change of the prop', async () => {
        const section = document.createElement('pdx-form-section') as HTMLElement & { name: string };
        section.setAttribute('name', 'a');
        document.body.appendChild(section);
        await tick();
        section.name = 'b';
        await tick();
        expect(section.querySelector('fieldset')!.getAttribute('name')).toBe('b');
    });

    it('control: without a name the fieldset carries none', async () => {
        const section = document.createElement('pdx-form-section');
        document.body.appendChild(section);
        await tick();
        expect(section.querySelector('fieldset')!.hasAttribute('name')).toBe(false);
    });
});
