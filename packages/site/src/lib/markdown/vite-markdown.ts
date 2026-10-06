// Vite plugin: compiles `*.md` → a JS module exporting { frontmatter, html, headings, slug }.
// Rendered at BUILD time (markdown-it + Shiki) → no markdown-it/Shiki in the client bundle.
// The docs pages import the .md files through import.meta.glob and index them by slug.

import type { Plugin } from 'vite';
import MarkdownIt from 'markdown-it';
import { createHighlighter, type Highlighter } from 'shiki';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/** Loads the .pdx TextMate grammar (shared with VS Code) for accurate PDX highlighting.
 *  Returns the grammar object with name='pdx', or null (→ falls back to 'ts'). */
function loadPdxGrammar() {
    const candidates = [
        resolve(process.cwd(), '../vscode-pdx/syntaxes/pdx.tmLanguage.json'),
        resolve(process.cwd(), 'packages/vscode-pdx/syntaxes/pdx.tmLanguage.json'),
    ];
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        candidates.unshift(resolve(here, '../../../../vscode-pdx/syntaxes/pdx.tmLanguage.json'));
    } catch { /* import.meta is not available after bundling: use the cwd candidates */ }
    for (const p of candidates) {
        try {
            const g = JSON.parse(readFileSync(p, 'utf-8'));
            g.name = 'pdx';                 // the id codeToHtml uses
            return g;
        } catch { /* try the next one */ }
    }
    return null;
}

export interface DocHeading { depth: number; text: string; id: string; }
export interface DocModule {
    frontmatter: Record<string, string | number>;
    html: string;
    headings: DocHeading[];
    slug: string;
}

const THEME = 'github-dark';
const LANGS = ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'bash', 'sh', 'text'];

/** kebab id from heading text: "Getting Started" → "getting-started". */
function slugify(text: string): string {
    return text.toLowerCase().trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

/** Minimal YAML-ish frontmatter parser (key: value per line). */
function parseFrontmatter(src: string): { data: Record<string, string | number>; content: string } {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
    if (!m) return { data: {}, content: src };
    const data: Record<string, string | number> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i === -1) continue;
        const key = line.slice(0, i).trim();
        let val: string | number = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        if (/^\d+$/.test(val)) val = Number(val);
        data[key] = val;
    }
    return { data, content: src.slice(m[0].length) };
}

/** Headings (h2/h3) for the TOC, with ids matching the rendered anchors. */
function extractHeadings(content: string): DocHeading[] {
    const out: DocHeading[] = [];
    for (const line of content.split(/\r?\n/)) {
        const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
        if (m) out.push({ depth: m[1].length, text: m[2].trim(), id: slugify(m[2].trim()) });
    }
    return out;
}

export function markdownPlugin(): Plugin {
    let md: MarkdownIt | null = null;
    let highlighter: Highlighter | null = null;

    return {
        name: 'pdx-markdown',
        enforce: 'pre',
        async transform(src, id) {
            const [file, rawQuery = ''] = id.split('?');
            if (!file.endsWith('.md')) return;
            // The dev server adds its own params — `import` on a dynamic import, `t` on an update —
            // so the query is read param by param, not as a whole.
            const params = new URLSearchParams(rawQuery);
            const query = params.has('meta') ? 'meta' : (params.has('raw') || params.has('url') ? 'vite' : '');

            // `x.md?meta`: the frontmatter and the slug, nothing else. The docs nav and the search
            // page need every doc's title up front; only the page being read needs its HTML. Both
            // from one eager `x.md` import would put every doc's rendered HTML (848 kB, api.md alone
            // 605 kB) in the site's entry chunk. A separate module is what lets the
            // bundler keep the two apart.
            if (query === 'meta') {
                const { data } = parseFrontmatter(src);
                const metaSlug = file.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/, '');
                return { code: `export default ${JSON.stringify({ frontmatter: data, slug: metaSlug })};`, map: null };
            }
            if (query === 'vite') return; // ?raw and ?url are Vite's

            if (!md) {
                const pdxGrammar = loadPdxGrammar();
                const langs = pdxGrammar ? [...LANGS, pdxGrammar] : LANGS;
                highlighter = await createHighlighter({ themes: [THEME], langs });
                const hasPdx = !!pdxGrammar;
                md = new MarkdownIt({
                    html: true,
                    linkify: true,
                    highlight: (code, lang) => {
                        // .pdx with its own grammar where there is one, otherwise fall back to 'ts'.
                        let l = lang || 'text';
                        if (lang === 'pdx') l = hasPdx ? 'pdx' : 'ts';
                        else if (!LANGS.includes(l)) l = 'text';
                        try {
                            return highlighter!.codeToHtml(code, { lang: l, theme: THEME });
                        } catch {
                            return ''; // markdown-it falls back to escaped <pre><code>
                        }
                    },
                });
                // Inject id on h2/h3 so TOC anchors resolve.
                md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
                    const level = Number(tokens[idx].tag.slice(1));
                    if (level === 2 || level === 3) {
                        const inline = tokens[idx + 1];
                        if (inline && inline.type === 'inline') tokens[idx].attrSet('id', slugify(inline.content));
                    }
                    return self.renderToken(tokens, idx, options);
                };
            }

            const { data, content } = parseFrontmatter(src);
            const html = md.render(content);
            const headings = extractHeadings(content);
            const slug = file.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/, '');

            const mod: DocModule = { frontmatter: data, html, headings, slug };
            return { code: `export default ${JSON.stringify(mod)};`, map: null };
        },
    };
}
