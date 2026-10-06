// URI helpers shared by the language server.

/**
 * Convert an absolute file path to a `file://` URI in the SAME shape VS Code emits.
 *
 * On Windows, VS Code (via vscode-uri) lowercases the drive letter and percent-encodes
 * the colon: `C:\Users\a.pdx` → `file:///c%3A/Users/a.pdx`. If the server produced
 * `file:///C:/Users/a.pdx` instead, `documents.get(pathToUri(p))` would MISS the open
 * buffer and silently fall back to stale disk content. Matching the client form
 * makes the lookup hit.
 */
export function pathToUri(filePath: string): string {
    let normalized = filePath.replace(/\\/g, '/');
    // Windows drive: lowercase letter + %3A-encoded colon, matching VS Code's URI form.
    normalized = normalized.replace(/^([A-Za-z]):/, (_m, drive: string) => `${drive.toLowerCase()}%3A`);
    return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}
