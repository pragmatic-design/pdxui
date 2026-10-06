// Every named slot a component renders is in the manifest — and so in the skills.
//
// The manifest lists a slot only when the component declares it with `@slot` in its JSDoc. Slots
// are rendered two ways — literal `<slot name="…">`, and scoped slots read through
// `ctx.__slots['…']` — and both need the tag. The skills are generated from the manifest, so an
// undocumented slot does not exist for an agent: `pdx-drawer`'s `header` and `footer` are then found
// only by measuring the DOM, and `pdx-input`'s `prefix`/`suffix` and `pdx-list`'s `item`/`empty` are
// the ones an app reaches for first.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '..', '..');

function componentFiles(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) componentFiles(p, acc);
        else if (/^pdx-.*\.ts$/.test(e)) acc.push(p);
    }
    return acc;
}

/** Named slots the component in `text` renders: literal `<slot name="x">` and scoped `__slots['x']`. */
function renderedSlots(text: string): { tag: string | null; names: string[] } {
    const tag = (text.match(/component\('([\w-]+)'/) ?? [])[1] ?? null;
    const names = new Set<string>();
    for (const m of text.matchAll(/<slot\s+name="([\w-]+)"/g)) names.add(m[1]);
    for (const m of text.matchAll(/__slots\??\.?\[\s*'([\w-]+)'\s*\]/g)) names.add(m[1]);
    return { tag, names: [...names].sort() };
}

function documentedSlots(manifest: { modules?: { declarations?: { tagName?: string; slots?: { name: string }[] }[] }[] }): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const mod of manifest.modules ?? []) {
        for (const d of mod.declarations ?? []) {
            if (d.tagName) out.set(d.tagName, new Set((d.slots ?? []).map((s) => s.name)));
        }
    }
    return out;
}

function undocumented(sources: string[], documented: Map<string, Set<string>>): string[] {
    const gaps: string[] = [];
    for (const text of sources) {
        const { tag, names } = renderedSlots(text);
        if (!tag) continue;
        const docs = documented.get(tag) ?? new Set();
        for (const n of names) if (!docs.has(n)) gaps.push(`${tag}: ${n}`);
    }
    return gaps.sort();
}

describe('the scan can fail', () => {
    // Three planted shapes: a scan that returns [] passes the real assertion perfectly.
    const docs = new Map([['pdx-probe', new Set(['footer'])]]);

    it('sees an undocumented literal slot', () => {
        const src = "component('pdx-probe', { render: () => html`<slot name=\"header\"></slot>` })";
        expect(undocumented([src], docs)).toEqual(['pdx-probe: header']);
    });
    it('sees an undocumented scoped slot', () => {
        const src = "component('pdx-probe', { setup(ctx) { const s = (ctx as any).__slots?.['row']; } })";
        expect(undocumented([src], docs)).toEqual(['pdx-probe: row']);
    });
    it('does not accuse a documented slot', () => {
        const src = "component('pdx-probe', { render: () => html`<slot name=\"footer\"></slot>` })";
        expect(undocumented([src], docs)).toEqual([]);
    });
});

describe('every named slot @pdxui/ui renders is documented', () => {
    const files = componentFiles(join(UI, 'src'));
    const sources = files.map((f) => readFileSync(f, 'utf-8'));
    const documented = documentedSlots(JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf-8')));

    it('reached the components and found slots to check', () => {
        // Without this a wrong path or regex reports "all documented" for the best of reasons.
        expect(files.length).toBeGreaterThan(80);
        const withSlots = sources.filter((s) => renderedSlots(s).names.length > 0).length;
        expect(withSlots, 'found almost no named slots, which means the scan found almost nothing').toBeGreaterThan(20);
    });

    it('leaves no named slot undocumented', () => {
        expect(undocumented(sources, documented),
            'declare it with `@slot name - description` in the JSDoc above component(), then run '
            + 'node scripts/gen-manifest.mjs and the catalogue generator — never hand-edit either')
            .toEqual([]);
    });
});
