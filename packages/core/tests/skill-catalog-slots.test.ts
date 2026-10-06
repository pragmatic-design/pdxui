// The skills name every slot the manifest documents.
//
// Documenting a slot in the manifest is not enough: the skills are what an agent reads, so a slot
// the manifest knows about and `gen-catalog.mjs` does not print does not exist for it — the agent
// finds `pdx-drawer`'s `header` and `footer` only by measuring the rendered DOM.
//
// Checked on the GENERATED skills — what the agent reads — against the manifest they are built from.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS, areaText } from './skill-pages';

const MANIFEST = join(__dirname, '../../ui/custom-elements.json');

/** Every named slot the manifest documents, per tag. */
function manifestSlots(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const m = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
    for (const mod of m.modules ?? []) {
        for (const d of mod.declarations ?? []) {
            const named = (d.slots ?? []).map((s: { name: string }) => s.name).filter(Boolean);
            if (d.tagName && named.length) out.set(d.tagName, named);
        }
    }
    return out;
}

/** The catalogue entry of each component, across every area skill: from its heading to the next. */
function catalogueEntries(): Map<string, string> {
    const out = new Map<string, string>();
    // The area skills, each with its component pages.
    for (const area of AREAS) {
        const text = areaText(area);
        const parts = text.split(/^### `<(pdx-[a-z0-9-]+)>`/m);
        for (let i = 1; i < parts.length; i += 2) out.set(parts[i], parts[i + 1]);
    }
    return out;
}

describe('the catalogue names every documented slot', () => {
    const slots = manifestSlots();
    const entries = catalogueEntries();

    it('found documented slots and catalogue entries to compare', () => {
        expect(slots.size, 'the manifest documents almost no slots — the comparison would be vacuous').toBeGreaterThan(20);
        expect(entries.size).toBeGreaterThan(100);
    });

    it('lists each slot under its component', () => {
        const missing: string[] = [];
        for (const [tag, names] of slots) {
            const entry = entries.get(tag) ?? '';
            const slotLine = entry.split('\n').find((l) => l.startsWith('**Slot:**')) ?? '';
            for (const n of names) if (!slotLine.includes('`' + n + '`')) missing.push(`${tag}: ${n}`);
        }
        expect(missing, 'the manifest documents these and the skill an agent reads does not show them').toEqual([]);
    });

    it('the drawer, which is how this was found', () => {
        const entry = entries.get('pdx-drawer') ?? '';
        expect(entry).toMatch(/\*\*Slot:\*\*.*`header`/);
        expect(entry).toMatch(/\*\*Slot:\*\*.*`footer`/);
    });
});
