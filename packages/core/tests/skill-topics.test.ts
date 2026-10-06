// The topic skills: what no component page covers, with the site's docs as their references.
//
// Deploy and production build, lazy routes and keepAlive, permissions, testing, cross-field
// validation: the site documents them and no component page does. Each topic skill is a short SKILL.md written
// by hand, and references copied from packages/site/content/docs by gen-topics.mjs — the lockstep
// suite holds the copies to their pages. This holds the rest: every topic exists, links every page it
// carries, the links inside the copies go somewhere, and the hub names every topic.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { SKILLS, COPY_MARK, isTopic } from './skill-pages';

const read = (file: string) => readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
const EXPECTED = ['pdxui-data-layer', 'pdxui-i18n', 'pdxui-routing', 'pdxui-setup', 'pdxui-testing', 'pdxui-validation'];
const topics = readdirSync(SKILLS).filter(d => isTopic(d)).sort();
const copies = (topic: string) => readdirSync(join(SKILLS, topic, 'references'))
    .filter(f => f.endsWith('.md') && read(join(SKILLS, topic, 'references', f)).startsWith(COPY_MARK));

/** Markdown link targets outside code fences. */
function links(text: string): string[] {
    const prose = text.split(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/m).join('\n');
    return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]);
}

describe('the topic skills', () => {
    it('are the six decided on', () => {
        expect(topics).toEqual(EXPECTED);
    });

    it('each has its SKILL.md, and it links every page it carries', () => {
        const missing: string[] = [];
        for (const t of topics) {
            const skill = join(SKILLS, t, 'SKILL.md');
            if (!existsSync(skill)) { missing.push(`${t}: no SKILL.md`); continue; }
            const text = read(skill);
            for (const f of copies(t)) if (!text.includes(`](references/${f})`)) missing.push(`${t}: ${f}`);
        }
        expect(missing).toEqual([]);
    });

    it('each copy is its docs page, with the site\'s root-relative links pointed somewhere', () => {
        const broken: string[] = [];
        for (const t of topics) {
            for (const f of copies(t)) {
                const file = join(SKILLS, t, 'references', f);
                expect(existsSync(join(SKILLS, '..', '..', '..', '..', 'packages', 'site', 'content', 'docs', f)), `${t}/${f} copies no docs page`).toBe(true);
                for (const href of links(read(file))) {
                    if (href.startsWith('/')) broken.push(`${t}/${f}: ${href} is the site's path, not a link a skill reader can follow`);
                    else if (!/^(https?:|#|mailto:)/.test(href)) {
                        const target = normalize(join(dirname(file), href.split('#')[0]));
                        if (!existsSync(target)) broken.push(`${t}/${f}: ${href} resolves to nothing`);
                    }
                }
            }
        }
        expect(broken).toEqual([]);
    });

    it('the SKILL.md links resolve too', () => {
        const broken: string[] = [];
        for (const t of topics) {
            const file = join(SKILLS, t, 'SKILL.md');
            for (const href of links(read(file))) {
                if (/^(https?:|#)/.test(href)) continue;
                if (!existsSync(normalize(join(dirname(file), href.split('#')[0])))) broken.push(`${t}: ${href}`);
            }
        }
        expect(broken).toEqual([]);
    });

    it('the hub skill names every topic', () => {
        const hub = read(join(SKILLS, 'pdxui', 'SKILL.md'));
        expect(topics.filter(t => !hub.includes(`\`${t}\``))).toEqual([]);
    });
});
