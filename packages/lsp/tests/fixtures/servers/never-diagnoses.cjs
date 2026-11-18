// Planted for stdio-harness.test.ts (#1184): a language server that answers the handshake and stays
// alive, but never publishes diagnostics, as a server too slow for the sweep does.
const { createConnection, ProposedFeatures } = require('vscode-languageserver/node');

const conn = createConnection(ProposedFeatures.all);
conn.onInitialize(() => ({ capabilities: { textDocumentSync: 1 } }));
conn.onDidOpenTextDocument(() => {});
conn.listen();
