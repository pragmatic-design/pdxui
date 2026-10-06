// Document Manager — tracks open .pdx documents with cached analysis.
// Re-analyzes on content change. Provides analysis results to capabilities.

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { analyzeDocument } from './utils/compiler-bridge';
import type { AnalysisResult, AnalyzeOptions } from './utils/compiler-bridge';

interface CachedDocument {
    version: number;
    analysis: AnalysisResult;
}

const cache = new Map<string, CachedDocument>();

// What an analysis is run with: the declared props of the components the DOCUMENT's project knows
// An analysis cached with the old set would keep warnings a rescan resolved, so setting it
// clears the cache.
let analyzeOptions: (uri: string) => AnalyzeOptions = () => ({});

/**
 * Set the options each document is analyzed with — one set for all, or a function of the
 * document's URI — and drop the analyses made without them.
 */
export function setAnalyzeOptions(options: AnalyzeOptions | ((uri: string) => AnalyzeOptions)): void {
    analyzeOptions = typeof options === 'function' ? options : () => options;
    cache.clear();
}

/** Get or create analysis for a document. Caches by version. */
export function getAnalysis(document: TextDocument): AnalysisResult {
    const uri = document.uri;
    const version = document.version;

    const cached = cache.get(uri);
    if (cached && cached.version === version) {
        return cached.analysis;
    }

    const source = document.getText();
    const filename = uriToFilename(uri);
    const analysis = analyzeDocument(source, filename, analyzeOptions(uri));

    cache.set(uri, { version, analysis });
    return analysis;
}

/** Remove a document from cache (on close). */
export function removeDocument(uri: string): void {
    cache.delete(uri);
}

/** Clear all cached documents. */
export function clearCache(): void {
    cache.clear();
}

function uriToFilename(uri: string): string {
    // file:///path/to/file.pdx -> file.pdx
    try {
        const url = new URL(uri);
        return url.pathname.split('/').pop() ?? 'unknown.pdx';
    } catch {
        return uri.split('/').pop() ?? 'unknown.pdx';
    }
}
