import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../../src/autocomplete/pdx-autocomplete';

function create(attrs: Record<string, string> = {}) {
    const el = document.createElement('pdx-autocomplete') as any;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}

async function tick() { await new Promise<void>(r => queueMicrotask(() => r())); }

describe('pdx-autocomplete', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('renders input with combobox role', async () => {
        const el = create({ placeholder: 'Search...' });
        await tick();
        const input = el.querySelector('input[role="combobox"]');
        expect(input).toBeTruthy();
        expect(input?.getAttribute('placeholder')).toBe('Search...');
    });

    it('the name is the host\'s: it submits, and no inner input is named', async () => {
        const el = create({ name: 'city' });
        await tick();
        expect(el.getAttribute('name')).toBe('city');
        expect(el.querySelectorAll('[name]')).toHaveLength(0);
    });

    it('sets aria-expanded to false initially', async () => {
        const el = create();
        await tick();
        const input = el.querySelector('input[role="combobox"]');
        expect(input?.getAttribute('aria-expanded')).toBe('false');
    });

    it('has aria-haspopup="listbox"', async () => {
        const el = create();
        await tick();
        const input = el.querySelector('input[role="combobox"]');
        expect(input?.getAttribute('aria-haspopup')).toBe('listbox');
    });

    it('has aria-autocomplete="list"', async () => {
        const el = create();
        await tick();
        const input = el.querySelector('input[role="combobox"]');
        expect(input?.getAttribute('aria-autocomplete')).toBe('list');
    });

    it('applies disabled state', async () => {
        const el = create({ disabled: '' });
        await tick();
        const wrap = el.querySelector('.pdx-autocomplete');
        expect(wrap?.classList.contains('disabled')).toBe(true);
    });

    it('exposes open/close/clear API', async () => {
        const el = create();
        await tick();
        expect(typeof el.open).toBe('function');
        expect(typeof el.close).toBe('function');
        expect(typeof el.clear).toBe('function');
    });
});
