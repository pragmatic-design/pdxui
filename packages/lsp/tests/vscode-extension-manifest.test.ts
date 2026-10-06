// The VS Code extension, as the Marketplace will read it. A local .vsix installs without any of
// this, so nothing else catches a publisher that does not exist, a missing icon or changelog, a
// version unrelated to the release, or a packaging command that skips the licence.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXT = join(__dirname, '..', '..', 'vscode-pdx');
const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf-8')) as Record<string, unknown> & {
    scripts: Record<string, string>; engines: { vscode: string }; categories?: string[]; keywords?: string[];
    repository?: { url?: string; directory?: string }; homepage?: string; bugs?: { url?: string };
};
const npm = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
    repository: { url: string }; homepage: string; bugs: { url: string };
};

/** Width and height of a PNG, from its IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
    const b = readFileSync(file);
    expect(b.subarray(1, 4).toString('ascii'), `${file} is not a PNG`).toBe('PNG');
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('the extension manifest', () => {
    it('is published by pdxui, at 0.9.0', () => {
        expect(pkg.publisher).toBe('pdxui');
        // The Marketplace takes major.minor.patch only, with no semver pre-release tag: a 0.x
        // pre-release line leaves 1.0.0 for the stable.
        expect(pkg.version).toBe('0.9.0');
        expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('packages as a pre-release, with its licence, after a build', () => {
        expect(pkg.scripts.package).toContain('--pre-release');
        expect(pkg.scripts.package).not.toContain('--skip-license');
        expect(pkg.scripts['vscode:prepublish'], 'no build before vsce packages').toBeTruthy();
        // Pre-release extensions need VS Code 1.63 or later.
        expect(Number(/(\d+)\.(\d+)/.exec(pkg.engines.vscode)![2])).toBeGreaterThanOrEqual(63);
    });

    it('has a 128×128 PNG icon', () => {
        expect(pkg.icon).toBe('images/icon.png');
        expect(pngSize(join(EXT, 'images', 'icon.png'))).toEqual({ width: 128, height: 128 });
    });

    it('has a changelog that starts at its version, and a licence', () => {
        const changelog = readFileSync(join(EXT, 'CHANGELOG.md'), 'utf-8');
        expect(changelog).toMatch(/^## 0\.9\.0/m);
        expect(existsSync(join(EXT, 'LICENSE'))).toBe(true);
    });

    it('says where it comes from, as the npm packages do', () => {
        expect(pkg.repository?.url).toBe(npm.repository.url);
        expect(pkg.repository?.directory).toBe('packages/vscode-pdx');
        expect(pkg.homepage).toBe(npm.homepage);
        expect(pkg.bugs?.url).toBe(npm.bugs.url);
        expect(pkg.categories).toEqual(expect.arrayContaining(['Programming Languages', 'Linters', 'Formatters']));
        expect(pkg.keywords).toEqual(expect.arrayContaining(['pdx', 'web components']));
    });

    it('documents its setting', () => {
        expect(readFileSync(join(EXT, 'README.md'), 'utf-8')).toContain('pdx.typeCheck');
    });
});
