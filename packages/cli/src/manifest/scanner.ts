// Scanner — find all .pdx files in project.

import fg from 'fast-glob';

/**
 * Scan for .pdx files in a directory.
 * Ignores node_modules and dist by default.
 */
export async function scanPdxFiles(root: string, patterns?: string[]): Promise<string[]> {
    const globs = patterns ?? ['**/*.pdx'];
    return fg(globs, {
        cwd: root,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });
}
