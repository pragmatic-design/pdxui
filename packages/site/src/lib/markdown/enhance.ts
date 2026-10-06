// Adds a "Copy" button to the <pre> blocks of the markdown body.
// The markdown is injected through innerHTML (HTML Shiki already rendered at build time),
// so the enhancement happens at runtime on the container, after the injection.

import { attachCopy } from '../copy';

export function enhanceCodeBlocks(root: HTMLElement): void {
    root.querySelectorAll('pre').forEach((pre) => attachCopy(pre as HTMLElement));
}
