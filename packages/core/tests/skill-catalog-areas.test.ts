// The component index is what an agent reads to decide which area skill to open. A component that
// sits outside every area is a component nobody opens: a catch-all skill's components go unread for
// an entire lab run.
//
// Dissolving such a skill by hand does not remove the cause: a catch-all area in `gen-catalog.mjs`
// with `tags: []` absorbs anything unmapped, and the next regeneration rebuilds it.
//
// These guards are on the GENERATED index (what the agent reads) and on the GENERATOR (the cause).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { areaText, isTopic } from './skill-pages';

const SKILLS = join(__dirname, '../../../marketplace/plugins/pdxui/skills');
const INDEX = join(SKILLS, 'pdxui/references/README.md');
const GENERATOR = join(SKILLS, 'pdxui/tools/gen-catalog.mjs');

/** The skills written by hand. Every other `pdxui-*` is an area the generator writes. */
const HAND_WRITTEN = new Set(['pdxui', 'pdxui-language', 'pdxui-screens', 'pdxui-theme']);
// A topic skill is not an area: its SKILL.md is hand-written and names no component.
const isArea = (dir: string) => /^pdxui-[a-z0-9-]+$/.test(dir) && !HAND_WRITTEN.has(dir) && !isTopic(dir);

/** Walks the index, attributing each component to the area heading above it. */
function indexEntries(): { tag: string; summary: string; area: string | null }[] {
    const out: { tag: string; summary: string; area: string | null }[] = [];
    let area: string | null = null;
    // CRLF normalised: a Windows checkout writes \r\n, and the `$`-anchored entry regex below then
    // matches no line.
    for (const line of readFileSync(INDEX, 'utf-8').replace(/\r\n/g, '\n').split('\n')) {
        const heading = /^##\s/.test(line);
        if (heading) {
            const withSkill = line.match(/^##\s+.+?\s+—\s+skill\s+`pdxui-([a-z]+)`/);
            area = withSkill ? withSkill[1] : null;
            continue;
        }
        const entry = line.match(/^-\s+`<(pdx-[a-z0-9-]+)>`\s*—\s*(.*)$/);
        if (entry) out.push({ tag: entry[1], summary: entry[2].trim(), area });
    }
    return out;
}

describe('the component index puts every component in an area an agent can open', () => {
    it('has entries at all (a parser that matches nothing proves nothing)', () => {
        expect(indexEntries().length).toBeGreaterThan(100);
    });

    it('leaves no component outside an area skill', () => {
        const orphans = indexEntries().filter((e) => e.area === null).map((e) => e.tag);
        expect(orphans).toEqual([]);
    });

    it('names an area skill that exists on disk', () => {
        const areas = [...new Set(indexEntries().map((e) => e.area))];
        const missing = areas.filter((a) => !existsSync(join(SKILLS, `pdxui-${a}`, 'SKILL.md')));
        expect(missing).toEqual([]);
    });

    it('gives every component a one-liner — an empty dash tells the reader nothing', () => {
        const blank = indexEntries().filter((e) => e.summary === '').map((e) => e.tag);
        expect(blank).toEqual([]);
    });

    it('keeps the seven composed components in the areas they were moved to', () => {
        const expected: Record<string, string> = {
            'pdx-page-header': 'layout',
            'pdx-edit-drawer': 'overlay',
            'pdx-relation-picker': 'overlay',
            'pdx-entity-grid': 'data',
            'pdx-bulk-actions': 'data',
            'pdx-json-editor': 'forms',
            'pdx-rich-text': 'inputs',
        };
        const byTag = new Map(indexEntries().map((e) => [e.tag, e.area]));
        for (const [tag, area] of Object.entries(expected)) expect(byTag.get(tag)).toBe(area);
    });

    it('has no area skill left over that the index never names', () => {
        const named = new Set(indexEntries().map((e) => `pdxui-${e.area}`));
        const onDisk = readdirSync(SKILLS).filter(isArea);
        expect(onDisk.length, 'no area skill on disk: the filter reads nothing').toBeGreaterThanOrEqual(8);
        expect(onDisk.filter((d) => !named.has(d))).toEqual([]);
    });
});

describe('hand-written notes survive a regeneration', () => {
    // What a props table cannot say — composition, a trap, the shape of the children — typed
    // straight into the generated SKILL.md is deleted by the next regeneration, as `pdx-app-layout`'s
    // four `data-region` names and their warning would be. Notes live in `tools/notes/<tag>.md` and
    // the generator composes them in; this asserts they arrive.
    const NOTES = join(SKILLS, 'pdxui/tools/notes');

    it('has notes to check (an empty folder would make this suite vacuous)', () => {
        expect(readdirSync(NOTES).filter((f) => f.endsWith('.md')).length).toBeGreaterThan(0);
    });

    it('puts every note into the area skill of its component', () => {
        const areaOf = new Map(indexEntries().map((e) => [e.tag, e.area]));
        for (const file of readdirSync(NOTES).filter((f) => f.endsWith('.md'))) {
            const tag = file.slice(0, -3);
            const area = areaOf.get(tag);
            expect(area, `${tag} has a note but is in no area`).toBeTruthy();
            // The component's page, which the area index links.
            const skill = areaText(area!);
            // First line of the note: enough to prove composition happened, stable across edits.
            const firstLine = readFileSync(join(NOTES, file), 'utf-8').replace(/\r\n/g, '\n').trim().split('\n')[0];
            expect(skill, `${tag}'s note is missing from pdxui-${area}`).toContain(firstLine);
        }
    });

    it('keeps the app-layout trap where a reader of the layout skill meets it', () => {
        const layout = areaText('layout');
        expect(layout).toContain('data-region');
        expect(layout).toContain('out of the grid **silently**');
        // The summary said "header, sidebar, content" — and there is no `sidebar` region.
        expect(layout).not.toContain('App shell: header, sidebar, content.');
    });
});

describe('the generator cannot silently invent a shelf', () => {
    // The comment above AREAS explains why the catch-all is gone, and quotes it. Matching the raw
    // file would flag that explanation — so read the CODE, with the line comments stripped.
    const code = () =>
        readFileSync(GENERATOR, 'utf-8')
            .split('\n')
            .filter((l) => !/^\s*\/\//.test(l))
            .join('\n');

    it('strips comments without stripping the code (or it would pass on an empty string)', () => {
        expect(code()).toMatch(/const AREAS = \[/);
    });

    it('has no catch-all area that absorbs unmapped components', () => {
        // A catch-all is an area declared with an empty tag list: everything unmapped lands there,
        // and the result is a skill whose name describes the shelf instead of the contents.
        expect(code()).not.toMatch(/tags:\s*\[\s*\]/);
    });

    it('fails loudly on an unmapped component instead of filing it away', () => {
        expect(code()).toMatch(/areaOf/);
        // Not a fallback such as `|| AREAS[AREAS.length - 1]` — the last area, by position.
        expect(code()).not.toMatch(/AREAS\[AREAS\.length - 1\]/);
        expect(code()).toMatch(/belongs to no area/);
    });
});
