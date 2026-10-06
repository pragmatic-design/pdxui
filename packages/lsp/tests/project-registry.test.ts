// The editor resolves components per document, from the document's own project, with the
// compiler's resolver.
//
// One manifest from fixed paths under the folder the editor opened, and a scan of that whole folder
// for .pdx files, would get it wrong: opening packages/showcase instead of the repository root would
// leave every library tag unresolved; an app in apps/web/ below the folder would find nothing; two
// apps on different library versions would share one manifest; and a component outside src/ and
// pages/ would pass in the editor while the build never imports it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { ComponentResolver, parseSFC, parseTemplate, analyzeScript, validate } from '@pdxui/compiler';
import { ProjectRegistries, buildRegistry, projectRootOf } from '../src/utils/project-registry';

const REPO = join(__dirname, '..', '..', '..');
const SHOWCASE = join(REPO, 'packages', 'showcase');

let tmp: string;

function write(rel: string, content: unknown): void {
    const full = join(tmp, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
}

/** A fake @pdxui/ui under `at`, whose pdx-button has the variants given — so the test can tell which one was read. */
function fakeUi(at: string, variants: string[]): void {
    write(`${at}/package.json`, {
        name: '@pdxui/ui', version: '0.0.0', customElements: 'custom-elements.json',
        exports: { './button': './src/button.js' },
    });
    write(`${at}/custom-elements.json`, {
        modules: [{
            path: 'src/button.js',
            declarations: [{
                kind: 'class', customElement: true, tagName: 'pdx-button',
                attributes: [{ name: 'variant', type: { text: variants.map(v => `'${v}'`).join(' | ') } }],
                members: [{ kind: 'field', name: 'variant', type: { text: variants.map(v => `'${v}'`).join(' | ') } }],
            }],
        }],
    });
}

beforeAll(() => {
    tmp = join(tmpdir(), `pdx-lsp-registry-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    // A folder with two apps below it, on two different versions of the library, and nothing at
    // the top: pnpm puts each app's @pdxui/ui in that app's own node_modules.
    write('apps/web/package.json', { name: 'web', dependencies: { '@pdxui/ui': '1.0.0' } });
    fakeUi('apps/web/node_modules/@pdxui/ui', ['solid', 'ghost']);
    write('apps/web/src/page.pdx', '<template><pdx-button variant="solid"></pdx-button></template>\n');
    write('apps/admin/package.json', { name: 'admin', dependencies: { '@pdxui/ui': '2.0.0' } });
    fakeUi('apps/admin/node_modules/@pdxui/ui', ['outline', 'plain']);
    write('apps/admin/src/page.pdx', '<template><pdx-button variant="outline"></pdx-button></template>\n');
    // The scan rule: src/ and pages/, not the root or another folder.
    write('apps/web/src/widgets/user-card.pdx', '<template><div></div></template>\n');
    write('apps/web/pages/home.pdx', '<template><div></div></template>\n');
    write('apps/web/elsewhere/hidden.pdx', '<template><div></div></template>\n');
    write('apps/web/stray.pdx', '<template><div></div></template>\n');
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('the project a document belongs to', () => {
    it('is the nearest folder with a package.json, not the editor folder', () => {
        expect(projectRootOf(join(tmp, 'apps/web/src/page.pdx'), tmp)).toBe(join(tmp, 'apps', 'web'));
    });

    it('is the nearest folder with a vite.config when there is no package.json closer', () => {
        // The compiler's demo apps have a vite.config and no package.json: Vite runs from there.
        const demo = join(REPO, 'packages', 'compiler', 'demo', 'showcase-new');
        expect(projectRootOf(join(demo, 'pages', 'x.pdx'), REPO)).toBe(demo);
    });
});

describe('an app below the editor folder (apps/web)', () => {
    const registries = new ProjectRegistries();

    it('reads the library from the app\'s own node_modules', () => {
        const reg = registries.forFile(join(tmp, 'apps/web/src/page.pdx'), tmp);
        expect(reg.manifest.get('pdx-button')?.attributes.map(a => a.type)).toEqual(["'solid' | 'ghost'"]);
        expect(reg.resolver.enumValues('pdx-button', 'variant')).toEqual(['solid', 'ghost']);
    });

    it('and a second app reads its own version, not the first one\'s', () => {
        const reg = registries.forFile(join(tmp, 'apps/admin/src/page.pdx'), tmp);
        expect(reg.resolver.enumValues('pdx-button', 'variant')).toEqual(['outline', 'plain']);
    });
});

describe('one scan rule for the editor and the build', () => {
    it('registers the same project components as the compiler, for the same tree', () => {
        const root = join(tmp, 'apps', 'web');
        const compiler = new ComponentResolver();
        compiler.registerProjectComponents(root);
        const fromCompiler = compiler.tags.filter(t => compiler.resolve(t)?.source === 'project').sort();

        const editor = buildRegistry(root).components.map(c => c.tag).sort();

        expect(editor).toEqual(fromCompiler);
        expect(editor).toEqual(['pdx-home', 'pdx-page', 'pdx-user-card']);
    });
});

describe('packages/showcase opened on its own', () => {
    const registries = new ProjectRegistries();
    const reg = () => registries.forFile(join(SHOWCASE, 'src', 'asset-picker.pdx'), SHOWCASE);

    it('resolves the library tags its files use', () => {
        expect(reg().resolver.knownWithoutImport('pdx-relation-picker')).toBe(true);
        expect(reg().manifest.has('pdx-relation-picker')).toBe(true);
    });

    it('knows pdx-button\'s props', () => {
        expect(reg().manifest.get('pdx-button')?.attributes.map(a => a.name)).toContain('variant');
    });

    it('reports no <pdx-router-outlet> or <pdx-link> as unresolved, anywhere in it', () => {
        const unresolved: string[] = [];
        for (const file of pdxFilesUnder(join(SHOWCASE, 'src'))) {
            const source = readFileSync(file, 'utf-8');
            const descriptor = parseSFC(source);
            if (!descriptor.template) continue;
            const analysis = analyzeScript(descriptor.script?.content ?? '', file, { setup: descriptor.script?.setup });
            const r = registries.forFile(file, SHOWCASE);
            const found = validate(analysis, parseTemplate(descriptor.template.content), file, {
                isKnownTag: t => r.resolver.knownWithoutImport(t) || r.manifest.has(t),
            }).filter(w => w.code === 'PDX_UNRESOLVED_COMPONENT');
            unresolved.push(...found.map(w => `${file}: ${w.message}`));
        }
        expect(unresolved.filter(m => /pdx-router-outlet|pdx-link/.test(m))).toEqual([]);
        expect(unresolved, 'the showcase sweep found unresolved components').toEqual([]);
    });
});

function pdxFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...pdxFilesUnder(full));
        else if (name.endsWith('.pdx')) out.push(full);
    }
    return out;
}
