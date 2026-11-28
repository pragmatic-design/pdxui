// The document a block's nodes are made in (#1287).

let blocks: Document | null = null;

/**
 * The inert document a `<template>`'s content belongs to, where `staticBlock` and `html``` copy a
 * block's markup. Every block helper makes its fragment and markers here. Made with the page's
 * `document`, an `@if` inside a template moved its content into the page, back into the parent block's
 * copy, and into the page again at the append — an adoption each way: pdx-form-template, two nested
 * `@if`, moved 8 elements between documents per mount where its TypeScript version moved 2, and
 * mounted 1.08–1.11× it on CI; with its markers here, 0.75×.
 *
 * One per page, as the template contents' owner document is.
 */
export function blockDocument(): Document {
    return (blocks ??= document.createElement('template').content.ownerDocument);
}
