#!/usr/bin/env node
// `pdx-lsp`: what an editor launches (`pdx-lsp --stdio`). The server starts when its bundle loads.
// A committed launcher rather than the bundle itself: the bundle has no shebang, and it does not exist
// until the package is built — so pointing the bin at it broke on Linux and macOS and made a fresh
// `pnpm install` warn. packages/lsp/tests/bin.test.ts holds it to that.
require('../dist/server.cjs');
