// ComponentResolver.knownWithoutImport walks the sibling @pdxui packages once per resolver to find
// the tags that need no import (#771). That walk only ever collects `pdx-` tags — element selectors
// of the design system and `component('pdx-…')` / `define('pdx-…')` — so for any other tag it cannot
// change the answer, and must not be paid: an app with an unresolved `<app-…>` paid ~2,400 file
// reads for a `false` it knew already, and so did the test that checks the warning.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/no-import-tags', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/no-import-tags')>();
    return { scanNoImportTags: vi.fn(actual.scanNoImportTags) };
});

import { scanNoImportTags } from '../src/no-import-tags';
import { ComponentResolver } from '../src/component-resolver';

const scan = vi.mocked(scanNoImportTags);

beforeEach(() => { scan.mockClear(); });

describe('knownWithoutImport scans the sibling packages only for a tag the scan can find', () => {
    it('an unknown app- tag is not known, and walks nothing', () => {
        const r = new ComponentResolver();
        expect(r.knownWithoutImport('app-nowhere')).toBe(false);
        expect(r.knownWithoutImport('my-widget')).toBe(false);
        expect(scan).not.toHaveBeenCalled();
    });

    it('control — a pdx- tag another package defines is known, from one walk for the resolver', () => {
        const r = new ComponentResolver();
        expect(r.knownWithoutImport('pdx-router-outlet')).toBe(true);
        expect(r.knownWithoutImport('pdx-nowhere')).toBe(false);
        expect(scan).toHaveBeenCalledTimes(1);
    }, 60_000);
});
