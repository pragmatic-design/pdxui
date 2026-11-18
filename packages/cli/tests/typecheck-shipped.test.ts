// The CLI ships the type-check it runs, and not the language server (#1202).
//
// `pdx check --types` runs lsp's `typecheck.cjs`, 0.7 MB. Depending on `@pdxui/lsp` for it put the
// whole package in every project — 30 MB, the server with its own TypeScript and its map — which
// nothing in a project runs: VS Code's extension bundles its own server. So the CLI's build copies
// the type-check beside its own module and rewrites the import to it; lsp is a dev dependency, for
// that build and for this package's tests, which import the type-check from the workspace.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLI = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf-8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

describe('@pdxui/cli and the language server', () => {
    it('does not depend on @pdxui/lsp at run time', () => {
        expect(Object.keys(pkg.dependencies), 'an installed CLI would bring the whole language server').not.toContain('@pdxui/lsp');
        // The control: the build still has it, to copy the type-check from.
        expect(pkg.devDependencies['@pdxui/lsp']).toBe('workspace:*');
    });

    it('names TypeScript as the optional peer the type-check runs on, as lsp does', () => {
        // The type-check requires `typescript` from where it sits: in the CLI's dist/, so it is the
        // CLI that must let a strict installer link the project's TypeScript beside it.
        const lsp = JSON.parse(readFileSync(join(CLI, '..', 'lsp', 'package.json'), 'utf-8')) as typeof pkg;
        expect(pkg.peerDependencies.typescript).toBe(lsp.peerDependencies.typescript);
        expect(pkg.peerDependenciesMeta.typescript).toEqual({ optional: true });
    });
});

// That the built CLI reaches its copy is checked by the build itself (`build.config.ts`): every
// module that imports the type-check must resolve to `dist/typecheck.cjs`, or the build fails.
