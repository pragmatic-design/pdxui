// An `array` prop has to say an array of WHAT.
//
// A catalogue that describes `pdx-breadcrumb`'s items as "items · array · The data items to render"
// does not say that `BreadcrumbItem` also carries `href`: an agent that passes `[{ label }]` ships a
// breadcrumb on every screen that renders and does not navigate — no error, nothing to notice.
//
// The manifest carries `shapes`: the interfaces a component's module (and its folder siblings, if
// it names them) export. The catalogue prints them under the props table.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Shape = { name: string; fields: string[] };
type Decl = { tagName?: string; customElement?: boolean; shapes?: Shape[]; members?: { kind: string; name: string; type?: { text?: string } }[] };

const cem = JSON.parse(readFileSync(join(__dirname, '../../custom-elements.json'), 'utf-8')) as {
    modules: { declarations?: Decl[] }[];
};

const components = cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.customElement && d.tagName);

describe('the manifest says what an array prop holds', () => {
    it('has components to check', () => {
        expect(components.length).toBeGreaterThan(100);
    });

    it('carries shapes for the components whose module exports an interface', () => {
        const withShapes = components.filter((c) => (c.shapes?.length ?? 0) > 0);
        expect(withShapes.length, 'no shapes at all — the extractor is broken').toBeGreaterThan(15);
    });

    it('gives the breadcrumb the field the lab run could not find', () => {
        const bc = components.find((c) => c.tagName === 'pdx-breadcrumb');
        const item = bc?.shapes?.find((s) => s.name === 'BreadcrumbItem');
        expect(item, 'BreadcrumbItem is not in the manifest').toBeTruthy();
        expect(item!.fields.join(' '), 'href is the field that made the crumbs inert').toContain('href');
    });

    it('states each field with its own type, not just its name', () => {
        // `label` alone would be no better than `array`: a reader needs to know it is a string.
        for (const c of components) {
            for (const shape of c.shapes ?? []) {
                for (const f of shape.fields) {
                    expect(f, `${c.tagName} · ${shape.name} · ${f}`).toMatch(/:\s*\S/);
                }
            }
        }
    });

    it('picks up a sibling type the component names, and no others', () => {
        // `pdx-bulk-actions` declares BulkAction in its own file; `pdx-command` names CommandItem.
        // The filter matters: data-grid/ exports dozens of interfaces and a wall of unrelated types
        // is as unreadable as none at all.
        const bulk = components.find((c) => c.tagName === 'pdx-bulk-actions');
        expect(bulk?.shapes?.some((s) => s.name === 'BulkAction')).toBe(true);
        for (const c of components) {
            expect((c.shapes?.length ?? 0), `${c.tagName} lists too many shapes to read`).toBeLessThan(8);
        }
    });
});
