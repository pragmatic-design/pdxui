// The tags that need no import are generated (#991): src/no-import-tags.generated.ts, written by
// scripts/gen-no-import-tags.mjs from the sibling packages' sources. A generated file drifts when a
// package adds or drops a tag and nobody runs the generator; this holds it to a fresh walk, as
// `gen-no-import-tags.mjs --check` does. The walk is this test's alone: 0.5 s, more under load.
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { scanNoImportTags } from '../src/no-import-tags';
import { NO_IMPORT_TAGS } from '../src/no-import-tags.generated';

describe('the generated list of tags that need no import', () => {
    it('is the walk of the sibling packages, sorted', () => {
        const walked = [...scanNoImportTags(join(__dirname, '..', 'src'))].sort();
        expect(walked.length, 'the walk found nothing: the comparison would pass on two empty lists').toBeGreaterThan(50);
        expect([...NO_IMPORT_TAGS]).toEqual(walked);
    }, 60_000);

    it('holds the tags the resolver is asked about most: the router\'s, and the design system\'s', () => {
        expect(NO_IMPORT_TAGS).toContain('pdx-router-outlet');
        expect(NO_IMPORT_TAGS).toContain('pdx-link');
    });
});
