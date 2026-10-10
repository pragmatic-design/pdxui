// gen-catalog.mjs — deterministic generator for the PDX skills.
//
// The model (the same one the .NET side uses: one general skill plus many focused ones):
//   - `pdxui`            → the GENERAL skill (playbook/recipes/gotchas, hand-written) + the area index.
//   - `pdxui-<area>`     → one skill PER GROUP of components (that area's props/events catalogue).
//
// Sources: the Custom Elements Manifest of every component package — @pdxui/ui and
//   @pdxui/router in this repository, found by the compiler's own discovery — + packages/site/src/lib/
//   summaries.ts (one-liners) + grep for `emit('pdx-…')` in the library's sources (events: the CEM
//   only has some of them).
// Generates ONLY the area skills and the general skill's index. It does NOT touch
// SKILL.md/recipes.md/gotchas.md, which are hand-curated.
// Re-runnable after any change to the library: `node tools/gen-catalog.mjs`.
//
// Usage: node gen-catalog.mjs [--ui <path-to-UI-repo>] [--project <dir>]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));

// `--out <dir>` writes the whole tree somewhere else, defaulting to where the skills live.
//
// It exists so a test can regenerate into a temp directory and compare against what is committed.
// Without it the catalogue drifts from the library in silence — a component in the library and in no
// skill, a prop documented with a default it does not have. The root skill says to regenerate in the
// same PR as the component change; this is what checks that anyone did.
const argOut = process.argv.indexOf('--out');
const OUT = argOut > -1 ? process.argv[argOut + 1] : join(__dir, '..', '..');
const SKILLS = OUT;                                   // .claude/skills/
const GENERAL = join(OUT, 'pdxui');            // .claude/skills/pdxui/
const argUi = process.argv.indexOf('--ui');
// Default: the repository this script lives in (marketplace/plugins/pdxui/skills/pdxui/tools/).
const UI = argUi > -1 ? process.argv[argUi + 1] : (process.env.PRAGMATIC_UI || join(__dir, '..', '..', '..', '..', '..', '..'));
// `--project <dir>`: catalogue the component packages that project depends on. Without it, those of
// this repository — the `packages/*` that declare `customElements`. The discovery is the compiler's,
// the same list the resolver and the editor read, so a package they know is catalogued.
const argProject = process.argv.indexOf('--project');
const PROJECT = argProject > -1 ? process.argv[argProject + 1] : undefined;
const { discoverComponentPackages } = await import(pathToFileURL(join(UI, 'packages/compiler/src/discover-component-packages.mjs')).href);
const PACKAGES = discoverComponentPackages(PROJECT, UI);
const SUMMARIES = join(UI, 'packages/site/src/lib/summaries.ts');
const UISRC = join(UI, 'packages/ui/src');

