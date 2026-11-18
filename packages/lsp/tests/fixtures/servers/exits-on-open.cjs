// Planted for stdio-harness.test.ts (#1184): a language server that answers the handshake, then exits
// on the first file it is given, as a server that crashes mid-sweep does.
const { createConnection, ProposedFeatures } = require('vscode-languageserver/node');

const conn = createConnection(ProposedFeatures.all);
conn.onInitialize(() => ({ capabilities: { textDocumentSync: 1 } }));
conn.onDidOpenTextDocument(() => {
    process.stderr.write('planted: the server gives up on its first file\n');
    process.exit(3);
});
conn.listen();
