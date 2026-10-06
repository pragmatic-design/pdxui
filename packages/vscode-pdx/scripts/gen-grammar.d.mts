// Types of gen-grammar.mjs, for the test that imports it (packages/lsp/tests/grammar.test.ts).
export const GRAMMAR_PATH: string;
export function generateGrammar<G>(grammar: G, runes: readonly { name: string; kind: 'decorator' | 'function' }[]): G;
export function grammarText(grammar: unknown): string;
