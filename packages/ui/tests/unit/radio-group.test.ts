import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/radio/pdx-radio';
import '../../src/radio-group/pdx-radio-group';

describe('pdx-radio-group', () => {
    beforeEach(cleanup);

    function createGroup(value = '') {
        const el = document.createElement('pdx-radio-group');
        if (value) el.setAttribute('value', value);
        el.innerHTML = `
            <pdx-radio value="x">X</pdx-radio>
            <pdx-radio value="y">Y</pdx-radio>
            <pdx-radio value="z">Z</pdx-radio>
        `;
        document.body.appendChild(el);
        return el;
    }

    it('renders with role="radiogroup"', async () => {
        const el = createGroup();
        await tick(50);
        expect(el.getAttribute('role')).toBe('radiogroup');
    });

    it('selects radio matching value prop', async () => {
        const el = createGroup('y');
        await tick(50);
        const radios = el.querySelectorAll('pdx-radio');
        expect(radios[0]?.hasAttribute('checked')).toBe(false);
        expect(radios[1]?.hasAttribute('checked')).toBe(true);
    });

    it('propagates name to all radios', async () => {
        const el = createGroup();
        el.setAttribute('name', 'color');
        await tick(50);

        const radios = el.querySelectorAll('pdx-radio');
        for (const r of radios) {
            expect(r.getAttribute('name')).toBe('color');
        }
    });

    it('name is applied from prop on mount', async () => {
        const el = document.createElement('pdx-radio-group');
        el.setAttribute('name', 'color');
        el.innerHTML = `
            <pdx-radio value="r">R</pdx-radio>
            <pdx-radio value="g">G</pdx-radio>
        `;
        document.body.appendChild(el);
        await tick(50);

        const radios = el.querySelectorAll('pdx-radio');
        for (const r of radios) {
            expect(r.getAttribute('name')).toBe('color');
        }
    });

    it('propagates and removes disabled', async () => {
        const el = createGroup();
        el.setAttribute('disabled', '');
        await tick(50);

        const radios = el.querySelectorAll('pdx-radio');
        for (const r of radios) expect(r.hasAttribute('disabled')).toBe(true);

        el.removeAttribute('disabled');
        (el as any).disabled = false;
        await tick(50);

        for (const r of radios) expect(r.hasAttribute('disabled')).toBe(false);
    });
});