// ── Area taxonomy. A component joins the FIRST area that lists it.
//    desc is the area skill's frontmatter description — it is what triggers it, so a component
//    missing from `desc` is a component the agent's search never surfaces.
//
//    ⚠️ There is NO catch-all. A catch-all skill is named for the shelf instead of the contents, and
//    its components go unread — `pdx-page-header` among them, hand-built instead. An unmapped
//    component throws: naming its area is a decision, and a decision nobody makes is not a decision
//    the generator should make for us. ──
const AREAS = [
  { id: 'layout', title: 'Layout & shell', blurb: 'Page structure and application shell.',
    desc: 'PDX (@pdxui/ui) layout and shell components — pdx-app-layout, pdx-page-header, navbar, sidebar, splitter, scroll-area, row/col grid, aspect-ratio, masonry, toolbar, affix, scroll-spy — with props and events. Use when building the page structure or app shell of a .pdx app.',
    tags: ['pdx-app-layout','pdx-page-header','pdx-navbar','pdx-sidebar','pdx-splitter','pdx-scroll-area','pdx-affix','pdx-row','pdx-col','pdx-aspect-ratio','pdx-masonry','pdx-toolbar','pdx-scroll-spy'] },
  { id: 'navigation', title: 'Navigation & menus', blurb: 'Navigation, menus, entries, pagination.',
    desc: 'PDX navigation components — router-outlet, link, nav-menu, bottom-nav, breadcrumb, menu, menubar, dropdown and context menus, command palette, tabs, pagination, fab, split-button — with props and events. Use when adding links, navigation, menus, tabs or a command palette to a .pdx app.',
    tags: ['pdx-router-outlet','pdx-link','pdx-nav-menu','pdx-bottom-nav','pdx-breadcrumb','pdx-menu','pdx-menubar','pdx-dropdown-menu','pdx-context-menu','pdx-command','pdx-tabs','pdx-pagination','pdx-fab','pdx-split-button'] },
  { id: 'data', title: 'Data display & data-bound', blurb: 'Grids, charts, lists and data sources.',
    desc: 'PDX (@pdxui/ui) data components — data-grid, entity-grid (CRUD-wired), bulk-actions, data-source, filter-builder, chart, sparkline, list, sortable-list, tree, statistic, timeline, calendar, empty-state — with props and events. Use when showing records, a grid, a chart or a tree in a .pdx app.',
    tags: ['pdx-data-grid','pdx-entity-grid','pdx-bulk-actions','pdx-data-source','pdx-filter-builder','pdx-chart','pdx-sparkline','pdx-list','pdx-sortable-list','pdx-tree','pdx-description-list','pdx-statistic','pdx-timeline','pdx-pagination','pdx-infinite-scroll','pdx-empty-state','pdx-relative-time','pdx-calendar'] },
  { id: 'forms', title: 'Form building', blurb: 'Form composition, sections, auto-form, wizard.',
    desc: 'PDX (@pdxui/ui) form-building components — pdx-form, auto-form, form-template, json-editor, form-field/section/actions, fieldset, field-group/list, input-group, inline-edit, wizard — with props and events. Use when building a form, an edit screen or a wizard in a .pdx app.',
    tags: ['pdx-form','pdx-auto-form','pdx-form-template','pdx-json-editor','pdx-form-field','pdx-form-section','pdx-form-actions','pdx-fieldset','pdx-field-group','pdx-field-list','pdx-input-group','pdx-inline-edit','pdx-wizard'] },
  { id: 'inputs', title: 'Inputs (form controls)', blurb: 'Every input and selection control.',
    desc: 'PDX (@pdxui/ui) input controls — text, number, masked, password, search and rich-text inputs, checkbox, radio, switch, toggle, segmented, select, autocomplete, tree-select, cascader, date/time/color pickers, slider, rating, tags, file upload. Use when adding a form control to a .pdx app.',
    tags: ['pdx-input','pdx-textarea','pdx-rich-text','pdx-number-input','pdx-masked-input','pdx-password-input','pdx-otp-input','pdx-pin-input','pdx-search-input','pdx-checkbox','pdx-checkbox-group','pdx-radio','pdx-radio-group','pdx-switch','pdx-toggle','pdx-toggle-group','pdx-segmented','pdx-select','pdx-autocomplete','pdx-tree-select','pdx-cascader','pdx-date-picker','pdx-time-picker','pdx-color-picker','pdx-slider','pdx-rating','pdx-tag-input','pdx-mention','pdx-file-upload','pdx-transfer'] },
  { id: 'overlay', title: 'Overlay & feedback', blurb: 'Dialog, drawer, popover, toast, banner.',
    desc: 'PDX (@pdxui/ui) overlay and feedback components — dialog, alert-dialog, drawer, edit-drawer, relation-picker, bottom-sheet, popover, tooltip, toast, banner, block-ui — with props and events. Use when showing a dialog, drawer, popover, toast or loading overlay in a .pdx app.',
    tags: ['pdx-dialog','pdx-alert-dialog','pdx-drawer','pdx-edit-drawer','pdx-relation-picker','pdx-bottom-sheet','pdx-popover','pdx-tooltip','pdx-toast','pdx-banner','pdx-block-ui','pdx-overlay-outlet'] },
  { id: 'display', title: 'Atoms & display', blurb: 'Visual primitives and simple containers.',
    desc: 'PDX (@pdxui/ui) display atoms — button, button-group, icon, badge, chip, avatar, divider, kbd, label, progress, spinner, image, card, accordion, carousel — with props and events. Use when placing a basic visual element in a .pdx app.',
    tags: ['pdx-button','pdx-button-group','pdx-icon','pdx-badge','pdx-chip','pdx-avatar','pdx-avatar-group','pdx-divider','pdx-kbd','pdx-label','pdx-progress','pdx-spinner','pdx-image','pdx-card','pdx-accordion','pdx-carousel'] },
  { id: 'infra', title: 'Infrastructure', blurb: 'Provider, error boundary, plumbing.',
    desc: 'PDX (@pdxui/ui) infrastructure components — pdx-provide (a DI/context provider) and pdx-error-boundary — with props and events. Use when wiring the plumbing of a .pdx app.',
    tags: ['pdx-provide','pdx-error-boundary'] },
];

// A component from a package this file does not list — a third party's — takes the area its
// manifest's `category` names: the package's author made that decision. A category with no area
// here stops the generator like an unmapped tag does.
const CATEGORY_AREAS = {
  'Layout': 'layout', 'Navigation': 'navigation', 'Data-bound': 'data', 'Data Display': 'data',
  'Forms': 'forms', 'Specialized Inputs': 'inputs', 'Overlay + Containers': 'overlay', 'Atoms': 'display',
  'Infrastructure': 'infra',
};

