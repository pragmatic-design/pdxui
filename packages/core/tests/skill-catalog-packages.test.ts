// The catalogue is built from every component package, not from @pdxui/ui alone.
//
// Reading `packages/ui/custom-elements.json` and nothing else would leave a second package that
// ships custom elements — @pdxui/router, a third party's — in no skill, while the compiler and the
// editor know it. The generator takes its manifests from the same discovery, `componentPackages`,
// over the project it is given.
//
// A package outside the library has no entry in the generator's AREAS; it lands in the area its
// manifest's `category` names. A category that maps to no area still stops the generator, as an
// unmapped library component does: naming the area is a decision.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const GENERATOR = join(__dirname, '../../../marketplace/plugins/pdxui/skills/pdxui/tools/gen-catalog.mjs');
const REPO = join(__dirname, '../../..');

let tmp: string;
const write = (rel: string, content: unknown) => {
    const full = join(tmp, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
};

/** A project that depends on @acme/widgets, which ships `acme-crumbs` in the category given. */
function project(category: string): void {
    write('app/package.json', { name: 'app', dependencies: { '@acme/widgets': '1.0.0' } });
    write('app/node_modules/@acme/widgets/package.json', {
        name: '@acme/widgets', version: '1.0.0', customElements: 'custom-elements.json',
        exports: { './crumbs': './crumbs.js', './package.json': './package.json' },
    });
    write('app/node_modules/@acme/widgets/custom-elements.json', {
        schemaVersion: '1.0.0',
        modules: [{
            kind: 'javascript-module', path: 'crumbs.js',
            declarations: [{
                kind: 'class', customElement: true, name: 'AcmeCrumbs', tagName: 'acme-crumbs', category,
                order: 1, summary: 'A trail of links to the pages above this one.',
                members: [{ kind: 'field', name: 'separator', type: { text: 'string' }, attribute: 'separator' }],
            }],
        }],
    });
}

const generate = () => execFileSync(process.execPath, [GENERATOR, '--out', join(tmp, 'out'), '--ui', REPO, '--project', join(tmp, 'app')], { stdio: 'pipe' });

beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'pdx-catalog-pkg-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('the catalogue over a project\'s component packages', () => {
    it('lists a third package\'s element, in the area its category names, with its summary and props', () => {
        project('Navigation');
        generate();
        const skill = readFileSync(join(tmp, 'out', 'pdxui-navigation', 'SKILL.md'), 'utf-8').replace(/\r\n/g, '\n');
        expect(skill).toContain('[`<acme-crumbs>`](references/acme-crumbs.md) — A trail of links to the pages above this one.');
        const page = readFileSync(join(tmp, 'out', 'pdxui-navigation', 'references', 'acme-crumbs.md'), 'utf-8').replace(/\r\n/g, '\n');
        expect(page).toContain('| `separator` | `separator` | string |');
    });

    it('a category no area takes stops the generator, naming the tag', () => {
        project('Gadgets');
        let err = '';
        try { generate(); } catch (e) { err = String((e as { stderr?: Buffer }).stderr ?? e); }
        expect(err).toContain('acme-crumbs belongs to no area');
        expect(existsSync(join(tmp, 'out', 'pdxui-navigation', 'references', 'acme-crumbs.md'))).toBe(false);
    });
});
