// A save that changes only a `<style>` block swaps the style; it does not re-render (#246).
//
// In development each style block is a `<style id="pdx-s-<hash>[-<index>]">` the module writes
// (codegen-styles.ts). A full HMR update re-runs every live instance's render, which rebuilds its
// elements: focus, scroll and what was typed into an unbound input are lost, for a colour. When the
// source differs only inside its style blocks, rewriting those elements' text is the whole update.

import { parseSFC, type SFCDescriptor } from './parser/sfc';
import { extractCSSBindings, hash, styleBlocks, styleCssFor } from './compiler/codegen-styles';

/** One style element to rewrite: its id, and the CSS it holds now. */
export interface StyleSwap {
    id: string;
    css: string;
}

/** The custom HMR event the plugin sends and the injected module code listens for. */
export const STYLE_EVENT = 'pdx:style';

/**
 * The style swaps that turn `prev` into `next`, or null when the change is more than that and needs
 * a full update. An empty list means nothing changed.
 *
 * A style swap needs:
 * - the same source outside the content of the style blocks: the template, the script and every
 *   block's opening tag (so its `scoped`, its `lang`) as they were;
 * - inline blocks only: a `src=` block's CSS lives in another file;
 * - the same `bind()` names in each block: a name is a custom property the setup sets, so a new one
 *   changes the module's code;
 * - a light-DOM component: a `<template shadow>`'s CSS is adopted in its setup, not in a head element.
 */
export function styleOnlyUpdate(prev: string, next: string, filename: string): StyleSwap[] | null {
    if (prev === next) return [];
    const before = parseSFC(prev);
    const after = parseSFC(next);
    if (before.errors?.length || after.errors?.length) return null;
    if (before.template?.shadow || after.template?.shadow) return null;

    const oldBlocks = styleBlocks(before);
    const newBlocks = styleBlocks(after);
    if (oldBlocks.length !== newBlocks.length || newBlocks.length === 0) return null;
    if (newBlocks.some((b) => b.src !== null) || oldBlocks.some((b) => b.src !== null)) return null;
    if (withoutStyles(prev, before) !== withoutStyles(next, after)) return null;

    const swaps: StyleSwap[] = [];
    const id = hash(filename);
    for (let i = 0; i < newBlocks.length; i++) {
        if (oldBlocks[i].content === newBlocks[i].content) continue;
        const scope = `data-pdx-${id}`;
        const names = (css: string) => extractCSSBindings(css, scope).join('\n');
        if (names(oldBlocks[i].content) !== names(newBlocks[i].content)) return null;
        swaps.push({ id: `pdx-s-${i === 0 ? id : `${id}-${i}`}`, css: styleCssFor(after, filename, i, false) });
    }
    return swaps;
}

/** The source with every style block's content cut out, its tags kept. */
function withoutStyles(source: string, descriptor: SFCDescriptor): string {
    let out = '';
    let at = 0;
    for (const block of styleBlocks(descriptor)) {
        out += source.slice(at, block.start);
        at = block.end;
    }
    return out + source.slice(at);
}

/**
 * The listener a development module carries: it rewrites the style elements named in a
 * `pdx:style` event. Every module of the page receives the event; one whose element is not on the
 * page writes nothing.
 */
export function styleSwapListener(): string {
    return `  import.meta.hot.on('${STYLE_EVENT}', (data) => {
    for (const s of data.styles) {
      const el = document.getElementById(s.id);
      if (el) el.textContent = s.css;
    }
  });
`;
}
