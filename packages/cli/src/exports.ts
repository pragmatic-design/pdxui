// Public API exports — for programmatic use and pdx.config.ts.

export { defineConfig } from './config/schema';
export type { PdxConfig, ResolvedConfig } from './config/schema';
export type { PdxManifest, ComponentManifest, RouteManifest } from './manifest/schema';
export { analyzeComponent } from './manifest/generator';
export { scanPdxFiles } from './manifest/scanner';
