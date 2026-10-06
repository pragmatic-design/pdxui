// The committed catalogue is what the generator produces today.
//
// The root skill says to re-run `gen-catalog.mjs` after changing `@pdxui/ui` and commit the
// refreshed pages in the same PR. This checks that someone did. Both kinds of drift are possible:
// a component in the library and in the CEM that appears in **no** skill, and a prop documented with
// a stale default (`pdx-breadcrumb`'s `separator` as `'/'` when the real default is `''`, empty = use
// the theme's token). An agent reading a stale default writes code against a default that does not
// exist, and the failure looks like a framework bug.
//
// This regenerates into a temp directory — `--out`, added for exactly this — and diffs. It never
// touches the working tree.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { COPY_MARK, isTopic } from './skill-pages';

const SKILLS = join(__dirname, '../../../marketplace/plugins/pdxui/skills');
const GENERATOR = join(SKILLS, 'pdxui/tools/gen-catalog.mjs');
const TOPICS_GENERATOR = join(SKILLS, 'pdxui/tools/gen-topics.mjs');
const REPO = join(__dirname, '../../..');

/** Every generated file, relative to a skills root. Hand-curated pages are not generated. */
function generatedFiles(root: string): string[] {
    const out: string[] = [];
    for (const dir of readdirSync(root)) {
        if (!/^pdxui-[a-z0-9-]+$/.test(dir) || ['pdxui-language', 'pdxui-screens', 'pdxui-theme'].includes(dir)) continue;
        // A topic skill: its SKILL.md is written by hand, its references are the copies
        // of the site's docs that gen-topics.mjs writes.
        if (isTopic(dir, root)) {
            for (const f of readdirSync(join(root, dir, 'references'))) {
                if (f.endsWith('.md') && readFileSync(join(root, dir, 'references', f), 'utf-8').startsWith(COPY_MARK)) out.push(`${dir}/references/${f}`);
            }
            continue;
        }
        // Every other pdxui-* is an area the catalogue generator writes…
        out.push(`${dir}/SKILL.md`);
        // …and one page per component of the area.
        let pages: string[] = [];
        try { pages = readdirSync(join(root, dir, 'references')); } catch { /* none — the caller's diff will say so */ }
        for (const f of pages) if (f.endsWith('.md')) out.push(`${dir}/references/${f}`);
    }
    // The index and the component-strings table are generated into the general skill.
    for (const generated of ['pdxui/references/README.md', 'pdxui/references/component-strings.md']) {
        try {
            statSync(join(root, generated));
            out.push(generated);
        } catch { /* missing — the caller's diff will say so */ }
    }
    return out.sort();
}

describe('the component catalogue is in lockstep with the library', () => {
    it('regenerates to exactly what is committed', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'pdx-catalog-'));
        try {
            execFileSync(process.execPath, [GENERATOR, '--out', tmp, '--ui', REPO], { stdio: 'pipe' });
            execFileSync(process.execPath, [TOPICS_GENERATOR, '--out', tmp, '--ui', REPO], { stdio: 'pipe' });

            const fresh = generatedFiles(tmp);
            const committed = generatedFiles(SKILLS);
            expect(fresh.length, 'the generator produced nothing').toBeGreaterThan(5);
            expect(fresh, 'the generator emits a different set of files than the repo holds').toEqual(committed);

            const drifted: string[] = [];
            for (const rel of fresh) {
                const a = readFileSync(join(tmp, rel), 'utf-8').replace(/\r\n/g, '\n');
                const b = readFileSync(join(SKILLS, rel), 'utf-8').replace(/\r\n/g, '\n');
                if (a !== b) drifted.push(rel);
            }
            expect(
                drifted,
                'stale: re-run marketplace/plugins/pdxui/skills/pdxui/tools/gen-catalog.mjs and gen-topics.mjs, and commit the result',
            ).toEqual([]);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    }, 60_000);

    // Every component package: the router's two elements are known to the compiler and the editor,
    // and must be in a skill too.
    it('lists the router\'s elements in pdxui-navigation', () => {
        const skill = readFileSync(join(SKILLS, 'pdxui-navigation', 'SKILL.md'), 'utf-8').replace(/\r\n/g, '\n');
        for (const tag of ['pdx-router-outlet', 'pdx-link']) {
            expect(skill, tag).toContain(`[\`<${tag}>\`](references/${tag}.md)`);
            expect(statSync(join(SKILLS, 'pdxui-navigation', 'references', `${tag}.md`)).isFile(), tag).toBe(true);
        }
    });

    it('reads its notes from beside the script, not from the output root', () => {
        // ⚠️ With `--out <temp>`, a NOTES path derived from the output would find an empty folder,
        // every hand-written note would silently vanish from the regenerated pages, and this suite
        // would report drift on files nobody had touched. Notes are an input.
        const src = readFileSync(GENERATOR, 'utf-8');
        expect(src).toMatch(/const NOTES = join\(__dir, 'notes'\)/);
    });
});
