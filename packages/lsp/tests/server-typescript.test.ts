// Whose TypeScript the language server runs on (#1214).
//
// The server `@pdxui/lsp` publishes leaves TypeScript out of its bundle and requires it from where it is
// installed, as the type-check (`typecheck.cjs`) already does: a project's types are answered by the
// TypeScript the project pins, and the package is not 11 MB of a TypeScript nobody chose. A project
// that has the language server has TypeScript: `@pdxui/compiler`, its peer, depends on it.
//
// The VS Code extension ships a .vsix with no node_modules (`vsce package --no-dependencies`), so ITS
// server bundles TypeScript: `packages/vscode-pdx/scripts/bundle-server.mjs`, run by
// `bundled-server.test.ts`. One list of externals per artefact, in `esbuild-options.mjs`.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { build } from 'esbuild';
import { bundleOptions, serverExternal, extensionServerExternal } from '../esbuild-options.mjs';

const LSP = join(__dirname, '..');

async function serverBundle(external: string[]): Promise<string> {
    const result = await build({ ...bundleOptions, entryPoints: [join(LSP, 'src', 'server.ts')], external, write: false, logLevel: 'silent' });
    return result.outputFiles[0].text;
}

describe("the server's TypeScript", () => {
    it('the published server requires TypeScript instead of bundling it', async () => {
        expect(serverExternal).toContain('typescript');
        const code = await serverBundle(serverExternal);
        expect(code).toContain('require("typescript")');
        // TypeScript's own source carries `versionMajorMinor`; a bundle with it inside is ~11 MB.
        expect(code.includes('versionMajorMinor = '), 'TypeScript is bundled into the published server').toBe(false);
        expect(code.length / 1e6, 'the published server is not small: is TypeScript inside it?').toBeLessThan(3);
    }, 60_000);

    it("the extension's server bundles it: a .vsix has no node_modules", async () => {
        expect(extensionServerExternal).not.toContain('typescript');
        const code = await serverBundle(extensionServerExternal);
        expect(code.includes('versionMajorMinor = ')).toBe(true);
    }, 60_000);
});
