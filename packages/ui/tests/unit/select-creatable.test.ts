import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getComponentString } from '@pdxui/core';
import '../../src/select/pdx-select';

function create(attrs: Record<string, string> = {}) {
    const el = document.createElement('pdx-select') as any;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}

async function tick() { await new Promise<void>(r => queueMicrotask(() => r())); }

describe('pdx-select creatable', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('renders without create option by default', async () => {
        const el = create({ searchable: '' });
        el.options = ['Apple', 'Banana'];
        await tick();
        const createEl = el.querySelector('.pdx-select-create');
        expect(createEl).toBeNull();
    });

    it('has creatable prop', async () => {
        const el = create({ creatable: '', searchable: '' });
        await tick();
        expect(el.creatable).toBe(true);
    });

    it('createLabel defaults to empty: the text comes from the select.create string', async () => {
        // An English default in the prop is where no locale could reach it.
        const el = create({ creatable: '', searchable: '' });
        await tick();
        expect(el.createLabel).toBe('');
        expect(getComponentString('select', 'create')()).toContain('{query}');
    });

    it('has custom createLabel via JS property', async () => {
        const el = create({ creatable: '', searchable: '' });
        el.createLabel = 'Add {query}';
        await tick();
        expect(el.createLabel).toBe('Add {query}');
    });
});
