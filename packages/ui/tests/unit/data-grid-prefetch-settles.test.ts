// A grid's idle prefetch does not outlive the test file that mounted it (#603).
//
// An editable grid asks for its six editors once the browser is idle (shared/lazy-tags.ts). Nobody
// awaits those imports, so a file that mounts a grid and ends at once tore its environment down
// while they were still loading, and Vitest failed the run with an EnvironmentTeardownError.
//
// Its own module graph: nothing else in this file loads the editors.

import { describe, it, expect } from 'vitest';

await import('../../src/data-grid/pdx-data-grid');

type Grid = HTMLElement & { columns: unknown; data: unknown; editable: boolean; whenReady(): Promise<void> };

describe("a grid's idle prefetch", () => {
    it('is still loading when the test that mounted the grid ends', async () => {
        const el = document.createElement('pdx-data-grid') as Grid;
        Object.assign(el, { columns: [{ field: 'name', header: 'Name' }], data: [{ id: 1, name: 'Ada' }], editable: true });
        document.body.appendChild(el);
        await el.whenReady();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(customElements.get('pdx-date-picker'), 'the prefetch had already finished').toBeUndefined();
    });
});
