// ComponentResolver.knownWithoutImport answers which `pdx-` tags need no import: element selectors of
// the design system and `component('pdx-…')` / `define('pdx-…')` in another @pdxui package (#771).
//
// It used to find them by walking the sibling packages' sources: 1,687 files and 9.9 MB read
// synchronously, 0.5 s alone and over 5 s under the gate's load. Every test whose control rendered a
// pdx- tag paid it, and three of them timed the gate out (#716, #991). The answer is fixed by the
// sources of a release, so it is generated once (`scripts/gen-no-import-tags.mjs`, held to the
// sources by no-import-tags-generated.test.ts) and the resolver reads the list: it walks nothing.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/no-import-tags', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/no-import-tags')>();
    return { scanNoImportTags: vi.fn(actual.scanNoImportTags) };
});

import { scanNoImportTags } from '../src/no-import-tags';
import { ComponentResolver } from '../src/component-resolver';

const scan = vi.mocked(scanNoImportTags);

beforeEach(() => { scan.mockClear(); });

describe('knownWithoutImport reads the generated list, and walks nothing', () => {
    it('a pdx- tag another package defines is known, and nothing is walked', () => {
        const r = new ComponentResolver();
        expect(r.knownWithoutImport('pdx-router-outlet')).toBe(true);
        expect(r.knownWithoutImport('pdx-nowhere')).toBe(false);
        expect(scan).not.toHaveBeenCalled();
    });

    it('an unknown app- tag is not known, and nothing is walked', () => {
        const r = new ComponentResolver();
        expect(r.knownWithoutImport('app-nowhere')).toBe(false);
        expect(r.knownWithoutImport('my-widget')).toBe(false);
        expect(scan).not.toHaveBeenCalled();
    });

    it('answers in the case it was asked', () => {
        expect(new ComponentResolver().knownWithoutImport('PDX-Router-Outlet')).toBe(true);
    });
});
