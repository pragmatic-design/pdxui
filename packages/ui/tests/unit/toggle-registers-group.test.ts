// `@pdxui/ui/toggle` registers pdx-toggle-group as well as pdx-toggle (#1210, owner's decision).
//
// The two were one module, pdx-toggle.ts, and an app that imported the toggle had the group too. Moved
// to .pdx, the group has a folder and an export of its own, and the toggle imports it, so the entry an
// app already imports still registers both.
//
// This file is its own module graph: it imports nothing but the toggle's module and its package entry.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/toggle/pdx-toggle.pdx';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    exports: Record<string, { development?: string }>;
};

describe('the toggle\'s entry and the group', () => {
    it('importing the toggle registers both tags', () => {
        expect(customElements.get('pdx-toggle'), 'the toggle itself').toBeDefined();
        expect(customElements.get('pdx-toggle-group'), 'the group, through the toggle').toBeDefined();
    });

    it('`./toggle` is the toggle\'s module, and the group has its own entry', () => {
        expect(pkg.exports['./toggle']?.development).toBe('./src/toggle/pdx-toggle.pdx');
        expect(pkg.exports['./toggle-group']?.development).toBe('./src/toggle-group/pdx-toggle-group.pdx');
    });
});