const areaOf = (tag, category) => {
  const area = AREAS.find(a => a.tags.includes(tag));
  if (area) return area.id;
  if (category && CATEGORY_AREAS[category]) return CATEGORY_AREAS[category];
  console.error(`\n  ${tag} belongs to no area.\n`);
  console.error(`  Add it to one of: ${AREAS.map(a => a.id).join(', ')} — in AREAS above, in BOTH`);
  console.error(`  \`tags\` and \`desc\`: \`desc\` is the area skill's frontmatter, and a component`);
  console.error(`  missing from it is a component the agent's search never surfaces.\n`);
  process.exit(1);
};

function parseSummaries() {
  const out = {};
  if (!existsSync(SUMMARIES)) return out;
  const txt = readFileSync(SUMMARIES, 'utf8');
  const re = /'(pdx-[\w-]+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g; let m;
  while ((m = re.exec(txt))) out[m[1]] = m[2].replace(/\\'/g, "'");
  return out;
}

function emitsFor(tag) {
  const dir = join(UISRC, tag.replace(/^pdx-/, ''));
  const found = new Set();
  if (!existsSync(dir)) return [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const txt = readFileSync(join(dir, f), 'utf8');
    const re = /emit\(\s*'(pdx-[\w-]+)'/g; let m; while ((m = re.exec(txt))) found.add(m[1]);
  }
  return [...found].sort();
}

// The backslash first: a `\|` in the text would otherwise end the table cell at its pipe (#72).
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
/** `s` with `re` removed until nothing more is: one pass can join two halves into a new match (#72). */
const removeAll = (s, re) => { let prev; do { prev = s; s = s.replace(re, ''); } while (s !== prev); return s; };

/** The names of the built-in icon set: the keys of `icons` in pragmatic-icons.ts, in file order. */
function builtInIconNames() {
  const txt = readFileSync(join(UISRC, 'icon', 'pragmatic-icons.ts'), 'utf8');
  // Match: a four-space-indented quoted key opening an entry of the `icons` map. Groups: [1]=name
  return [...txt.matchAll(/^ {4}'([a-z0-9-]+)':/gm)].map(m => m[1]);
}

// ── Build component records from every package's CEM ──
const summaries = parseSummaries();
const comps = [];
for (const mod of PACKAGES.flatMap(p => JSON.parse(readFileSync(p.manifest, 'utf8')).modules || [])) {
  for (const d of mod.declarations || []) {
    if (!d.customElement || !d.tagName) continue;
    const tag = d.tagName;
    // A read-only field is an exposed getter (`el.isOpen`), not a prop: nothing sets it, so it is not
    // a row of the props table.
    const props = (d.members || []).filter(x => x.kind === 'field' && !x.readonly).map(x => ({
      name: x.name, attr: x.attribute || '', type: (x.type && x.type.text) || '', def: x.default || '', desc: x.description || '' }));
    // An attribute no field carries is still something to set: a class-defined element (the
    // router's `<pdx-link active-class>`) reads attributes it never reflects. The
    // library's manifest has a field for every attribute, so this adds no row there.
    const carried = new Set(props.map(p => p.attr));
    for (const a of d.attributes || []) {
      if (!carried.has(a.name)) props.push({ name: a.name, attr: a.name, type: (a.type && a.type.text) || '', def: a.default || '', desc: a.description || '' });
    }
    // What a ref reaches: the methods ctx.expose() puts on the element, and the read-only members
    // (an exposed getter, or an object like scroll-area's). Without them an agent reading the skill
    // could not learn that `wizard.goNext()` exists at all.
    const api = (d.members || [])
      .filter(x => x.kind === 'method' || (x.kind === 'field' && x.readonly))
      .map(x => ({
        name: x.name, desc: x.description || '', readonly: x.kind !== 'method',
        // A method with no `parameters` is one whose value the generator could not follow
        // (a call, say): print the bare name rather than assert a signature nobody measured.
        call: x.parameters ? `${x.name}(${x.parameters.map(p => p.name + (p.optional ? '?' : '')).join(', ')})`
          : x.kind === 'method' ? x.name : `${x.name}${(x.type && x.type.text) ? ': ' + x.type.text : ''}`,
      }));
    const evMap = new Map((d.events || []).map(e => [e.name, { desc: e.description || '', detail: e.detail || '' }]));
    for (const g of emitsFor(tag)) if (!evMap.has(g)) evMap.set(g, { desc: '', detail: '' });
    const events = [...evMap.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => a.name.localeCompare(b.name));
    // Named slots only: the default slot is implicit, and "put content inside" needs no entry.
    const slots = (d.slots || []).filter(s => s.name).map(s => ({ name: s.name, desc: s.description || '' }));
    // The site's one-liner first; then the manifest's own `summary`, which a package outside the
    // library brings (the router's elements); then its description.
    comps.push({ tag, summary: summaries[tag] || d.summary || (d.description || ''), props, api, events, slots, shapes: d.shapes || [], roles: d.roles || [], area: areaOf(tag, d.category) });
  }
}
comps.sort((a, b) => a.tag.localeCompare(b.tag));

// ── Who reads a DataSource ──
// A select's, a list's or a chart's entry says it takes one; otherwise pdx-data-source reads as
// plumbing for grids. A consumer is a component whose own sources name the DataSource type; how it
// takes one is read from the same sources: a `source` prop, the `dataSource` it injects from an
// enclosing <pdx-data-source>, or a schema field's `source` handed to the control it renders.
const pageLink = (c) => `[\`<${c.tag}>\`](../../pdxui-${c.area}/references/${c.tag}.md)`;
function dataSourceUse(c) {
  const dir = join(UISRC, c.tag.replace(/^pdx-/, ''));
  if (c.tag === 'pdx-data-source' || !existsSync(dir)) return null;
  const src = readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
  if (!/\bDataSource\b/.test(src)) return null;
  const ways = [];
  if (c.props.some(p => p.name === 'source')) ways.push('bind one to `:source`');
  // Match: tryInject('dataSource', …), with or without a type argument — which nests its own `<>`:
  // `tryInject<DataSource<any>>(…)`, so no `[^>]*` here.
  if (/tryInject\b[^(]*\(\s*'dataSource'/.test(src)) ways.push('place the component inside a <DS>, which it injects');
  if (!ways.length && /\bfield\.source\b/.test(src)) ways.push("give a schema field a `source`: the control it renders for that field reads it");
  return ways.length ? ways : ['it reads one: see its props'];
}
for (const c of comps) c.dataSource = dataSourceUse(c);
const dsComp = comps.find(c => c.tag === 'pdx-data-source');

// Hand-written notes, one file per tag: `tools/notes/<tag>.md`. What a props table cannot say —
// composition rules, a trap, the shape of the children — goes HERE and not into the emitted
// SKILL.md, which is overwritten on every run: a note written there is deleted, warning and all, by
// the next regeneration.
// Next to the script, NOT under the output root: notes are an INPUT, and with `--out <temp>` a
// GENERAL-relative path would find an empty folder and quietly drop every note from the comparison.
const NOTES = join(__dir, 'notes');
const noteFor = (tag) => {
  const p = join(NOTES, `${tag}.md`);
  return existsSync(p) ? readFileSync(p, 'utf-8').trim() : null;
};

function renderComp(c) {
  const lines = [`### \`<${c.tag}>\``, '', c.summary || '_(no summary)_', ''];
  if (c.dataSource && dsComp) {
    const how = c.dataSource.join(', or ').replace('<DS>', pageLink(dsComp));
    lines.push(`**Takes a DataSource:** ${how}.`, '');
  }
  if (c.tag === 'pdx-data-source') {
    const readers = comps.filter(x => x.dataSource);
    lines.push(`**Read by** (${readers.length}): ${readers.map(pageLink).join(' · ')}`, '');
  }
  const note = noteFor(c.tag);
  if (note) lines.push(note, '');
  if (c.props.length) {
    lines.push('| Prop | Attr | Type | Default | Notes |', '|---|---|---|---|---|');
    for (const p of c.props) lines.push(`| \`${p.name}\` | ${p.attr ? '`' + p.attr + '`' : '—'} | ${esc(p.type) || '—'} | ${p.def ? '`' + esc(p.def) + '`' : '—'} | ${esc(p.desc)} |`);
    lines.push('');
  } else lines.push('_No public props._', '');
  // The imperative API, one row per member, with its description. Only when
  // there is one: a presentational component exposes nothing and gets no empty heading.
  if (c.api && c.api.length) {
    lines.push('**API (via `:ref`)**', '');
    lines.push('| Call | Notes |', '|---|---|');
    for (const m of c.api) {
      lines.push(`| \`${m.call}\`${m.readonly ? ' _(read-only)_' : ''} | ${esc(m.desc)} |`);
    }
    lines.push('');
  }
  // The detail each event carries, from the manifest. Without it an app measures payloads in a
  // browser, or guesses pdx-tag-input's list is `detail.value` — it is `detail.tags`.
  // Not escaped: it sits in a code span, where a `\|` would print its backslash.
  if (c.events.length) lines.push('**Events:** ' + c.events.map(e => '`' + e.name + '`' + (e.detail ? ' → `detail: ' + e.detail + '`' : '') + (e.desc ? ' — ' + esc(e.desc) : '')).join('; '), '');
  // The ARIA roles it renders: what a test or a measuring script targets.
  if (c.roles && c.roles.length) lines.push('**Renders:** roles ' + c.roles.map(r => '`' + r + '`').join(' · '), '');
  // pdx-icon's `name` is a string, and every wrong one renders nothing, silently. The names are the
  // keys of the built-in set, read from the file that defines it, so the list cannot go stale.
  if (c.tag === 'pdx-icon') {
    const names = builtInIconNames();
    lines.push(`**Built-in names** (${names.length}, set \`pragmatic\`, the default): ` + names.map(n => '`' + n + '`').join(' '), '');
  }
  // Slots not printed here do not exist for an agent, which then finds pdx-drawer's header/footer by
  // measuring the DOM.
  if (c.slots && c.slots.length) lines.push('**Slot:** ' + c.slots.map(s => '`' + s.name + '`' + (s.desc ? ' — ' + esc(s.desc) : '')).join('; '), '');
  // The shape of an `array`/`object` prop. Without it, "items · array · The data items to render" is
  // unusable: the consumer guesses the fields, the component renders, and the field they missed is
  // silent: a breadcrumb given `[{ label }]` never tells its author about `href`.
  if (c.shapes && c.shapes.length) {
    lines.push('**Shapes:** ' + c.shapes.map(sh => '`' + sh.name + ' { ' + sh.fields.join('; ') + ' }`').join(' · '), '');
  }
  return lines.join('\n');
}

// A note whose filename matches no component is a note nobody will ever read — the same silent
// drop a catch-all area would be. Say so instead of writing the file out and forgetting it.
// The notes are about this repository's library: a `--project` catalogue that does not include it
// has nothing to say about them.
if (existsSync(NOTES) && !PROJECT) {
  const known = new Set(comps.map(c => c.tag));
  const orphans = readdirSync(NOTES).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).filter(t => !known.has(t));
  if (orphans.length) {
    console.error(`\n  notes/ has files for components that do not exist: ${orphans.join(', ')}`);
    console.error(`  Rename them to a real tag, or delete them — as written they are read by nothing.\n`);
    process.exit(1);
  }
}

// ── Examples, from the component demos ──
//
// A props table and a note say what a component accepts, never how it is used. The demos the site shows say how, one section per use, each with a `Source` block. Those
// blocks are what goes on the component's page, so the page cannot teach a use the demo does not show.
// The blocks are written by hand beside the live demo; `skill-component-examples.test.ts` checks every
// prop and event they name against the component's manifest, which is where they drift.
// The showcase's demos, and the four the site authors itself (calendar, json-editor, page-header,
// relation-picker: packages/site/scripts/port-demos.mjs reads both folders the same way).
const DEMO_DIRS = [join(UI, 'packages/compiler/demo/showcase-new/pages'), join(UI, 'packages/site/src/demos-authored')];
// `@@` is how a .pdx template writes a literal `@` (parser/template.ts): the demo's `@@try` is `@try`.
const unescapeHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&amp;/g, '&').replace(/@@/g, '@');
// A tag named in a heading becomes code, `<code>` or not: `<pdx-error-boundary>` bare is read as a tag
// by Markdown. The escaped `&lt;x&gt;` outside a code span is what the demos write for it.
const plainText = (s) => unescapeHtml(removeAll(s.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`'), /<[^>]+>/g)
  .replace(/(`[^`]*`)|&lt;(\/?[a-z][\w-]*)&gt;/g, (m, code, tag) => code ?? `\`<${tag}>\``)).replace(/\s+/g, ' ').trim();
/** A line that starts script rather than markup: where a Source block's JS part begins. */
const SCRIPT_START = /^(import |export |const |let |var |function |async |await |class |\/\/|\/\*|[A-Za-z_$][\w$.]*\s*(=|\())/;
/** A line that is template: an element, or a block directive (`@try {`, `@for (…)`). */
const MARKUP_START = /^\s*(<|@(try|for|if|await|switch|defer)\b)/;

/** Whether a tag is still open at the end of `line`: `<x` opens one, `>` outside quotes closes it. */
function tagOpenAfter(line, open) {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (open && quote) { if (ch === quote) quote = ''; continue; }
    if (open && (ch === '"' || ch === "'")) quote = ch;
    else if (open && ch === '>') open = false;
    else if (!open && ch === '<' && /[A-Za-z/]/.test(line[i + 1] ?? '')) open = true;
  }
  return open;
}

/**
 * A Source block as it reads: its runs of markup and of script, in order. A block is often
 * `import …; const ds = …;` and then the element that uses `ds`: kept as one ```js fence, that element
 * escaped the check of its props. Script starts on a line that opens a statement; markup starts on a
 * line at column 0 that opens an element or a block directive once the statement before has ended
 * (a blank line, a comment, or `;` `}` `)` `]` closing the previous line). A line inside a tag that is
 * still open is markup whatever it looks like: `trend="up" …>` continues `<pdx-statistic`, it is not an
 * assignment.
 */
function splitRuns(lines) {
  const runs = [];
  let prev = '';
  let inTag = false;
  for (const l of lines) {
    const t = l.trim();
    const cur = runs[runs.length - 1];
    let lang = cur ? cur.lang : (MARKUP_START.test(l) ? 'html' : 'js');
    if (cur?.lang === 'html' && !inTag && t && SCRIPT_START.test(t) && !/^\s*</.test(l)) lang = 'js';
    else if (cur?.lang === 'js' && /^(<|@(try|for|if|await|switch|defer)\b)/.test(l)
      && (prev === '' || prev.startsWith('//') || /[;})\]]$/.test(prev))) lang = 'html';
    if (!cur || lang !== cur.lang) runs.push({ lang, lines: [l] }); else cur.lines.push(l);
    prev = t;
    if (lang === 'html') inTag = tagOpenAfter(l, inTag);
  }
  return runs.map(r => ({ lang: r.lang, code: r.lines.join('\n').trim() })).filter(r => r.code);
}

