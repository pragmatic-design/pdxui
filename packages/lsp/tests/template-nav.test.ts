// Type- and scope-aware navigation/completion in template expressions.

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile, pdxToVirtual } from '../src/utils/virtual-file';
import { tsCompletions, tsDefinition } from '../src/capabilities/ts-features';

const ROOT = join(__dirname, '..', '..', '..');
const URI = 'file:///' + join(ROOT, 'x.pdx').split('\\').join('/');
const svc = new PdxTsService(ROOT);

const SRC = [
    '<template>',
    '  <div>{{ user.name }}</div>',
    '  @for (rows as row; track row.id) { <span>{{ row.label }}</span> }',
    '  <button @click="ctrl.del()">x</button>',
    '</template>',
    '<script setup>',
    "@prop user: { name: string } = { name: '' };",
    'let rows = $signal<{ id: number; label: string }[]>([]);',
    'const ctrl = { del() { return 1; } };',
    '</script>',
].join('\n');

function vfFor(src: string) {
    const { descriptor, ast } = analyzeDocument(src, 'x.pdx');
    const tmpl = descriptor!.template!.content;
    return buildVirtualFile(descriptor!.script!.content, descriptor!.script!.start, ast, tmpl, src.indexOf(tmpl));
}
function completeAt(src: string, marker: string, after: string) {
    const vf = vfFor(src);
    const pdxOff = src.indexOf(marker) + after.length;
    const v = pdxToVirtual(vf, pdxOff);
    return { v, labels: v < 0 ? [] : tsCompletions(svc, URI, vf, v).map(i => i.label) };
}

describe('template navigation (Volar-style)', () => {
    // The TypeScript language service's cold start (lib files, the first program) is paid here, with
    // a timeout of its own. Paid by the first `it`, it runs against vitest's 5s default: under the
    // gate's parallel load that test takes over 5s and fails with no assertion failing.
    beforeAll(() => { completeAt(SRC, '{{ user.', '{{ user.'); }, 60_000);

    it('completes the members of a typed prop in {{ }}', () => {
        const { v, labels } = completeAt(SRC, '{{ user.', '{{ user.');
        expect(v).toBeGreaterThanOrEqual(0); // a position mapped into the projection
        expect(labels).toContain('name');
    });

    it('completes the members of an @for loop var (scope-aware, the element type)', () => {
        const { labels } = completeAt(SRC, '{{ row.', '{{ row.');
        expect(labels).toContain('label');
        expect(labels).toContain('id');
    });

    it('go-to-definition on an object method inside a template @click handler', () => {
        const vf = vfFor(SRC);
        const pdxOff = SRC.indexOf('ctrl.del()') + 'ctrl.'.length; // on `del`
        const v = pdxToVirtual(vf, pdxOff);
        expect(v).toBeGreaterThanOrEqual(0);
        const locs = tsDefinition(svc, URI, vf, v, SRC);
        expect(locs.length).toBeGreaterThan(0);
    });
});
