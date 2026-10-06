// An exposed getter is a read-only field, not a method.
//
// `ctx.expose({ get isOpen() { … } })` is a boolean. Listed as a member with `kind: 'method'`, the
// site prints it as `isOpen()`, and an agent that follows the documentation writes `el.isOpen()` and
// gets "el.isOpen is not a function". The scan must not make every key of the exposed object a method.
//
// The committed manifest is what the generator produces (gen-manifest-fresh.test.ts), so reading it
// checks the generator.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Member = { kind: string; name: string; readonly?: boolean; description?: string; attribute?: string };
type Decl = { tagName?: string; customElement?: boolean; members?: Member[] };

const cem = JSON.parse(readFileSync(join(__dirname, '../../custom-elements.json'), 'utf-8')) as {
    modules: { declarations?: Decl[] }[];
};
const components = cem.modules.flatMap(m => m.declarations ?? []).filter(d => d.customElement && d.tagName);
const member = (tag: string, name: string): Member | undefined =>
    components.find(c => c.tagName === tag)?.members?.find(m => m.name === name);

describe('exposed getters in the manifest', () => {
    it('pdx-rich-text: isEmpty and editor are read-only fields, setHTML is still a method', () => {
        expect(member('pdx-rich-text', 'isEmpty'), 'isEmpty').toMatchObject({ kind: 'field', readonly: true });
        expect(member('pdx-rich-text', 'editor'), 'editor').toMatchObject({ kind: 'field', readonly: true });
        expect(member('pdx-rich-text', 'setHTML'), 'the control: a real method stays a method').toMatchObject({ kind: 'method' });
    });

    it('no isOpen anywhere is documented as a method', () => {
        const isOpen = components.flatMap(c => (c.members ?? []).filter(m => m.name === 'isOpen').map(m => ({ tag: c.tagName, ...m })));
        expect(isOpen.length, 'no component exposes isOpen — the scan found nothing to check').toBeGreaterThanOrEqual(7);
        expect(isOpen.filter(m => m.kind === 'method').map(m => m.tag), 'isOpen() would throw: it is a boolean').toEqual([]);
    });

    it('a read-only field says how to read it, and is not an attribute', () => {
        const f = member('pdx-rich-text', 'isEmpty')!;
        expect(f.description).toMatch(/el\.isEmpty/);
        expect(f.description).not.toMatch(/isEmpty\(\)/);
        expect(f.attribute, 'a getter has no HTML attribute').toBeUndefined();
    });
});
