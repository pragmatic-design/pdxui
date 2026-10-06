// pdx new <type> <name> — scaffold components, pages, or projects.

import { defineCommand } from 'citty';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'pathe';
import { logger } from '../utils/logger';
import { agentsMd } from '../templates/agents-md';
import { findCliPackage } from '../mcp/docs';

export default defineCommand({
    meta: { name: 'new', description: 'Scaffold component, page, or project' },
    args: {
        type: { type: 'positional', description: 'Type: component | page | project', required: true },
        name: { type: 'positional', description: 'Name (kebab-case)', required: true },
        dir: { type: 'string', description: 'Output directory', default: '.' },
    },
    async run({ args }) {
        const type = args.type as string;
        const name = args.name as string;
        const dir = args.dir as string;

        const kebab = toKebab(name);
        if (!kebab) {
            // Nothing survived sanitising ('...', '///'), so there is no name to scaffold under.
            // Silently continuing would create a project directory named '' — that is, in `--dir`.
            logger.error(`Invalid name: ${JSON.stringify(name)}. Use letters, digits and hyphens.`);
            process.exit(1);
        }
        const pascal = toPascal(kebab);
        const tag = `pdx-${kebab}`;

        const vars: Record<string, string> = {
            '{{NAME}}': kebab,
            '{{TAG}}': tag,
            '{{PASCAL_NAME}}': pascal,
            '{{CAMEL_NAME}}': kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
        };

        switch (type) {
            case 'component': {
                const template = loadTemplate('component.pdx.tmpl');
                const content = applyVars(template, vars);
                const outPath = resolve(dir, `${kebab}.pdx`);
                mkdirSync(dirname(outPath), { recursive: true });
                writeFileSync(outPath, content);
                logger.success(`Created component: ${outPath}`);
                break;
            }
            case 'page': {
                const template = loadTemplate('page.pdx.tmpl');
                const content = applyVars(template, vars);
                const outDir = resolve(dir, 'src', 'routes');
                mkdirSync(outDir, { recursive: true });
                const outPath = join(outDir, `${kebab}.pdx`);
                writeFileSync(outPath, content);
                logger.success(`Created page: ${outPath}`);
                break;
            }
            case 'project': {
                // kebab, not the raw argument: `name` is what to CALL the project, and --dir
                // already answers where to put it. Passing the raw string made this the only
                // branch where the positional was a path, and made the npm "name" field whatever
                // the user typed.
                scaffoldProject(kebab, dir, vars);
                break;
            }
            default:
                logger.error(`Unknown type: ${type}. Use: component | page | project`);
                process.exit(1);
        }
    },
});

function loadTemplate(name: string): string {
    const templateDir = resolve(dirname(new URL(import.meta.url).pathname), '../../templates');
    const path = join(templateDir, name);
    if (!existsSync(path)) {
        // Fallback: inline templates
        return getInlineTemplate(name);
    }
    return readFileSync(path, 'utf-8');
}

function applyVars(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replaceAll(key, value);
    }
    return result;
}

function scaffoldProject(name: string, baseDir: string, vars: Record<string, string>): void {
    const dir = resolve(baseDir, name);
    mkdirSync(join(dir, 'src'), { recursive: true });

    // The release this CLI ships with, read from its own package.json, never a literal: a literal
    // range drifts until it matches nothing that is published, and the scaffold does not install.
    // The CLI is a dev dependency of the project, as the docs say, or its own scripts have no `pdx` to run.
    const cli = findCliPackage();
    const range = `^${cli?.version ?? '0.0.0'}`;
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'pdx dev', build: 'pdx build', check: 'pdx check' },
        dependencies: { '@pdxui/framework': range },
        devDependencies: { '@pdxui/cli': range, '@pdxui/compiler': range, 'vite': cli?.vite ?? '^6.4.2' },
    }, null, 2));

    // The design system once, through the package the project depends on; then the app, placed: the
    // page loaded App.pdx and never put `<pdx-app>` in it, so it rendered nothing. `pdx-scheme`
    // because the tokens' light-dark() needs one to resolve.
    writeFileSync(join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="en" pdx-scheme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${vars['{{PASCAL_NAME}}']}</title>
</head>
<body>
  <pdx-app></pdx-app>
  <script type="module">
    import '@pdxui/framework/css';
    import './src/App.pdx';
  </script>
</body>
</html>`);

    writeFileSync(join(dir, 'src', 'App.pdx'), `<template>
  <div class="app">
    <h1>{{ title }}</h1>
    <p>Welcome to your Pragmatic app!</p>
  </div>
</template>

<script setup>
  let title = $signal('${vars['{{PASCAL_NAME}}']}');
</script>

<style scoped>
  .app { max-width: 800px; margin: 0 auto; padding: var(--pdx-space-xl); font-family: var(--pdx-font-sans); }
  h1 { color: var(--pdx-color-primary-ink); }
</style>`);

    writeFileSync(join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import { pdx } from '@pdxui/compiler';

export default defineConfig({
  plugins: [pdx()],
});`);

    // What an AI agent opened here reads first: the loop, the sources, the rules.
    writeFileSync(join(dir, 'AGENTS.md'), agentsMd(name));

    logger.success(`Project created: ${dir}/`);
    logger.info('Next steps:');
    logger.info(`  cd ${name}`);
    logger.info('  npm install');
    // Through the project's script: `pdx` is in node_modules/.bin, not on the PATH.
    logger.info('  npm run dev');
}

function getInlineTemplate(name: string): string {
    if (name === 'component.pdx.tmpl') return `<template>
  <div class="{{TAG}}">
    <h3>{{ label }}</h3>
    <slot></slot>
  </div>
</template>

<script setup>
  @prop label: string = '{{PASCAL_NAME}}';
</script>

<style scoped>
  .{{TAG}} { padding: 1rem; }
</style>`;

    if (name === 'page.pdx.tmpl') return `<template>
  <div class="{{TAG}}-page">
    <h2>{{ title }}</h2>
  </div>
</template>

<script setup>
  @page '/{{NAME}}';
  let title = $signal('{{PASCAL_NAME}}');
</script>

<style scoped>
  .{{TAG}}-page { padding: 1rem; }
</style>`;

    return '';
}

/**
 * The `name` positional, reduced to something usable as a filename, a directory name and an npm
 * package name at once.
 *
 * Everything outside [a-z0-9-] becomes a hyphen, which is what makes a path separator harmless: the
 * result cannot traverse. Runs of hyphens then collapse and the ends are trimmed, so
 * `../../Evil Widget` gives `evil-widget` rather than `------evil-widget` — a valid name either way,
 * but only one of them is a name someone would have typed.
 *
 * Exported so the behaviour is testable directly, not only through what it writes to disk.
 */
export function toKebab(s: string): string {
    return s
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function toPascal(s: string): string {
    return s.split(/[-_\s]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
