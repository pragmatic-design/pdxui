// A locale installed before the components are imported is what the user reads.
//
// That is the order the recipe prescribes. Each component module registers its English defaults
// when it is imported; registering into the same map as the translation would put the English back
// on import, and the keys of `pdx-transfer` and `pdx-tree-select` would look like "English strings no
// key can reach".
import { describe, it, expect, afterEach } from 'vitest';
import { setLocaleStrings, clearComponentStrings, getComponentString } from '@pdxui/core';
import { tick, cleanup } from './helpers';

afterEach(() => { cleanup(); clearComponentStrings(); });

describe('setLocaleStrings before the components are imported', () => {
    it('survives the import of pdx-tree-select and pdx-transfer', async () => {
        // Proof of the order: nothing has registered these defaults yet, so an unset key falls back
        // to the key itself. If another test had imported the modules first, this would read English
        // and the test would not be measuring the import.
        expect(getComponentString('tree-select', 'noMatch')(), 'pdx-tree-select was already imported — the order is not the one under test').toBe('noMatch');
        expect(getComponentString('transfer', 'noMatch')()).toBe('noMatch');

        setLocaleStrings({
            'tree-select': { placeholder: 'Seleziona...' },
            // The fixture stays ITALIAN on purpose: if these read English, the test could not tell a
            // translation that survived the import from the defaults the import registers.
            transfer: { source: 'Origine', target: 'Destinazione', moveRight: 'Sposta a destra' },
        });
        await import('../../src/tree-select/pdx-tree-select');
        await import('../../src/transfer/pdx-transfer');
        expect(getComponentString('tree-select', 'noMatch')(), 'the import did not register its defaults').toBe('No match');

        const host = document.createElement('div');
        host.innerHTML = '<pdx-tree-select></pdx-tree-select><pdx-transfer></pdx-transfer>';
        document.body.appendChild(host);
        await tick();

        const trigger = host.querySelector('pdx-tree-select [role="combobox"]');
        expect(trigger?.getAttribute('aria-label'), 'tree-select is back in English').toBe('Seleziona...');
        const transfer = host.querySelector('pdx-transfer')!;
        expect(transfer.textContent).toContain('Origine');
        expect(transfer.textContent).toContain('Destinazione');
        expect(transfer.textContent, 'transfer still shows its English panel title').not.toContain('Source');
        expect(transfer.querySelector('[aria-label="Sposta a destra"]'), 'the move button kept its English name').not.toBeNull();
    });
});
