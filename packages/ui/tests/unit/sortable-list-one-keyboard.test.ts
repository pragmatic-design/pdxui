// One list, one keyboard reorder.
//
// The keyboard interaction — Space to lift, arrows to move, announcements by position — lives in
// `useSortable`, and `<pdx-sortable-list>` has none of its own: two implementations of one thing
// drift apart, and only one of them gets tested.
//
// This file is the guard, because the way a second one comes back is somebody adding a `keydown`
// listener to the component — and nothing would fail: both paths work, so the row would simply
// lift twice and be announced twice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = join(dirname(fileURLToPath(import.meta.url)),
    '../../src/sortable-list/pdx-sortable-list.ts');

describe('the component and the composable are one implementation', () => {
    const src = readFileSync(SOURCE, 'utf8');

    it('read the component, not an empty file', () => {
        // Without this the assertions below pass on a path that has moved.
        expect(src.length).toBeGreaterThan(1000);
        expect(src, 'this is not the component').toContain("component('pdx-sortable-list'");
    });

    it('the component handles no keys of its own', () => {
        expect(src, 'a second keyboard reorder is back: two paths lift the same row twice')
            .not.toContain('keydown');
    });

    it('and it drives the composable\'s, rather than switching it off', () => {
        // The other direction. "No keydown here" is satisfied perfectly by a component with no
        // keyboard reorder at all, which is what `a11y: false` left behind.
        expect(src, 'the composable\'s keyboard path is switched off and nothing replaced it')
            .not.toContain('a11y: false');
        expect(src, 'the component no longer passes its own strings to the composable')
            .toContain('messages:');
    });
});
