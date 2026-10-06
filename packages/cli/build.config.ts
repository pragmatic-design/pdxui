import { defineBuildConfig } from 'unbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

export default defineBuildConfig({
    entries: ['src/index'],
    externals: ['vite', '@pdxui/compiler', '@pdxui/lsp', '@pdxui/lsp/typecheck'],
    rollup: { emitCJS: false },
    declaration: true,
    hooks: {
        // `pdx mcp`'s `docs` tool answers from the documentation of this version: the site's
        // `llms-full.txt`, generated now and copied beside the CLI.
        'build:done'(ctx) {
            const site = join(ctx.options.rootDir, '..', 'site');
            execFileSync(process.execPath, [join(site, 'scripts', 'gen-llms.mjs')], { cwd: site, stdio: 'inherit' });
            copyFileSync(join(site, 'public', 'llms-full.txt'), join(ctx.options.outDir, 'llms-full.txt'));
        },
    },
});
