// Scanner — find all .pdx files in project.

import { findFiles } from '../find-files';

/**
 * Scan for .pdx files in a directory.
 * Ignores node_modules and dist by default.
 */
export async function scanPdxFiles(root: string, patterns?: string[]): Promise<string[]> {
    const globs = patterns ?? ['**/*.pdx'];
    return findFiles(globs, {
        cwd: root,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });
}
