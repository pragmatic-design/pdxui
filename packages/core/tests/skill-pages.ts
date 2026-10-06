// What an agent reads for one area: the area's SKILL.md, which is an index, and the page of each of
// its components, `references/<tag>.md`. The guards that read a component's entry read this: each page
// starts with the component's `### \`<tag>\`` heading, so the entry parsers see the text of one
// entry as if every entry sat in one file.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const SKILLS = join(__dirname, '..', '..', '..', 'marketplace', 'plugins', 'pdxui', 'skills');
export const AREAS = ['data', 'display', 'forms', 'infra', 'inputs', 'layout', 'navigation', 'overlay'];

// Normalised: a Windows checkout writes these pages with CRLF, and a reader that anchors on a bare
// newline then matches nothing.
const read = (file: string) => readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');

/** The first line of a reference copied from the site's docs by gen-topics.mjs. */
export const COPY_MARK = '<!-- Copied from ';

/** A topic skill: its SKILL.md is written by hand, its references are copies of the site's docs. */
export function isTopic(dir: string, root = SKILLS): boolean {
    const refs = join(root, dir, 'references');
    return existsSync(refs) && readdirSync(refs).some(f => f.endsWith('.md') && read(join(refs, f)).startsWith(COPY_MARK));
}

/** The component pages of one area, sorted by file name. */
export function componentPages(area: string): { tag: string; text: string }[] {
    const dir = join(SKILLS, `pdxui-${area}`, 'references');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(f => f.endsWith('.md')).sort()
        .map(f => ({ tag: f.slice(0, -3), text: read(join(dir, f)) }));
}

/** The area index followed by every component page of the area, as one text. */
export function areaText(area: string): string {
    return [read(join(SKILLS, `pdxui-${area}`, 'SKILL.md')), ...componentPages(area).map(p => p.text)].join('\n\n');
}
