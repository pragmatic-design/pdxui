// gen-topics.mjs — the references of the topic skills, copied from the site docs.
//
// Deploy, lazy routes, keepAlive, permissions, testing, cross-field validation: an agent building an
// app meets them only if a skill carries them, and the site docs are where they are written. Each topic skill has a short
// SKILL.md written by hand, and its `references/` are the matching pages of
// packages/site/content/docs, copied as they are: a second text would drift from the first, and the
// docs are the ones docs-examples-compile.test.ts compiles.
//
// What changes in a copy: the frontmatter goes (the page's `# heading` stays), a first line says where
// the page comes from, and the site's root-relative links are pointed somewhere a reader of the skill
// can follow — the copy in this plugin when there is one, the published site otherwise. Code blocks are
// left alone: `href="/assets/…"` in an example is the example.
//
// Usage: node gen-topics.mjs [--out <skills dir>] [--ui <repo>]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const argOut = process.argv.indexOf('--out');
const OUT = argOut > -1 ? process.argv[argOut + 1] : join(__dir, '..', '..');
const argUi = process.argv.indexOf('--ui');
const UI = argUi > -1 ? process.argv[argUi + 1] : join(__dir, '..', '..', '..', '..', '..', '..');
const DOCS = join(UI, 'packages/site/content/docs');
// The published site: the homepage every package.json declares.
const SITE = JSON.parse(readFileSync(join(UI, 'packages/core/package.json'), 'utf8')).homepage.replace(/\/$/, '');

/** Topic skill → the docs pages its references are. */
const TOPICS = [
  { id: 'data-layer', pages: ['data', 'store', 'provide-inject'] },
  { id: 'validation', pages: ['forms'] },
  { id: 'routing', pages: ['router', 'head-scroll'] },
  { id: 'i18n', pages: ['i18n'] },
  // `diagnostics` is generated from the compiler's catalog: what an agent reads after `pdx check`.
  { id: 'setup', pages: ['getting-started', 'cli', 'agents', 'compiler', 'diagnostics', 'integration', 'devtools'] },
  { id: 'testing', pages: ['testing', 'permissions'] },
];

/** The first line of every copy: what `skill-examples-compile` skips, and what a maintainer reads. */
const MARK =(page) => `<!-- Copied from packages/site/content/docs/${page}.md by gen-topics.mjs: edit it there. -->`;

const home = new Map(TOPICS.flatMap(t => t.pages.map(p => [p, t.id])));
// Pages another skill of this plugin already carries.
const elsewhere = { api: '../../pdxui/references/api.md' };

/** Where a root-relative site link goes from inside `topic`'s references. */
function target(path, topic) {
  const m = /^\/docs\/([a-z0-9-]+)(#.*)?$/.exec(path);
  if (m) {
    const [, slug, anchor = ''] = m;
    if (home.get(slug) === topic) return `${slug}.md${anchor}`;
    if (home.has(slug)) return `../../pdxui-${home.get(slug)}/references/${slug}.md${anchor}`;
    if (elsewhere[slug]) return `${elsewhere[slug]}${anchor}`;
  }
  return `${SITE}${path}`;
}

/** The page as a reference of `topic`: no frontmatter, links rewritten outside code fences. */
function copy(page, topic) {
  const text = readFileSync(join(DOCS, `${page}.md`), 'utf8').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n+/, '');
  // Split on fences, keeping them: odd parts are code and stay as they are.
  const parts = text.split(/(^```[^\n]*\n[\s\S]*?^```[ \t]*$)/m);
  const body = parts.map((p, i) => i % 2 ? p : p.replace(/\]\((\/[^)\s]*)\)/g, (_, path) => `](${target(path, topic)})`)).join('');
  return `${MARK(page)}\n\n${body.trimEnd()}\n`;
}

for (const t of TOPICS) {
  const dir = join(OUT, `pdxui-${t.id}`, 'references');
  mkdirSync(dir, { recursive: true });
  // A page dropped from a topic goes with it — only the copies: anything written here by hand stays.
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f.endsWith('.md') && !t.pages.includes(f.slice(0, -3)) && readFileSync(p, 'utf8').startsWith('<!-- Copied from ')) rmSync(p);
  }
  for (const page of t.pages) {
    if (!existsSync(join(DOCS, `${page}.md`))) throw new Error(`${t.id}: packages/site/content/docs/${page}.md does not exist`);
    writeFileSync(join(dir, `${page}.md`), copy(page, t.id));
  }
}

console.log(`Copied ${TOPICS.reduce((n, t) => n + t.pages.length, 0)} docs pages into ${TOPICS.length} topic skills.`);
