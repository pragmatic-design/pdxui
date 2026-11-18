import { defineBuildConfig } from 'unbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Every `.mjs` the build wrote, at any depth. */
function builtModules(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory()
        ? builtModules(join(dir, e.name))
        : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []);
}

export default defineBuildConfig({
    entries: ['src/index'],
    externals: ['vite', '@pdxui/compiler', '@pdxui/lsp/typecheck'],
    rollup: {
        emitCJS: false,
        // `pdx check --types` runs lsp's type-check, and only that (#1202): the CLI ships the one
        // file, copied below beside its own modules, instead of depending on the whole language
        // server. The source keeps importing `@pdxui/lsp/typecheck`, a dev dependency here, so the
        // tests run it from the workspace; the build points that import at the copy. The chunk that
        // imports it sits in `dist/chunks/`, so the path climbs one level.
        output: { paths: { '@pdxui/lsp/typecheck': '../typecheck.cjs' } },
    },
    declaration: true,
    hooks: {
        'build:done'(ctx) {
            // `pdx mcp`'s `docs` tool answers from the documentation of this version: the site's
            // `llms-full.txt`, generated now and copied beside the CLI.
            const site = join(ctx.options.rootDir, '..', 'site');
            execFileSync(process.execPath, [join(site, 'scripts', 'gen-llms.mjs')], { cwd: site, stdio: 'inherit' });
            copyFileSync(join(site, 'public', 'llms-full.txt'), join(ctx.options.outDir, 'llms-full.txt'));

            // The type-check, built by lsp (which the workspace builds first, as a dependency of this
            // package). Self-contained: the compiler is bundled into it, and TypeScript is required
            // from where it is installed — the CLI names it as an optional peer, as lsp does.
            const typecheck = join(ctx.options.rootDir, '..', 'lsp', 'dist', 'typecheck.cjs');
            if (!existsSync(typecheck)) throw new Error(`${typecheck} is not built: run lsp's build before the CLI's`);
            const copy = join(ctx.options.outDir, 'typecheck.cjs');
            // Without its map, which the CLI does not ship: the comment would name a missing file.
            writeFileSync(copy, readFileSync(typecheck, 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'));

            // The import's path is relative to the chunk Rollup put it in, which this config does
            // not choose: check that every chunk importing the type-check reaches the copy.
            const importers = builtModules(ctx.options.outDir)
                .map((file) => ({ file, specifier: readFileSync(file, 'utf8').match(/import\(['"]([^'"]*typecheck[^'"]*)['"]\)/)?.[1] }))
                .filter((m): m is { file: string; specifier: string } => m.specifier !== undefined);
            if (importers.length === 0) throw new Error('no built module imports the type-check: `pdx check --types` would not run it');
            for (const { file, specifier } of importers) {
                if (resolve(dirname(file), specifier) !== copy) throw new Error(`${file} imports ${specifier}, which is not ${copy}`);
            }
        },
    },
});