/**
 * A demo page as it reads, with the sections it composes in place: each
 * `<pdx-demo-<page>-<slug>>` is the template of `sections/<page>/demo-<page>-<slug>.pdx`, in the order
 * the page composes them.
 */
function composedPage(file) {
  const text = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
  const dir = join(dirname(file), 'sections', basename(file, '.pdx'));
  return text.replace(/<(pdx-demo-[\w-]+)\b[^>]*><\/\1>/g, (tag, name) => {
    const section = join(dir, `${name.slice('pdx-'.length)}.pdx`);
    if (!existsSync(section)) return tag;
    const src = readFileSync(section, 'utf-8').replace(/\r\n/g, '\n');
    return /<template>([\s\S]*?)<\/template>/.exec(src)?.[1] ?? tag;
  });
}

/** The sections of one demo page: title, description, and each Source block as runs of markup and script. */
function demoSections(file) {
  const text = composedPage(file);
  const out = [];
  for (const sec of text.split(/<section\b/).slice(1)) {
    const title = plainText(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(sec)?.[1] ?? '');
    const desc = plainText(/<p class="pdx-txt-small[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(sec)?.[1] ?? '');
    // Two shapes carry a transcription for the reader: `details.source` and `details.source-block`.
    let blocks = [...sec.matchAll(/<details class="source(?:-block)?"[^>]*>[\s\S]*?<code>([\s\S]*?)<\/code>/g)]
      .flatMap(m => splitRuns(unescapeHtml(m[1]).split('\n')));
    let live = false;
    // A section with no transcription gives its live markup: the code that actually runs, less the
    // heading, the description and the section's own closing tag.
    if (!blocks.length) {
      const markup = removeAll(sec.replace(/^[^>]*>/, '').replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '')
        .replace(/<p class="pdx-txt-small[^"]*"[^>]*>[\s\S]*?<\/p>/, '').replace(/<\/section>[\s\S]*$/, ''),
        /<!--[\s\S]*?-->/g).replace(/^\s*\n/gm, '').trimEnd();
      if (/<pdx-/.test(markup)) {
        const indent = Math.min(...markup.split('\n').filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
        blocks = [{ lang: 'html', code: markup.split('\n').map(l => l.slice(indent)).join('\n').trim() }];
        live = true;
      }
    }
    if (title && blocks.length) out.push({ title, desc, blocks, live });
  }
  return out;
}

/** Tag → the demo sections that show it.
 *  - A page named for a component is that component's (comp-select → pdx-select).
 *  - A page named `<component>-<aspect>`, where the aspect is not a component itself, belongs to the
 *    longest component it starts with (comp-data-grid-editing → pdx-data-grid).
 *  - Any other page (otp-pin, row-col, password-search) gives each section to the components its code
 *    uses.
 *  - A component with no page of its own also receives every section whose code uses it:
 *    pdx-radio-group is shown on comp-radio. */
function examplesByTag() {
  const shorts = comps.map(c => c.tag.slice(4)).sort((a, b) => b.length - a.length);
  const by = new Map(comps.map(c => [c.tag, []]));
  const files = DEMO_DIRS.filter(d => existsSync(d))
    .flatMap(d => readdirSync(d).filter(n => /^comp-.+\.pdx$/.test(n)).map(n => join(d, n)))
    .sort((a, b) => a.replace(/^.*[\\/]/, '').localeCompare(b.replace(/^.*[\\/]/, '')));
  const ownerOf = (name) => shorts.includes(name) ? name : (shorts.find(x => name.startsWith(`${x}-`)) ?? null);
  const withPage = new Set(files.map(f => ownerOf(f.replace(/^.*[\\/]comp-/, '').replace(/\.pdx$/, ''))).filter(Boolean).map(s => `pdx-${s}`));
  const uses = (s, t) => s.blocks.some(b => b.lang === 'html' && new RegExp(`<${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s/>]`).test(b.code));
  for (const f of files) {
    const name = f.replace(/^.*[\\/]comp-/, '').replace(/\.pdx$/, '');
    const owner = ownerOf(name);
    // row-col, data-grid-toolbar: the rest of the name is a component too, and gets what uses it.
    const second = owner && owner !== name && shorts.includes(name.slice(owner.length + 1)) ? `pdx-${name.slice(owner.length + 1)}` : null;
    for (const s of demoSections(f)) {
      const tags = new Set(owner ? [`pdx-${owner}`] : comps.map(c => c.tag).filter(t => uses(s, t)));
      if (second && uses(s, second)) tags.add(second);
      for (const c of comps) if (!withPage.has(c.tag) && uses(s, c.tag)) tags.add(c.tag);
      for (const t of tags) by.get(t)?.push(s);
    }
  }
  return by;
}
const EXAMPLES = examplesByTag();

/** A component's page: the catalogue entry, then how it is used. */
function renderPage(c) {
  const lines = [renderComp(c), '', '#### Examples', '',
    '_From the component\'s demo, one per section. They illustrate the markup and the calls: `...` marks',
    'code left out, and a script is the part that matters, not a whole file. The props and events they use',
    'are checked against the manifest above._', ''];
  const ex = EXAMPLES.get(c.tag) || [];
  if (!ex.length) lines.push(`_No demo section shows \`<${c.tag}>\` yet: the entry above is all there is._`, '');
  for (const s of ex) {
    lines.push(`**${s.title}**${s.desc ? ' — ' + s.desc : ''}${s.live ? ' _(from the live demo)_' : ''}`, '');
    for (const b of s.blocks) lines.push('```' + b.lang, b.code, '```', '');
  }
  return lines.join('\n');
}

// ── Emit one SKILL per area: the index, and one page per component ──
const areasWith = AREAS.filter(a => comps.some(c => c.area === a.id));
for (const a of areasWith) {
  const items = comps.filter(c => c.area === a.id);
  const dir = join(SKILLS, `pdxui-${a.id}`);
  mkdirSync(dir, { recursive: true });
  rmSync(join(dir, 'references'), { recursive: true, force: true });
  mkdirSync(join(dir, 'references'), { recursive: true });
  for (const c of items) writeFileSync(join(dir, 'references', `${c.tag}.md`), renderPage(c) + '\n');
  // One description, quoted: `when_to_use` reaches Claude Code only, and an unquoted ": " is not
  // valid YAML. Codex cuts each entry at its share of the listing budget.
  const fm = ['---', `name: pdxui-${a.id}`, `description: ${JSON.stringify(a.desc)}`, '---', ''];
  const body = [
    ...fm,
    `# UI · ${a.title}`, '',
    `> ${a.blurb}  (${items.length} components)  ·  catalogue generated from the library's custom-elements manifest.`,
    `> Cross-cutting playbook, recipes and gotchas: the **\`pdxui\`** skill.`,
    // Which spelling a binding takes, stated here so an agent does not have to measure it.
    '> **Names.** Bind a prop by its kebab-case name, `:max-height="620"`, `:empty-title="t"`: the component',
    '> receives the camelCase prop (`maxHeight`). In a `.pdx` template the camelCase form, `:maxHeight`, compiles',
    '> to the same binding. **Attr** is the HTML attribute for a static value — `maxheight`, and `max-height` too.', '',
    '## Components', '',
    'Each page has the props, events, slots and API, the notes, and the examples of the component\'s demo.', '',
    ...items.map(c => `- [\`<${c.tag}>\`](references/${c.tag}.md) — ${c.summary || ''}`),
  ].join('\n');
  writeFileSync(join(dir, 'SKILL.md'), body + '\n');
}

// ── Emit the area index into the general skill ──
const idx = ['# Component catalogue — index by area', '',
  `> ${comps.length} components across ${areasWith.length} areas. Each area is a **skill of its own**, \`pdxui-<area>\``,
  '> (with its props/events catalogue). **Look here before building: the component almost always exists already.**', ''];
for (const a of areasWith) {
  const items = comps.filter(c => c.area === a.id);
  idx.push(`## ${a.title} — skill \`pdxui-${a.id}\``, '', a.blurb, '');
  for (const c of items) idx.push(`- \`<${c.tag}>\` — ${c.summary || ''}`);
  idx.push('');
}
idx.push('## Strings the components render', '',
  'Every key `@pdxui/ui` and `@pdxui/router` register, with its English default: `component-strings.md`.', '');
idx.push('## What core and the router export', '',
  'Every value export of `@pdxui/core` and `@pdxui/router`, with its signature, its doc and the specifier',
  'that imports it (`mount` is in `@pdxui/core/testing`, not the barrel): `api.md`. Generated by',
  '`packages/site/scripts/gen-api.mjs`, the same page the site serves as docs/api.', '');
mkdirSync(join(GENERAL, 'references'), { recursive: true });
writeFileSync(join(GENERAL, 'references', 'README.md'), idx.join('\n') + '\n');

// ── Emit the component-strings reference ──
//
// To stop shipping "Close dialog" in its accessibility tree an Italian app needs the keys, and they
// are declared in fifteen places (shared/i18n.ts, data-grid/grid-i18n.ts, the router's outlet.ts, …).
// So the table is generated from them, and ui's component-strings-reference.test.ts checks it against
// what the modules register at runtime.
const tsc = createRequire(join(UI, 'packages/ui/package.json'))('typescript');

/** Every .ts under `dir`, declarations and tests excluded. */
function tsFiles(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) tsFiles(p, acc);
    else if (f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.test.ts')) acc.push(p);
  }
  return acc;
}

