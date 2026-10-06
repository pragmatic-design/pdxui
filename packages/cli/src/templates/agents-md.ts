// AGENTS.md — what `pdx new project` tells an AI agent opened in the project.
//
// AGENTS.md is the cross-agent convention: one file, read by Claude Code, Codex, Cursor and the
// rest, so there is no tool-specific copy. It says what PDX is, the loop that keeps a change honest
// (write, check, fix, re-check), where the truth is — the skills, the docs, the project's own
// manifest, the running app — and the rules most often broken.
//
// The rules are the `pdxui` skill's ("The rules most often broken" in its SKILL.md), word for word:
// the skill is where they are written and reviewed. A test compares the two and fails when one
// changes alone. Kept in source rather than in a template file, because the CLI ships `dist/` only
// and this text has to reach an installed CLI.

/** The rules, as the `pdxui` skill lists them. */
export const AGENTS_RULES: readonly string[] = [
    'Bind with `:attr="expr"`, never `${expr}` inside an attribute: `pdx check` flags it as `PDX_RAW_INTERPOLATION` and offers the rewrite.',
    'Do not import library components in a `.pdx`: the compiler imports each `<pdx-*>` the template uses, and `import \'@pdxui/ui\'` registers all 115 of them.',
    'Search the catalog before building a component: one almost always exists (the area skills, or `components` in `pdx mcp`).',
    'Style with the design tokens (`--pdx-color-*`, `--pdx-space-*`, `--pdx-radius-*`), never hard-coded colours; the scales are named (`--pdx-space-md`), and `--pdx-space-4` resolves to nothing, silently.',
    '`onMount` runs once: anything that must follow a signal is a `$derived` or an `$effect`.',
];

/** The rules the skill's SKILL.md lists under "The rules most often broken", in order. */
export function skillRules(skillMd: string): string[] {
    const text = skillMd.replace(/\r\n/g, '\n');
    const start = text.indexOf('## The rules most often broken');
    if (start < 0) return [];
    const after = text.slice(start).split('\n').slice(1);
    const end = after.findIndex((l) => l.startsWith('## '));
    return (end < 0 ? after : after.slice(0, end))
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim());
}

/** The template's rules the skill no longer says word for word — empty when the two agree. */
export function rulesMissingFrom(skillMd: string): string[] {
    const said = new Set(skillRules(skillMd));
    return AGENTS_RULES.filter((r) => !said.has(r));
}

/** AGENTS.md for a project called `name`. */
export function agentsMd(name: string): string {
    return `# ${name} — notes for an AI agent

This is a PDX app. PDX compiles \`.pdx\` single-file components — a \`<template>\`, a
\`<script setup>\` with runes such as \`$signal\` and \`@prop\`, a \`<style scoped>\` — into standard
Web Components, and ships a library of \`pdx-*\` components and a design system.

## The loop

Every change goes round this loop until the check is clean:

1. Write or edit the \`.pdx\`.
2. \`npx pdx check --json\` — every finding with its code, its \`file:line:column\`, a hint, and,
   when it has one, a \`fix\` as text edits.
3. Apply the \`fix\` edits, or let \`npx pdx check --fix\` apply them; then check again — a fix can
   uncover what the finding hid.
4. \`npx pdx check --types\` — the TypeScript check of scripts and templates, as the editor shows it.
5. A code you do not know: \`npx pdx explain <CODE>\`.

Then run the app (\`npx pdx dev\`) and measure what you changed in the browser.

## Where the truth is

- **The skills** — the language, every component one page each, screen recipes, the traps:
  - Claude Code: \`claude plugin marketplace add pragmatic-design/skills\`, then
    \`claude plugin install pdxui@pragmatic-design\`
  - Codex: \`codex plugin marketplace add pragmatic-design/skills\`, then
    \`codex plugin add pdxui@pragmatic-design\`
- **The docs, for a model** — https://pdxui.com/llms.txt (an index) and
  https://pdxui.com/llms-full.txt (everything).
- **This project** — \`npx pdx analyze --json\` prints its components, their props, events and
  slots, and the route table.
- **The running app** — in development, \`window.__PDX_DEVTOOLS__\` answers in JSON:
  \`__PDX_DEVTOOLS__.tree()\`, \`.inspect('pdx-app')\`, \`.errors()\`, \`.route()\`.
- **As tools** — \`npx pdx mcp\` serves check, explain, component, components, project and docs to an
  agent that speaks MCP (\`claude mcp add pdx -- npx pdx mcp\`).

## The rules most often broken

${AGENTS_RULES.map((r) => `- ${r}`).join('\n')}
`;
}
