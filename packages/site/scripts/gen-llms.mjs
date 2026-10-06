// Generates public/llms.txt (the index) and public/llms-full.txt (the full dump) from:
//   - the Custom Elements Manifest of every component package (@pdxui/ui, @pdxui/router), found by
//     the compiler's own discovery: a package the compiler and the editor know is listed
//   - the markdown in content/docs
// The llmstxt.org standard: it makes the site agent-native. Run before the build.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { discoverComponentPackages } from '../../compiler/src/discover-component-packages.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, '..');
// The site's own dependencies, as an app's would be read.
const MANIFESTS = discoverComponentPackages(SITE, SITE).map(p => p.manifest);
const DOCS = join(SITE, 'content', 'docs');
const PUBLIC = join(SITE, 'public');

const INSTRUCTIONS = [
    'Use `:attr=` to bind an attribute, NEVER `${}` (the PDX_RAW_INTERPOLATION warning).',
    'Declare reactive state with `$signal` / `$derived`; props with `@prop`, events with `@event`.',
    'The components are Web Components `<pdx-*>` imported from `@pdxui/ui`.',
    'Interpolate text in the template with `{{ ... }}`; events with `@event="handler"`.',
];

function frontmatter(src) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
    const data = {};
    if (m) for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(':'); if (i === -1) continue;
        data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
    return { data, body: m ? src.slice(m[0].length) : src };
}

const docFiles = readdirSync(DOCS).filter(f => f.endsWith('.md'));
const docs = docFiles.map(f => {
    const { data, body } = frontmatter(readFileSync(join(DOCS, f), 'utf-8'));
    return { slug: f.replace(/\.md$/, ''), title: data.title || f, description: data.description || '', body, order: Number(data.order || 999) };
}).sort((a, b) => a.order - b.order);

const comps = MANIFESTS.flatMap(file => JSON.parse(readFileSync(file, 'utf-8')).modules)
    .map(m => m.declarations[0]).filter(Boolean).sort((a, b) => a.order - b.order);

// ── llms.txt (index) ──
let idx = `# PDX UI\n\n`;
idx += `> A signal-based UI framework with a compiler that turns .pdx files into standard Web Components. Agent-native: a JSON manifest for every component, structured diagnostics, deterministic patterns.\n\n`;
idx += `## Instructions\n${INSTRUCTIONS.map(i => `- ${i}`).join('\n')}\n\n`;
idx += `## Docs\n${docs.map(d => `- [${d.title}](/docs/${d.slug}): ${d.description}`).join('\n')}\n\n`;
idx += `## Components\n${comps.map(c => {
    const props = (c.attributes || []).map(a => a.name).join(', ');
    // One line per component: the description is JSDoc prose and wraps, and copied as it is it
    // would split the entry, leaving the rest of the sentence on a line of its own.
    const said = (c.summary || c.description || c.category).replace(/\s*\n\s*/g, ' ');
    return `- [${c.tagName}](/components/${c.tagName}): ${said}${props ? ` — props: ${props}` : ''}`;
}).join('\n')}\n`;

// ── llms-full.txt (the complete dump) ──
// The headings ship to readers, so they are English like everything else published — and a string
// literal in code is not a comment, so no language detector looks at one.
let full = idx + `\n---\n\n# Documentation (complete)\n\n`;
for (const d of docs) full += `## ${d.title}\n\n${d.body.trim()}\n\n`;
full += `\n---\n\n# Component API\n\n`;
for (const c of comps) {
    full += `## ${c.tagName}\n`;
    if (c.summary || c.description) full += `${c.summary || c.description}\n`;
    if (c.attributes?.length) full += `\nProps:\n${c.attributes.map(a => `- ${a.name}: ${a.type?.text || ''}${a.default !== undefined ? ` = ${a.default}` : ''}${a.description ? ` — ${a.description}` : ''}`).join('\n')}\n`;
    if (c.events?.length) full += `\nEvents:\n${c.events.map(e => `- ${e.name}${e.description ? ` — ${e.description}` : ''}`).join('\n')}\n`;
    if (c.slots?.length) full += `\nSlots:\n${c.slots.map(s => `- ${s.name || '(default)'}${s.description ? ` — ${s.description}` : ''}`).join('\n')}\n`;
    // What a ref reaches: without it, the page an agent reads to learn this library lists the props
    // and stops, and `wizard.goNext()` and `grid.startEdit(rowId, field?)` are invisible. The signature comes from
    // the manifest's `parameters`; a member with none prints bare rather than asserting one.
    const api = (c.members || []).filter(m => m.kind === 'method' || (m.kind === 'field' && m.readonly));
    if (api.length) full += `\nAPI (via a ref):\n${api.map(m => {
        const call = m.kind === 'method'
            ? (m.parameters ? `${m.name}(${m.parameters.map(p => p.name + (p.optional ? '?' : '')).join(', ')})` : m.name)
            : `${m.name}${m.type?.text ? `: ${m.type.text}` : ''} (read-only)`;
        return `- ${call}${m.description ? ` — ${m.description}` : ''}`;
    }).join('\n')}\n`;
    full += `\n`;
}

/**
 * Written with a UTF-8 BOM, and that is not decoration.
 *
 * Both files are full of em-dashes — every description separator is one — and they are served as
 * `text/plain`. A server that does not add `charset=utf-8` to that leaves the consumer guessing, and
 * a browser guesses windows-1252: measured on the built site, `— Current step` arrives as
 * `â€” Current step`. The bytes were always valid UTF-8; nothing said so.
 *
 * The charset belongs in the header, and this file cannot set one: the host is outside this
 * repository. A BOM is the one signal that travels IN the file, and it overrides the default for
 * text/plain in every browser. The cost is three bytes at the start that a naive reader may keep —
 * acceptable for prose, and it would not be for JSON.
 */
const BOM = '﻿';
mkdirSync(PUBLIC, { recursive: true });
writeFileSync(join(PUBLIC, 'llms.txt'), BOM + idx);
writeFileSync(join(PUBLIC, 'llms-full.txt'), BOM + full);
console.log(`[gen-llms] llms.txt (${docs.length} docs, ${comps.length} components) + llms-full.txt → public/`);