/** `{ key: 'default', … }` → [key, default] for the string-valued entries of an object literal. */
function stringEntries(obj) {
  const out = [];
  for (const p of obj.properties) {
    if (!tsc.isPropertyAssignment(p)) continue;
    const key = tsc.isIdentifier(p.name) || tsc.isStringLiteralLike(p.name) ? p.name.text : null;
    if (key && tsc.isStringLiteralLike(p.initializer)) out.push([key, p.initializer.text]);
  }
  return out;
}

/**
 * Every component string declared in the sources: `registerComponentStrings('c', { … })` calls, and
 * the `DEFAULTS` table in ui's shared/i18n.ts, which registers each of its entries in a loop.
 */
function componentStrings() {
  const rows = [];
  const packages = [['ui', join(UI, 'packages/ui/src')], ['router', join(UI, 'packages/router/src')]];
  for (const [pkg, src] of packages) {
    for (const file of tsFiles(src)) {
      const text = readFileSync(file, 'utf8');
      if (!/registerComponentStrings|const DEFAULTS/.test(text)) continue;
      const sf = tsc.createSourceFile(file, text, tsc.ScriptTarget.Latest, true);
      const where = `@pdxui/${pkg}/src/${relative(src, file).replace(/\\/g, '/')}`;
      const visit = (n) => {
        if (tsc.isCallExpression(n) && tsc.isIdentifier(n.expression) && n.expression.text === 'registerComponentStrings'
          && n.arguments.length === 2 && tsc.isStringLiteralLike(n.arguments[0]) && tsc.isObjectLiteralExpression(n.arguments[1])) {
          for (const [key, value] of stringEntries(n.arguments[1])) rows.push({ component: n.arguments[0].text, key, value, where });
        }
        if (tsc.isVariableDeclaration(n) && tsc.isIdentifier(n.name) && n.name.text === 'DEFAULTS'
          && n.initializer && tsc.isObjectLiteralExpression(n.initializer)) {
          for (const p of n.initializer.properties) {
            if (!tsc.isPropertyAssignment(p) || !tsc.isObjectLiteralExpression(p.initializer)) continue;
            const component = tsc.isIdentifier(p.name) || tsc.isStringLiteralLike(p.name) ? p.name.text : null;
            if (!component) continue;
            for (const [key, value] of stringEntries(p.initializer)) rows.push({ component, key, value, where });
          }
        }
        tsc.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return rows.sort((a, b) => a.component.localeCompare(b.component) || a.key.localeCompare(b.key));
}

const strings = componentStrings();
const cell = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|') + '`';
const stringsDoc = [
  '# Component strings — every key, its English default, where it is declared', '',
  `> Generated from the sources. ${strings.length} keys in ${new Set(strings.map(r => r.component)).size} components.`, '',
  'Override any of them with **one** call, **before the app mounts** — see the recipe "An app that is not in',
  'English":', '',
  '```js',
  "import { setLocaleStrings } from '@pdxui/core';",
  "setLocaleStrings({ dialog: { close: 'Chiudi' }, pagination: { previous: 'Precedente' } });",
  '```', '',
  'There is one registry. The last column only says where the English default is written: most live in',
  '`@pdxui/ui/src/shared/i18n.ts`, and a component with many strings (the grid, the date picker, the',
  'router) declares its own. An override reaches either the same way. `{n}` and the other `{name}`s are',
  'placeholders, filled at render: keep them in the translation.', '',
  '| component | key | English default | declared in |',
  '|---|---|---|---|',
  ...strings.map(r => `| \`${r.component}\` | \`${r.key}\` | ${cell(r.value)} | \`${r.where}\` |`),
];
writeFileSync(join(GENERAL, 'references', 'component-strings.md'), stringsDoc.join('\n') + '\n');

// ── Remove any references/area-*.md: each area is a separate skill ──
const refDir = join(GENERAL, 'references');
for (const f of readdirSync(refDir)) if (/^area-.*\.md$/.test(f)) rmSync(join(refDir, f));

console.log(`Generated ${areasWith.length} area skills (pdxui-*) + the index. ${comps.length} components.`);
