// The VS Code extension declares `pdx.typeCheck` and hands it to the server, at start and on every
// change, with VS Code's own TypeScript lib for a project that has none. The extension
// has no test runner of its own; what it promises the server is read here, where the server is.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const EXT = join(__dirname, '..', '..', 'vscode-pdx');
const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf-8')) as {
    contributes: { configuration?: { properties?: Record<string, { type?: string; default?: unknown }> } };
};
const extension = readFileSync(join(EXT, 'src', 'extension.ts'), 'utf-8');

describe('the pdx.typeCheck setting', () => {
    it('is declared, a boolean on by default', () => {
        expect(pkg.contributes.configuration?.properties?.['pdx.typeCheck']).toMatchObject({ type: 'boolean', default: true });
    });

    it('reaches the server at start and on change', () => {
        expect(extension).toMatch(/initializationOptions:\s*\{[\s\S]*typeCheck:\s*workspace\.getConfiguration\('pdx'\)\.get<boolean>\('typeCheck', true\)/);
        expect(extension).toMatch(/configurationSection:\s*'pdx'/);
    });

    it('attaches the server to .pdx and .pdx.ts only, not to every .html', () => {
        const selector = /documentSelector:\s*\[([\s\S]*?)\]/.exec(extension)?.[1] ?? '';
        expect(selector).toContain("language: 'pdx'");
        expect(selector).not.toMatch(/language:\s*'html'/);
        expect(extension).not.toMatch(/createFileSystemWatcher\('[^']*html/);
    });

    it('sends VS Code\'s own TypeScript lib', () => {
        expect(extension).toMatch(/typescriptLib:/);
        expect(extension).toContain("path.join(env.appRoot, 'extensions', 'node_modules', 'typescript', 'lib')");
    });
});
