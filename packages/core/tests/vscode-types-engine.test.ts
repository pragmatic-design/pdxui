// The VS Code extension can still be packaged: its `@types/vscode` is no newer than the VS Code it
// declares it runs on.
//
// `vsce package` refuses an extension whose `@types/vscode` has a higher major.minor than
// `engines.vscode` («@types/vscode … greater than engines.vscode …», `validateVSCodeTypesCompatibility`
// in vscode-vsce's src/validation.ts): types newer than the engine let the code call an API the
// declared VS Code does not have. Nothing in the gate packages the extension, so a dependency bump that
// moved the types alone would merge green and fail on the day of the release. The same rule, here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MANIFEST = join(__dirname, '..', '..', 'vscode-pdx', 'package.json');

/** The lowest version a range like `^1.85.0` or `~1.85` admits, as [major, minor]. */
function floor(range: string): [number, number] {
    const m = /(\d+)\.(\d+|x)/.exec(range);
    if (!m) throw new Error(`not a version range: ${range}`);
    return [Number(m[1]), m[2] === 'x' ? 0 : Number(m[2])];
}

describe('the VS Code extension', () => {
    const pkg = JSON.parse(readFileSync(MANIFEST, 'utf-8')) as {
        engines: { vscode: string };
        devDependencies: Record<string, string>;
    };

    it('declares both versions the check compares', () => {
        expect(pkg.engines.vscode).toBeTruthy();
        expect(pkg.devDependencies['@types/vscode']).toBeTruthy();
    });

    it('has @types/vscode no newer than engines.vscode, or vsce will not package it', () => {
        const [typeMajor, typeMinor] = floor(pkg.devDependencies['@types/vscode']);
        const [engineMajor, engineMinor] = floor(pkg.engines.vscode);
        const newer = typeMajor > engineMajor || (typeMajor === engineMajor && typeMinor > engineMinor);
        expect(newer, `@types/vscode ${pkg.devDependencies['@types/vscode']} is newer than engines.vscode `
            + `${pkg.engines.vscode}: lower the types, or raise the engine on purpose`).toBe(false);
    });
});
