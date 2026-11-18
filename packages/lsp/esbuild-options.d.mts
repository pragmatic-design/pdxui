import type { BuildOptions } from 'esbuild';

/** The options every LSP bundle shares — see esbuild-options.mjs. */
export declare const bundleOptions: BuildOptions;

/** The externals of the server `@pdxui/lsp` publishes: TypeScript is the project's (#1214). */
export declare const serverExternal: string[];

/** The externals of the VS Code extension's server, which carries TypeScript. */
export declare const extensionServerExternal: string[];
