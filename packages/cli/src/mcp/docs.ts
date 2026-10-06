// The `docs` tool: the sections of `llms-full.txt` that best match a query, with their URLs.
//
// `llms-full.txt` is what the site generator writes (site/scripts/gen-llms.mjs): an index of links,
// then every docs page and every component's API under `## ` headings. The CLI build copies it into
// `dist/`, so an installed CLI answers from the docs of its own version; in this repository it is
// read from the site's output.

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SITE = 'https://pdxui.com';
const MAX_HITS = 5;
const MAX_TEXT = 4000;

export interface DocsSection { title: string; url: string; text: string }

/**
 * The CLI package's folder and package.json, found by climbing from this module: it is
 * `src/mcp/` in this repository and `dist/` once built (bundled into `index.mjs`).
 */
export function findCliPackage(from = dirname(fileURLToPath(import.meta.url))): { dir: string; version: string; vite?: string } | null {
    let dir = from;
    for (let i = 0; i < 6; i++) {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            let pkg: { name?: string; version?: string; peerDependencies?: Record<string, string> } = {};
            try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as typeof pkg; } catch { pkg = {}; } // unreadable → keep climbing
            // `vite`: the range this CLI runs with, which a project it scaffolds asks for.
            if (pkg.name === '@pdxui/cli') return { dir, version: pkg.version ?? '0.0.0', vite: pkg.peerDependencies?.vite };
        }
        dir = dirname(dir);
    }
    return null;
}

/** Where `llms-full.txt` is: beside the built CLI, or the site's output in this repository. */
export function findDocsFile(): string | null {
    const cli = findCliPackage();
    if (!cli) return null;
    for (const candidate of [join(cli.dir, 'dist', 'llms-full.txt'), join(cli.dir, '..', 'site', 'public', 'llms-full.txt')]) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/** The file cut into its `## ` sections, each with the URL the index gives its title. */
export function readSections(text: string): DocsSection[] {
    // The index lines `- [Title](/docs/slug): …` say where each docs page lives.
    const urlOf = new Map<string, string>();
    for (const m of text.matchAll(/^- \[([^\]]+)\]\((\/[^)]*)\)/gm)) urlOf.set(m[1], SITE + m[2]);
    const sections: DocsSection[] = [];
    const parts = text.replace(/\r\n/g, '\n').split(/^## /m).slice(1);
    // A page's own headings are `## ` as well — the generator writes each page under `## Title` and
    // its body keeps its headings — so a heading the index does not name belongs to the page above.
    let page: { title: string; url: string } | null = null;
    for (const part of parts) {
        const nl = part.indexOf('\n');
        const title = (nl < 0 ? part : part.slice(0, nl)).trim();
        const body = nl < 0 ? '' : part.slice(nl + 1).trim();
        // The index's own headings (`## Docs`, `## Components`) are lists of links, not sections.
        if (title === 'Docs' || title === 'Components' || title === 'Instructions') continue;
        const indexed = urlOf.get(title);
        if (indexed) page = { title, url: indexed };
        const url = indexed ?? page?.url ?? `${SITE}/docs`;
        sections.push({ title: !indexed && page ? `${page.title} › ${title}` : title, url, text: body });
    }
    return sections;
}

/** The sections that best match every word of `query`: title hits weigh more than body hits. */
export function searchDocs(sections: DocsSection[], query: string): DocsSection[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return [];
    const scored = sections.map(s => {
        const title = s.title.toLowerCase();
        const body = s.text.toLowerCase();
        let score = 0;
        for (const w of words) {
            if (title.includes(w)) score += 5;
            score += body.split(w).length - 1;
        }
        return { s, score };
    }).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_HITS).map(({ s }) => ({
        ...s,
        text: s.text.length > MAX_TEXT ? `${s.text.slice(0, MAX_TEXT)}\n…` : s.text,
    }));
}
