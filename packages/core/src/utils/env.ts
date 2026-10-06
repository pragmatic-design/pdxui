// Is this a development build? A CONSTANT, because the answer has to disappear from a production
// bundle along with everything it guards.
//
// Bundlers (Vite/webpack/rollup/esbuild) statically replace the LITERAL expression
// `process.env.NODE_ENV`, so it has to be written exactly that way. Read through
// `globalThis.process`, which no bundler rewrites and no browser defines, it would return false in
// every browser, dev and prod alike — the devtools hook never installed and every dev-only warning
// in core silent. Only Node (the tests) would see true.
//
// A const, not a FUNCTION like `isDevEnv()`: a call the minifier will not inline is a branch it
// cannot fold, so `if (isDevEnv()) console.warn('…')` ships the message to every visitor whether or
// not it could ever be printed — on the showcase, 27 `console.warn|error` calls and 1441 bytes of
// `[pdx…]` text in a production build. As a const the whole branch folds away with its string.
//
// ⚠️ Written BARE, with no `typeof process` guard, and that is deliberate. The guard is wrong twice
// over: `typeof process !== 'undefined' && …` survives esbuild alone (only Rollup folds it), and
// where it does survive it is FALSE in a browser — a dev build with every diagnostic silent. The
// bare form has one requirement instead: whoever
// builds for a place with no `process` has to replace it. The CDN bundle does, in
// `vite.config.iife.ts`; every other consumer is a bundler, and replacing this is what bundlers do.
//
// Vite's library build leaves `process.env.*` in the published dist on purpose, so the consuming
// app's bundler decides — which is why a package published from here still carries its diagnostics
// and a consumer's production build still drops them.
declare const process: { env: { NODE_ENV?: string } };

/**
 * True in a development build, false in a production one — a constant, folded by the bundler.
 *
 * Guard a message that teaches the author something with it, and the branch leaves the production
 * bundle with its string: `if (DEV) console.warn('…')`. Never guard BEHAVIOUR with it — behaviour
 * that only happens in dev is a difference between what you tested and what you shipped.
 */
export const DEV = process.env.NODE_ENV !== 'production';
