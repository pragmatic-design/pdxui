// Project Scanner — discovers .pdx files and translations in the workspace.
// Used for cross-file references and $t() key completion. Components: project-registry.ts.

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

export interface ComponentEntry {
    /** Custom element tag: 'pdx-counter' */
    tag: string;
    /** Absolute file path */
    filePath: string;
}

export interface TranslationKeys {
    /** Locale code */
    locale: string;
    /** Flat dot-notation keys */
    keys: string[];
}

/** Combined scanner result — the disk-derived workspace index. */
export interface WorkspaceIndex {
    translations: TranslationKeys[];
    pdxFiles: string[];
}

/**
 * (Re)build the workspace index from disk. Called on init AND whenever files change
 * (watcher/open) so files created after startup are seen without a restart.
 *
 * Components are not here: they are the compiler resolver's, per project (project-registry.ts).
 * This scanner walks the whole root, the build walks src/ and pages/, so a component outside them
 * would resolve in the editor and never be auto-imported by the build.
 */
export function scanWorkspace(rootDir: string): WorkspaceIndex {
    return {
        translations: scanTranslationKeys(rootDir),
        pdxFiles: scanPdxFiles(rootDir),
    };
}

/** Scan workspace for ALL .pdx file paths (no tag dedup) — used for cross-file references. */
export function scanPdxFiles(rootDir: string): string[] {
    const files: string[] = [];

    function scan(dir: string): void {
        try {
            for (const item of readdirSync(dir)) {
                if (item === 'node_modules' || item === 'dist' || item === 'out' || item.startsWith('.')) continue;
                const fullPath = join(dir, item);
                if (statSync(fullPath).isDirectory()) scan(fullPath);
                else if (item.endsWith('.pdx')) files.push(fullPath);
            }
        } catch { /* permission denied or broken symlink */ }
    }

    scan(rootDir);
    return files;
}

/**
 * The workspace's script and page files — .ts .js .mts .mjs .cjs .html, not declarations, not
 * node_modules or build output — where a component tag may be named outside a .pdx: a
 * `querySelector('pdx-x')`, an index.html. Read on demand by references and rename.
 */
export function scanTagHostFiles(rootDir: string): string[] {
    const files: string[] = [];
    function scan(dir: string): void {
        try {
            for (const item of readdirSync(dir)) {
                if (item === 'node_modules' || item === 'dist' || item === 'out' || item.startsWith('.')) continue;
                const fullPath = join(dir, item);
                if (statSync(fullPath).isDirectory()) scan(fullPath);
                else if (/\.(?:m?[jt]s|cjs|html)$/.test(item) && !item.endsWith('.d.ts')) files.push(fullPath);
            }
        } catch { /* permission denied or broken symlink */ }
    }
    scan(rootDir);
    return files;
}

/** Scan translation JSON files and extract all keys. */
export function scanTranslationKeys(rootDir: string): TranslationKeys[] {
    const result: TranslationKeys[] = [];
    const translationsDir = join(rootDir, 'src', 'translations');
    if (!existsSync(translationsDir)) return result;

    try {
        const files = readdirSync(translationsDir);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const locale = basename(file, '.json');
            const filePath = join(translationsDir, file);
            try {
                const content = JSON.parse(readFileSync(filePath, 'utf-8'));
                const keys = flattenKeys(content);
                result.push({ locale, keys });
            } catch { /* malformed JSON */ }
        }
    } catch { /* dir not readable */ }

    return result;
}

/** Flatten nested object to dot-notation keys. */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
        } else {
            keys.push(fullKey);
        }
    }
    return keys;
}
