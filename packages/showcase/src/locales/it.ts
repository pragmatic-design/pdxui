/**
 * Both Italian dictionaries in one module, so the switch costs ONE request and ONE chunk.
 *
 * Two `import()`s of the two JSON files is the obvious shape and it measured worse: Rollup emits a
 * chunk per dynamic import, each gzipped on its own, and the showcase's total JS went 209.6 KB that
 * way against **209.3** through this barrel — both dictionaries in one chunk, and the switch one
 * request instead of two.
 */
import app from './it.json';
import components from './it.components.json';

export default { app, components } as {
    app: Record<string, unknown>;
    components: Record<string, Record<string, string>>;
};
