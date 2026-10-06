// Project structure detection — convention over configuration.

import { join } from 'pathe';
import { existsSync } from 'fs';

/** Detect HTML entry point. */
export function detectEntry(cwd: string): string | null {
    const candidates = [
        join(cwd, 'index.html'),
        join(cwd, 'src', 'index.html'),
    ];
    return candidates.find(c => existsSync(c)) ?? null;
}

/** Detect App component. */
export function detectAppComponent(cwd: string): string | null {
    const candidates = [
        join(cwd, 'src', 'App.pdx'),
        join(cwd, 'App.pdx'),
    ];
    return candidates.find(c => existsSync(c)) ?? null;
}

/** Detect if a directory exists. */
export function hasDir(cwd: string, dir: string): boolean {
    return existsSync(join(cwd, dir));
}
