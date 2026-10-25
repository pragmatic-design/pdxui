// `pdx-pin-input` is removed: a masked PIN is `<pdx-otp-input mask>` (#286, decision 48). Nothing of it
// is left for a consumer to reach — no manifest entry, no export, no component string — and the
// otp-input's manifest entry says what `mask` now defaults.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { uiString } from '../../src/shared/i18n';

const root = join(__dirname, '..', '..');
type Attr = { name: string; default?: string; description?: string };
type Decl = { tagName?: string; attributes?: Attr[] };
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);
const exportsMap = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { exports: Record<string, unknown> }).exports;

describe('pdx-pin-input is removed', () => {
    it('has no manifest entry and no export', () => {
        expect(decls.map((d) => d.tagName)).toContain('pdx-otp-input');
        expect(decls.map((d) => d.tagName)).not.toContain('pdx-pin-input');
        expect(Object.keys(exportsMap)).toContain('./otp-input');
        expect(Object.keys(exportsMap)).not.toContain('./pin-input');
    });

    it('its label is otp-input.maskedLabel, and the pin-input strings are gone', () => {
        expect(uiString('otp-input', 'maskedLabel')).toBe('PIN');
        // An unknown key reads back as itself.
        expect(uiString('pin-input', 'label')).toBe('label');
    });

    it('the otp-input manifest says what mask defaults', () => {
        const attrs = decls.find((d) => d.tagName === 'pdx-otp-input')!.attributes!;
        const autocomplete = attrs.find((a) => a.name === 'autocomplete')!;
        const label = attrs.find((a) => a.name === 'label')!;
        expect(autocomplete.description).toMatch(/with `mask`, 'off'/);
        expect(label.description).toMatch(/maskedLabel/);
    });
});
