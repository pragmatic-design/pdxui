import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/checkbox/pdx-checkbox';
import '../../src/checkbox-group/pdx-checkbox-group';

describe('pdx-checkbox-group', () => {
    beforeEach(cleanup);

    function createGroup(value = '') {
        const el = document.createElement('pdx-checkbox-group');
        if (value) el.setAttribute('value', value);
        el.innerHTML = `
            <pdx-checkbox value="a">A</pdx-checkbox>
            <pdx-checkbox value="b">B</pdx-checkbox>
            <pdx-checkbox value="c">C</pdx-checkbox>
        `;
        document.body.appendChild(el);
        return el;
    }

    it('renders with role="group"', async () => {
        const el = createGroup();
        await tick(50);
        expect(el.getAttribute('role')).toBe('group');
    });

    it('selects checkboxes matching value prop', async () => {
        const el = createGroup('a,c');
        await tick(50);
        const checkboxes = el.querySelectorAll('pdx-checkbox');
        expect(checkboxes[0]?.hasAttribute('checked')).toBe(true);
        expect(checkboxes[1]?.hasAttribute('checked')).toBe(false);
        expect(checkboxes[2]?.hasAttribute('checked')).toBe(true);
    });

    it('value="" clears all selections', async () => {
        const el = createGroup('a,b');
        await tick(50);

        (el as any).value = '';
        await tick(50);

        const checkboxes = el.querySelectorAll('pdx-checkbox');
        for (const cb of checkboxes) {
            expect(cb.hasAttribute('checked')).toBe(false);
        }
    });

    it('propagates disabled to children', async () => {
        const el = createGroup();
        el.setAttribute('disabled', '');
        await tick(50);

        const checkboxes = el.querySelectorAll('pdx-checkbox');
        for (const cb of checkboxes) {
            expect(cb.hasAttribute('disabled')).toBe(true);
        }
    });

    it('removes disabled from children when prop cleared', async () => {
        const el = createGroup();
        el.setAttribute('disabled', '');
        await tick(50);

        el.removeAttribute('disabled');
        (el as any).disabled = false;
        await tick(50);

        const checkboxes = el.querySelectorAll('pdx-checkbox');
        for (const cb of checkboxes) {
            expect(cb.hasAttribute('disabled')).toBe(false);
        }
    });
});
